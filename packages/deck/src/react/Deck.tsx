import {
  Children,
  cloneElement,
  type ComponentType,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";

import type { Frontmatter } from "../compiler/split.ts";
import { formatHash, parseFlags, parseHash } from "../core/hash.ts";
import { actionFor, isEditable, type KeyAction } from "../core/keyboard.ts";
import { computeLayout, type Layout, toStage } from "../core/layout.ts";
import {
  type Column,
  columnsOf,
  type DeckConfig,
  type DeckConfigInput,
  type DeckManifest,
  fromFlat,
  readHostOverride,
  resolveConfig,
  withHostOverride,
  resolveSlideOptions,
  type SlideOptions,
} from "../core/model.ts";
import * as N from "../core/navigation.ts";
import { createStore } from "../core/store.ts";
import { createSwipeTracker } from "../core/touch.ts";
import { Backgrounds } from "./Backgrounds.tsx";
import { Chrome } from "./chrome.tsx";
import {
  type DeckActions,
  DeckContext,
  type DeckRuntime,
  type TermReveal,
  type UiState,
  type ViewMode,
} from "./context.ts";
import { Lightbox } from "./Lightbox.tsx";
import { Overview } from "./Overview.tsx";
import { PrintView } from "./PrintView.tsx";
import { ScrollView } from "./ScrollView.tsx";
import { Stage } from "./Stage.tsx";
import { useTermEffects } from "./terms.ts";
import { ZoomLayer } from "./Zoom.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Deck>
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The whole runtime, from the manifest the Vite plugin emits. It owns the navigation store and
 * every side effect the browser needs — the hash, the keyboard, touch, resizing, the wake lock,
 * the idle cursor, auto-slide, fullscreen — and decides which page to show from the URL:
 *
 *   /<slug>/               the deck            (?view=scroll, ?print-pdf, #/h/v/click)
 *   /<slug>/presenter      the presenter view  (notes, timer, next slide, drawing, the room)
 *   /<slug>/join           the audience page   (follow along, react, ask, vote)
 *   /<slug>/notes          every note on one page
 *   /<slug>/stats          the deck's numbers
 *
 * Extra pages plug in through `pages` so the presenter, audience and stats modules stay optional
 * imports; a deck that never goes live ships without them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface DeckProps {
  manifest: DeckManifest;
  config?: DeckConfigInput | Frontmatter;
  components?: Record<string, ComponentType<Record<string, unknown>>>;
  /** Route → page component, for the presenter/audience/notes/stats pages. */
  pages?: Partial<Record<Exclude<ViewMode, "play" | "print">, ComponentType>>;
  /** Wraps the runtime (the live provider, a theme provider). */
  children?: ReactNode;
}

function baseOf(): string {
  const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return b.endsWith("/") ? b : `${b}/`;
}

function modeFromLocation(base: string): ViewMode {
  if (typeof window === "undefined") return "play";
  const path = window.location.pathname;
  const rest = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, "");
  const first = rest.split("/")[0]?.replace(/\.html$/, "") ?? "";
  if (first === "presenter") return "presenter";
  if (first === "join" || first === "audience") return "audience";
  if (first === "notes") return "notes";
  if (first === "stats") return "stats";
  if (parseFlags(window.location.search).print) return "print";
  return "play";
}

export function Deck({
  manifest,
  config: configIn,
  components = {},
  pages = {},
  children,
}: DeckProps) {
  const base = useMemo(baseOf, []);
  const slugFromBase = base.replace(/^\/|\/$/g, "");
  const config = useMemo(
    () =>
      withHostOverride(
        resolveConfig({ slug: slugFromBase }, manifest.headmatter, configIn),
        readHostOverride(),
      ),
    [manifest.headmatter, configIn, slugFromBase],
  );
  const columns = useMemo<Column[]>(
    () => columnsOf(manifest.slides, config),
    [manifest.slides, config],
  );
  const options = useMemo(() => {
    const map = new Map<string, SlideOptions>();
    columns.forEach((c) =>
      c.slides.forEach((s, v) =>
        map.set(`${c.h},${v}`, resolveSlideOptions(s.frontmatter, config, s.index === 0)),
      ),
    );
    return map;
  }, [columns, config]);

  const mode = useMemo(() => modeFromLocation(base), [base]);
  const flags = useMemo(
    () => parseFlags(typeof window === "undefined" ? "" : window.location.search),
    [],
  );
  const windowId = useMemo(() => Math.random().toString(36).slice(2, 10), []);
  /**
   * A PROJECTOR: a window that exists to be looked at — a second screen, or the one window you
   * share on a call. It renders the deck exactly as the deck page does; what it gives up is input.
   * No key, swipe, wheel or click reaches navigation, and the follow can never be broken, because
   * a stray press on a shared window in the middle of a call is not a thing to be recoverable
   * from. See `Flags.projector`.
   */
  const projector = mode === "play" && flags.projector;
  const projectorWindow = useMemo<{ ref: Window | null }>(() => ({ ref: null }), []);
  const sync = useMemo<DeckRuntime["sync"]>(() => ({ source: null }), []);

  // The position the URL asked for, read once: a step (#/h/v/click) cannot be applied until the
  // slide has reported its total, and the first hash write would otherwise erase it.
  const wantedAtLoad = useMemo(
    () =>
      typeof window !== "undefined"
        ? parseHash(window.location.hash, columns, config.hashOneBasedIndex)
        : null,
    [columns, config.hashOneBasedIndex],
  );
  /**
   * Does this window start in step with the presenter?
   *
   * In order of how much each signal actually knows:
   *
   *   1. `?at` — a link the deck itself minted ABOUT a slide (a share link, the phone's "Open
   *      full"). That slide is what was asked for, so it lands there, free.
   *   2. What this viewer last chose for this deck, if it is still about this talk. This is what
   *      carries a bookmark taken mid-talk, a closed tab or a sleeping phone back in step: the
   *      hash in a bookmark cannot say it, because the deck WRITES the hash as they navigate, so
   *      a bookmark's address is indistinguishable from a link someone chose to send.
   *   3. Nothing known: a plain link means "show me the talk", and a bare hash is a slide someone
   *      typed or pasted.
   */
  const startFollowing = useMemo(() => {
    if (projector) return true;
    if (flags.at) return false;
    const remembered = rememberedFollow(config);
    return remembered ?? !wantedAtLoad;
  }, [config, flags.at, projector, wantedAtLoad]);

  const nav = useMemo(() => {
    const initial = { ...N.initialNav(), follow: startFollowing };
    const fromHash = wantedAtLoad;
    return createStore(fromHash ? N.goto(initial, columns, fromHash) : initial);
  }, [columns, config.hashOneBasedIndex, startFollowing]);

  const ui = useMemo(
    () =>
      createStore<UiState>({
        help: false,
        jump: false,
        search: false,
        lightbox: null,
        zoom: null,
        drawing: false,
        pointer: false,
        spotlight: false,
        colorScheme:
          stored(config, "scheme", ["light", "dark"]) ?? resolveScheme(config.colorScheme),
        cursorHidden: false,
        fullscreen: false,
        hints: false,
        themeMenu: false,
        projectorOpen: false,
        theme: stored(config, "theme", config.themes) ?? config.theme,
        termSync:
          (stored(config, "termsync", ["on", "off"]) ?? (config.glossary.sync ? "on" : "off")) ===
          "on",
        scroll:
          mode === "play" &&
          (flags.view === "scroll" || (flags.view !== "slide" && config.view === "scroll")),
        toast: null,
      }),
    [config.colorScheme, config.view, flags.view, mode],
  );

  const layout = useMemo(() => createStore<Layout>(computeLayout(config, viewport())), [config]);

  const actions = useMemo<DeckActions>(() => {
    const withTransition = (fn: (s: N.NavState) => N.NavState) => {
      const before = nav.get();
      const moved = fn(before);
      if (moved === before) return;
      /*
       * THE FOLLOW ENDS HERE, and only here. A move this window made itself — a key, an arrow, a
       * swipe, an overview tile, a search hit, a link — is the viewer deciding to read at their own
       * pace, and from now on nothing moves them until they press Follow. Everything that arrives
       * from somewhere else carries a `sync.source`: the room, another window of this browser, the
       * deck's own auto-slide. Those leave the follow exactly as it was.
       */
      const after =
        sync.source === null && moved.follow && !projector ? { ...moved, follow: false } : moved;
      const opts = options.get(`${before.h},${before.v}`);
      const useView =
        (opts?.transition ?? config.transition) === "view-transition" &&
        "startViewTransition" in document;
      if (useView && (after.h !== before.h || after.v !== before.v)) {
        (
          document as unknown as { startViewTransition: (cb: () => void) => void }
        ).startViewTransition(() => flushSync(() => nav.set(after)));
      } else nav.set(after);
    };
    const uiToggle = (key: keyof UiState, force?: boolean) =>
      ui.update((s) => ({ ...s, [key]: force ?? !s[key] }));
    return {
      next: () => withTransition((s) => N.next(s, columns, config)),
      prev: () => withTransition((s) => N.prev(s, columns, config)),
      nextSlide: () =>
        withTransition((s) =>
          N.availableRoutes(s, columns, config).down
            ? N.down(s, columns)
            : N.right(s, columns, config),
        ),
      prevSlide: () =>
        withTransition((s) =>
          N.availableRoutes(s, columns, config).up ? N.up(s, columns) : N.left(s, columns, config),
        ),
      // reveal.js's arrows: steps first, then the next column (the whole deck in linear mode).
      left: () =>
        withTransition((s) => {
          if (s.click > 0) return N.prevClick(s);
          if (config.navigationMode === "linear") return N.prev(s, columns, config);
          return config.rtl ? N.right(s, columns, config) : N.left(s, columns, config);
        }),
      right: () =>
        withTransition((s) => {
          const stepped = N.nextClick(s);
          if (stepped !== s) return stepped;
          if (config.navigationMode === "linear") return N.next(s, columns, config);
          return config.rtl ? N.left(s, columns, config) : N.right(s, columns, config);
        }),
      up: () => withTransition((s) => N.up(s, columns)),
      down: () => withTransition((s) => N.down(s, columns)),
      first: () => withTransition((s) => N.first(s, columns)),
      last: () => withTransition((s) => N.last(s, columns)),
      goto: (h, v = 0, click = 0) => withTransition((s) => N.goto(s, columns, { h, v, click })),
      gotoFlat: (flat) => {
        const p = fromFlat(columns, flat);
        withTransition((s) => N.goto(s, columns, { ...p, click: 0 }));
      },
      gotoId: (id) => {
        const p = parseHash(`#/${id}`, columns, config.hashOneBasedIndex);
        if (p) withTransition((s) => N.goto(s, columns, p));
      },
      /**
       * The share window: open one that mirrors this deck, or close the one this window opened.
       *
       * It is a plain `window.open`, so it works in any browser — a popup that follows along — and
       * a desktop shell that wants to give it a frame of its own only has to recognise the URL.
       */
      toggleProjector: (force) => {
        const open = !!projectorWindow.ref && !projectorWindow.ref.closed;
        if (force === undefined ? open : !force) {
          projectorWindow.ref?.close();
          projectorWindow.ref = null;
          ui.update((s) => (s.projectorOpen ? { ...s, projectorOpen: false } : s));
          return;
        }
        if (open) {
          projectorWindow.ref?.focus();
          return;
        }
        // It starts where this window is, so it is on the right slide before the room has spoken.
        const url = `${base}?projector${formatHash(nav.get(), {
          withClick: config.fragmentInURL,
          oneBased: config.hashOneBasedIndex,
        })}`;
        projectorWindow.ref = window.open(
          url,
          `deck-projector-${config.slug || "deck"}`,
          "width=1280,height=720",
        );
        ui.update((s) => ({ ...s, projectorOpen: !!projectorWindow.ref }));
      },
      // Following again means being where they are, now; this is the one move that sets it back on.
      setFollow: (on) =>
        nav.update((s) => {
          if (!on) return s.follow ? { ...s, follow: false } : s;
          return s.presenter
            ? { ...N.goto(s, columns, s.presenter), follow: true }
            : { ...s, follow: true };
        }),
      toggleOverview: (force) => {
        if (!config.overview) return;
        nav.update((s) => ({ ...s, overview: force ?? !s.overview }));
      },
      togglePause: (force) =>
        config.pause && nav.update((s) => ({ ...s, paused: force ?? !s.paused })),
      toggleHelp: (force) => config.help && uiToggle("help", force),
      toggleJump: (force) => config.jumpToSlide && uiToggle("jump", force),
      toggleSearch: (force) => config.search && uiToggle("search", force),
      toggleFullscreen: () => {
        const el = document.documentElement;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen?.();
      },
      toggleAutoSlide: () => nav.update((s) => ({ ...s, autoSliding: !s.autoSliding })),
      toggleDrawing: (force) => config.drawings.enabled && uiToggle("drawing", force),
      togglePointer: (force) => uiToggle("pointer", force),
      toggleColorScheme: () =>
        ui.update((s) => {
          const colorScheme = s.colorScheme === "dark" ? "light" : "dark";
          remember(config, "scheme", colorScheme);
          return { ...s, colorScheme };
        }),
      setColorScheme: (colorScheme) => {
        remember(config, "scheme", colorScheme);
        ui.update((s) => ({ ...s, colorScheme }));
      },
      toggleHints: (force) => uiToggle("hints", force),
      toggleThemeMenu: (force) => uiToggle("themeMenu", force),
      toggleTermSync: (force) =>
        ui.update((s) => {
          const termSync = force ?? !s.termSync;
          remember(config, "termsync", termSync ? "on" : "off");
          return { ...s, termSync };
        }),
      setTheme: (theme) => {
        remember(config, "theme", theme);
        ui.update((s) => ({ ...s, theme, themeMenu: false }));
      },
      openPresenter: () => {
        const p = nav.get();
        window.open(
          `${base}presenter${formatHash(p, { withClick: true })}`,
          `deck-presenter-${config.slug || "deck"}`,
          "width=1280,height=800",
        );
      },
      openLightbox: (kind, src, fit = "scale-down") =>
        ui.update((s) => ({ ...s, lightbox: { kind, src, fit } })),
      closeLightbox: () => ui.update((s) => ({ ...s, lightbox: null })),
      zoomTo: (x, y) => ui.update((s) => ({ ...s, zoom: s.zoom ? null : { x, y, scale: 2 } })),
      zoomOut: () => ui.update((s) => ({ ...s, zoom: null })),
      toast: (message) => {
        ui.update((s) => ({ ...s, toast: message }));
        setTimeout(() => ui.update((s) => (s.toast === message ? { ...s, toast: null } : s)), 1800);
      },
    };
  }, [nav, ui, columns, config, options, base, sync, projector, projectorWindow]);

  const terms = useMemo(() => createStore<TermReveal | null>(null), []);
  const glossary = useMemo(
    () => new Map((manifest.glossary ?? []).map((e) => [e.id, e])),
    [manifest.glossary],
  );

  const runtime = useMemo<DeckRuntime>(
    () => ({
      manifest,
      config,
      columns,
      options,
      nav,
      ui,
      layout,
      mode,
      base,
      components,
      actions,
      windowId,
      sync,
      isPresenter: mode === "presenter",
      projector,
      terms,
      glossary,
    }),
    [
      manifest,
      config,
      columns,
      options,
      nav,
      ui,
      layout,
      mode,
      base,
      components,
      actions,
      windowId,
      sync,
      projector,
      terms,
      glossary,
    ],
  );

  useDeckEffects(runtime, flags, wantedAtLoad);
  useTermEffects(runtime);
  // A share window the viewer closed themselves: the button that opened it stops looking lit.
  useEffect(() => {
    const id = setInterval(() => {
      if (!projectorWindow.ref?.closed) return;
      projectorWindow.ref = null;
      ui.update((s) => (s.projectorOpen ? { ...s, projectorOpen: false } : s));
    }, 1000);
    return () => clearInterval(id);
  }, [projectorWindow, ui]);
  // A handle for the console and tests, as Slidev's `$slidev`: `__deck.nav.get()`, `__deck.actions.next()`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __deck?: DeckRuntime };
    // eslint-disable-next-line no-underscore-dangle -- a deliberate global, like Slidev's $slidev
    w.__deck = runtime;
  }, [runtime]);

  const Page = mode !== "play" && mode !== "print" ? pages[mode] : null;

  const view =
    mode === "print" ? (
      <PrintView />
    ) : Page ? (
      <Page />
    ) : mode !== "play" ? (
      <MissingPage mode={mode} />
    ) : (
      <PlayView />
    );
  // Children are providers (`<LiveProvider />`): each wraps the view, so pages and slides see them.
  const wrapped = Children.toArray(children).reduceRight<ReactNode>(
    (inner, child) =>
      isValidElement(child)
        ? cloneElement(child as ReactElement<{ children?: ReactNode }>, {}, inner)
        : inner,
    view,
  );

  return (
    <DeckContext.Provider value={runtime}>
      <DeckRoot>{wrapped}</DeckRoot>
    </DeckContext.Provider>
  );
}

function MissingPage({ mode }: { mode: ViewMode }) {
  return (
    <div className="deck-missing-page">
      This deck was built without the <code>{mode}</code> page. Pass it to{" "}
      <code>&lt;Deck pages&gt;</code>.
    </div>
  );
}

/** The play view: backgrounds, the stage or the scroll view, the overview, and the chrome. */
function PlayView() {
  const deck = useContextStrict();
  const [scroll, setScroll] = useState(() => deck.ui.get().scroll);
  useEffect(() => deck.ui.subscribe((s) => setScroll(s.scroll)), [deck.ui]);
  return (
    <>
      {scroll ? (
        <ScrollView />
      ) : (
        <>
          <Backgrounds />
          <ZoomLayer>
            <Stage />
          </ZoomLayer>
          <Overview />
        </>
      )}
      <Chrome />
      <Lightbox />
    </>
  );
}

function useContextStrict(): DeckRuntime {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error("no deck");
  return ctx;
}

function DeckRoot({ children }: { children: ReactNode }) {
  const deck = useContextStrict();
  const [scheme, setScheme] = useState(deck.ui.get().colorScheme);
  const [theme, setTheme] = useState(deck.ui.get().theme);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(
    () =>
      deck.ui.subscribe((s) => {
        setScheme(s.colorScheme);
        setTheme(s.theme);
        setCursorHidden(s.cursorHidden);
      }),
    [deck.ui],
  );
  useEffect(() => deck.nav.subscribe((s) => setPaused(s.paused)), [deck.nav]);
  useEffect(() => {
    document.documentElement.dataset.colorScheme = scheme;
    document.documentElement.classList.toggle("dark", scheme === "dark");
  }, [scheme]);
  return (
    <div
      className={[
        "deck-root",
        `theme-${theme}`,
        `mode-${deck.mode}`,
        cursorHidden ? "cursor-hidden" : "",
        deck.projector ? "is-projector" : "",
        paused ? "is-paused" : "",
        deck.config.selectable ? "" : "no-select",
        deck.config.rtl ? "rtl" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-color-scheme={scheme}
      dir={deck.config.rtl ? "rtl" : undefined}
    >
      {children}
    </div>
  );
}

/** Per-deck, per-browser memory for the theme menu's choices. */
function stored<T extends string>(
  config: DeckConfig,
  what: string,
  allowed: readonly T[],
): T | null {
  try {
    const v = localStorage.getItem(`deck.${what}.${config.slug || "deck"}`);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}
function remember(config: DeckConfig, what: string, value: string) {
  try {
    localStorage.setItem(`deck.${what}.${config.slug || "deck"}`, value);
  } catch {
    /* private mode */
  }
}

/**
 * How long a viewer's follow choice speaks for them: the same twelve hours a presenter's own
 * session lasts. Long enough that a bookmark taken mid-talk, a tab closed at the interval or a
 * phone that went to sleep comes back in step; short enough that a choice made at one talk does
 * not quietly govern the next one on the same deck.
 */
const FOLLOW_MEMORY_MS = 12 * 60 * 60 * 1000;

/** What this viewer last chose for this deck, if it is still about this talk. */
function rememberedFollow(config: DeckConfig): boolean | null {
  try {
    const raw = localStorage.getItem(`deck.follow.${config.slug || "deck"}`);
    const [value, at] = (raw ?? "").split(":");
    if ((value !== "on" && value !== "off") || !Number.isFinite(Number(at))) return null;
    return Date.now() - Number(at) > FOLLOW_MEMORY_MS ? null : value === "on";
  } catch {
    return null;
  }
}
function rememberFollow(config: DeckConfig, follow: boolean) {
  try {
    localStorage.setItem(
      `deck.follow.${config.slug || "deck"}`,
      `${follow ? "on" : "off"}:${Date.now()}`,
    );
  } catch {
    /* private mode */
  }
}

function resolveScheme(scheme: DeckConfig["colorScheme"]): "light" | "dark" {
  if (scheme === "light" || scheme === "dark") return scheme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function viewport() {
  if (typeof window === "undefined") return { width: 1920, height: 1080 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Every browser side effect, in one place. */
function useDeckEffects(
  deck: DeckRuntime,
  flags: ReturnType<typeof parseFlags>,
  wantedAtLoad: ReturnType<typeof parseHash>,
) {
  const { nav, ui, layout, config, columns, actions, base, mode } = deck;

  // Title and fonts.
  useEffect(() => {
    document.title = config.title;
    if (!config.fonts.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${config.fonts.map((f) => `family=${encodeURIComponent(f).replace(/%3A/g, ":").replace(/%40/g, "@").replace(/%3B/g, ";")}`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [config.title, config.fonts]);

  // Layout: scale to the viewport (or the embedding element).
  useEffect(() => {
    const measure = () => layout.set(computeLayout(config, viewport()));
    measure();
    window.addEventListener("resize", measure);
    const narrow = () => {
      if (mode !== "play" || !config.scrollActivationWidth || flags.view === "slide") return;
      const on = window.innerWidth < config.scrollActivationWidth;
      ui.update((s) => (s.scroll === on || flags.view === "scroll" ? s : { ...s, scroll: on }));
    };
    narrow();
    window.addEventListener("resize", narrow);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("resize", narrow);
    };
  }, [layout, config, ui, mode, flags.view]);

  // Hash ↔ navigation.
  useEffect(() => {
    if (!config.hash || mode === "print") return;
    const write = (s: N.NavState) => {
      const meta = columns[s.h]?.slides[s.v];
      const id = meta && typeof meta.frontmatter.id === "string" ? meta.frontmatter.id : null;
      const next = formatHash(s, {
        withClick: config.fragmentInURL,
        oneBased: config.hashOneBasedIndex,
        id,
      });
      if (window.location.hash === next) return;
      const url = `${window.location.pathname}${window.location.search}${next}`;
      if (config.history) history.pushState(null, "", url);
      else history.replaceState(null, "", url);
    };
    // The share marker has done its work — it decided `startFollowing` — so take it out of the
    // address bar: a viewer who bookmarks THIS url should be bookmarking a slide, not a choice.
    if (flags.at) {
      const q = new URLSearchParams(window.location.search);
      q.delete("at");
      const search = q.toString();
      history.replaceState(
        null,
        "",
        `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
      );
    }
    // A link to a step (#/h/v/click) arrives before the slide has reported how many steps it has,
    // so the click is clamped to 0 at load; remember it (before the first write rewrites the
    // hash) and apply it once the total is known.
    let pending = wantedAtLoad && (wantedAtLoad.click ?? 0) > 0 ? wantedAtLoad : null;
    write(nav.get());
    const unsub = nav.subscribe((s, prev) => {
      if (pending) {
        const target = pending;
        const onSlide = s.h === target.h && s.v === target.v;
        if (onSlide && (s.totals[`${s.h},${s.v}`] ?? 0) >= (target.click ?? 0)) {
          pending = null;
          if (s.click < (target.click ?? 0))
            queueMicrotask(() =>
              nav.update((st) =>
                st.h === target.h && st.v === target.v ? N.goto(st, columns, target) : st,
              ),
            );
        } else if (!onSlide && (s.h !== prev.h || s.v !== prev.v)) pending = null;
      }
      if (s.h !== prev.h || s.v !== prev.v || s.click !== prev.click) write(s);
    });
    const onHash = () => {
      const p = parseHash(window.location.hash, columns, config.hashOneBasedIndex);
      if (!p) return;
      const s = nav.get();
      if (p.h === s.h && p.v === s.v && (p.click ?? 0) === s.click) return;
      nav.update((st) => ({ ...N.goto(st, columns, p), follow: false }));
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      unsub();
      window.removeEventListener("hashchange", onHash);
    };
  }, [nav, columns, config, mode, flags.at]);

  // The viewer's follow choice, and when they made it (see `startFollowing`). Only the two views
  // that can follow anything remember it: the presenter's own window has a `follow` of its own
  // that means nothing, and writing it would hand "off" to every other window of that browser —
  // the projector included.
  useEffect(() => {
    if (mode !== "play" && mode !== "audience") return;
    let last: boolean | null = null;
    const save = (follow: boolean) => {
      if (follow === last) return;
      last = follow;
      rememberFollow(config, follow);
    };
    save(nav.get().follow);
    return nav.subscribe((s) => save(s.follow));
  }, [nav, config, mode]);

  // Keyboard.
  useEffect(() => {
    // A projector takes no input: a key pressed on a window that is only being looked at — the one
    // being shared on a call — must not move it off the presenter's slide.
    if (!config.keyboard || deck.projector || mode === "print" || mode === "audience") return;
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const u = ui.get();
      const s = nav.get();
      if (u.lightbox) {
        if (e.code === "Escape") actions.closeLightbox();
        return;
      }
      if (u.zoom && e.code === "Escape") return actions.zoomOut();
      if (u.help && (e.code === "Escape" || e.code === "Shift+Slash"))
        return actions.toggleHelp(false);
      if (u.jump || u.search || u.hints) return;
      // The theme menu owns Escape while it is open; nothing else should react to that key.
      if (u.themeMenu && e.code === "Escape") {
        e.preventDefault();
        actions.toggleThemeMenu(false);
        return;
      }
      // vim's gg: a second g within a beat goes to the first slide; a lone g is the jump prompt.
      if (e.code === "KeyG" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (pendingG && Date.now() - pendingG < 450) {
          pendingG = 0;
          actions.first();
        } else {
          pendingG = Date.now();
          setTimeout(() => {
            if (pendingG && Date.now() - pendingG >= 440) {
              pendingG = 0;
              actions.toggleJump(true);
            }
          }, 450);
        }
        return;
      }
      const action = actionFor(
        e,
        (config as unknown as { keyboardOverrides?: Record<string, KeyAction | null> })
          .keyboardOverrides ?? {},
      );
      if (!action) return;
      if (s.overview && action !== "overview" && action !== "escape") {
        if (["next", "prev", "left", "right", "up", "down", "first", "last"].includes(action)) {
          e.preventDefault();
          (actions as unknown as Record<string, () => void>)[action]!();
        } else if (action === "fullscreen") actions.toggleFullscreen();
        else if (action === "jump") actions.toggleJump(true);
        else if (action === "search") actions.toggleSearch(true);
        else if (action === "themeMenu") actions.toggleThemeMenu();
        else if (e.code === "Enter" || e.code === "Space") actions.toggleOverview(false);
        return;
      }
      if (s.paused && action !== "pause") {
        actions.togglePause(false);
        return;
      }
      e.preventDefault();
      switch (action) {
        case "next":
        case "prev":
        case "nextSlide":
        case "prevSlide":
        case "left":
        case "right":
        case "up":
        case "down":
        case "first":
        case "last":
          actions[action]();
          break;
        case "overview":
          actions.toggleOverview();
          break;
        case "fullscreen":
          actions.toggleFullscreen();
          break;
        case "pause":
          actions.togglePause();
          break;
        case "presenter":
          if (mode === "play") actions.openPresenter();
          break;
        case "help":
          actions.toggleHelp();
          break;
        case "jump":
          actions.toggleJump(true);
          break;
        case "search":
          actions.toggleSearch(true);
          break;
        case "autoSlide":
          actions.toggleAutoSlide();
          break;
        case "draw":
          actions.toggleDrawing();
          break;
        case "pointer":
          actions.togglePointer();
          break;
        case "colorScheme":
          actions.toggleColorScheme();
          break;
        case "hints":
          actions.toggleHints();
          break;
        case "themeMenu":
          actions.toggleThemeMenu();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, nav, ui, actions, mode, deck.projector]);

  // Touch swipes, mouse wheel, alt+click zoom, lightbox delegation, idle cursor.
  useEffect(() => {
    if (mode !== "play" || deck.projector) return;
    const swipe = createSwipeTracker();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" && config.touch) swipe.start(e.clientX, e.clientY, e.timeStamp);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !config.touch) return;
      const dir = swipe.end(e.clientX, e.clientY, e.timeStamp);
      if (!dir) return;
      if (dir === "left") actions.next();
      else if (dir === "right") actions.prev();
      else if (dir === "up") actions.down();
      else if (dir === "down") actions.up();
    };
    let wheelLock = 0;
    const onWheel = (e: WheelEvent) => {
      if (!config.mouseWheel || ui.get().scroll || ui.get().lightbox) return;
      const now = Date.now();
      if (now - wheelLock < 600) return;
      if (Math.abs(e.deltaY) < 10) return;
      wheelLock = now;
      if (e.deltaY > 0) actions.next();
      else actions.prev();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const preview = target.closest<HTMLElement>(
        "[data-preview-image], [data-preview-video], [data-preview-link]",
      );
      if (preview) {
        e.preventDefault();
        const fit = preview.dataset.previewFit ?? "scale-down";
        if (preview.dataset.previewImage !== undefined)
          actions.openLightbox(
            "image",
            preview.dataset.previewImage || preview.getAttribute("src") || "",
            fit,
          );
        else if (preview.dataset.previewVideo !== undefined)
          actions.openLightbox(
            "video",
            preview.dataset.previewVideo || preview.getAttribute("src") || "",
            fit,
          );
        else
          actions.openLightbox(
            "iframe",
            preview.dataset.previewLink || preview.getAttribute("href") || "",
            fit,
          );
        return;
      }
      if (config.previewLinks) {
        const a = target.closest<HTMLAnchorElement>("a[href^='http']");
        if (a && !a.dataset.noPreview) {
          e.preventDefault();
          actions.openLightbox("iframe", a.href);
          return;
        }
      }
      if (config.zoom && e.altKey) {
        const l = layout.get();
        const p = toStage(l, e.clientX, e.clientY);
        actions.zoomTo(p.x, p.y);
      }
    };
    let idle: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      if (!config.hideInactiveCursor) return;
      ui.update((s) => (s.cursorHidden ? { ...s, cursorHidden: false } : s));
      if (idle) clearTimeout(idle);
      idle = setTimeout(
        () => ui.update((s) => ({ ...s, cursorHidden: true })),
        config.hideCursorTime,
      );
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("click", onClick);
    window.addEventListener("pointermove", wake);
    wake();
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("click", onClick);
      window.removeEventListener("pointermove", wake);
      if (idle) clearTimeout(idle);
    };
  }, [config, actions, ui, layout, mode]);

  // The share window hid its cursor for good, which was right while there was nothing in it to
  // point at. There is now — the embedded page, and the Reload above it — so it keeps the deck's
  // ordinary manners instead: the cursor appears when the pointer moves and goes when it rests, so
  // a window on a call is never watching a cursor sit still.
  useEffect(() => {
    if (!deck.projector || !config.hideInactiveCursor) return;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const sleep = () => ui.update((s) => (s.cursorHidden ? s : { ...s, cursorHidden: true }));
    const wake = () => {
      ui.update((s) => (s.cursorHidden ? { ...s, cursorHidden: false } : s));
      if (idle) clearTimeout(idle);
      idle = setTimeout(sleep, config.hideCursorTime);
    };
    window.addEventListener("pointermove", wake);
    idle = setTimeout(sleep, config.hideCursorTime);
    return () => {
      window.removeEventListener("pointermove", wake);
      if (idle) clearTimeout(idle);
    };
  }, [deck.projector, config.hideInactiveCursor, config.hideCursorTime, ui]);

  // Fullscreen state, wake lock.
  useEffect(() => {
    const onFs = () => ui.update((s) => ({ ...s, fullscreen: !!document.fullscreenElement }));
    document.addEventListener("fullscreenchange", onFs);
    let lock: { release(): Promise<void> } | null = null;
    const acquire = async () => {
      if (!config.wakeLock || mode === "print") return;
      try {
        lock =
          (await (
            navigator as unknown as {
              wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> };
            }
          ).wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [ui, config.wakeLock, mode]);

  // Auto-slide.
  useEffect(() => {
    if (!config.autoSlide || mode !== "play") return;
    nav.update((s) => ({ ...s, autoSliding: true }));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const s = nav.get();
      if (!s.autoSliding || s.paused || s.overview) return;
      const opts = deck.options.get(`${s.h},${s.v}`);
      const ms = opts?.autoSlide ?? config.autoSlide;
      timer = setTimeout(() => {
        const before = nav.get();
        // The deck advancing itself is not the viewer choosing to leave the presenter.
        deck.sync.source = "auto";
        try {
          actions.next();
          if (nav.get() === before && config.loop) actions.first();
        } finally {
          deck.sync.source = null;
        }
        schedule();
      }, ms);
    };
    schedule();
    const unsub = nav.subscribe(() => schedule());
    const stop = () =>
      config.autoSlideStoppable &&
      nav.update((s) => (s.autoSliding ? { ...s, autoSliding: false } : s));
    window.addEventListener("pointerdown", stop);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointerdown", stop);
    };
  }, [config, nav, actions, mode, deck.options]);

  // Cross-window sync: the presenter window and the play window mirror each other.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || mode === "print") return;
    const channel = new BroadcastChannel(`deck:${config.slug || base}`);
    const unsub = nav.subscribe((s, prev) => {
      // Only local moves go out: a position applied from the channel or the room stays put.
      if (deck.sync.source) return;
      if (s.h === prev.h && s.v === prev.v && s.click === prev.click && s.paused === prev.paused)
        return;
      channel.postMessage({
        type: "nav",
        h: s.h,
        v: s.v,
        click: s.click,
        paused: s.paused,
        from: deck.windowId,
        presenter: deck.isPresenter,
      });
    });
    channel.onmessage = (
      e: MessageEvent<{
        type: string;
        h: number;
        v: number;
        click: number;
        paused: boolean;
        from: string;
        presenter?: boolean;
      }>,
    ) => {
      const m = e.data;
      if (m.type !== "nav" || m.from === deck.windowId) return;
      // The presenter's window is driven by the presenter. Another tab of this browser reading the
      // deck on its own is a viewer, and a viewer must never move the window that drives the room.
      if (deck.isPresenter && !m.presenter) return;
      deck.sync.source = "channel";
      try {
        nav.update((s) => {
          /*
           * Another window of this browser moved, and who it was decides what that means here.
           *
           * The presenter's own window driving the room is the presenter: this window follows it
           * exactly as it follows the room — only while it IS following. A second tab of a viewer
           * is the same person navigating, so this window goes with them and stops following too.
           * Either way the blackout still lands, as it does from the room.
           */
          if (m.presenter && !s.follow)
            return s.paused === m.paused ? s : { ...s, paused: m.paused };
          return {
            ...N.goto(s, columns, { h: m.h, v: m.v, click: m.click }),
            paused: m.paused,
            follow: m.presenter ? s.follow : false,
          };
        });
      } finally {
        deck.sync.source = null;
      }
    };
    return () => {
      unsub();
      channel.close();
    };
  }, [nav, columns, config.slug, base, deck.windowId, deck.isPresenter, deck.sync, mode]);
}
