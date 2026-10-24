import {
  Children,
  cloneElement,
  type ComponentType,
  isValidElement,
  lazy,
  type ReactElement,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import type { Frontmatter } from "../compiler/split.ts";
import { formatHash, parseFlags, parseHash } from "../core/hash.ts";
import { createCommandRegistry, KEY_COMMANDS } from "../core/commands.ts";
import { createPanelRegistry } from "../core/panels.ts";
import { isEditable, type KeyAction } from "../core/keyboard.ts";
import { createShortcutRegistry, type ShortcutsInput } from "../core/shortcuts.ts";
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
  splitTransition,
} from "../core/model.ts";
import * as N from "../core/navigation.ts";
import { readItem, writeItem } from "../core/storage.ts";
import { createStore, useStore } from "../core/store.ts";
import { createSwipeTracker } from "../core/touch.ts";
import { windowFeatures } from "../core/teleprompter.ts";
import { isNavMessage, takesNav, type WindowMessage } from "../core/window-messages.ts";
import { createWindowBus, type Via, type WindowBus } from "../core/windows.ts";
import { captureTicket, presenterTicket, withTicket } from "../live/ticket.ts";
import { Backgrounds } from "./Backgrounds.tsx";
import { Chrome } from "./chrome.tsx";
import {
  type DeckActions,
  DeckContext,
  type DeckRuntime,
  type DeckWindows,
  type StageInset,
  type TermReveal,
  type UiState,
  type ViewMode,
} from "./context.ts";
import { AdFrame } from "./AdFrame.tsx";
import { Lightbox } from "./Lightbox.tsx";
import { NarrationGate } from "./NarrationGate.tsx";
import { Overview } from "./Overview.tsx";
import { PrintView } from "./PrintView.tsx";
import { CameraLayer } from "../media/CameraBubble.tsx";
import { drawingsOn } from "../draw/source.ts";
import { ScrollView } from "./ScrollView.tsx";
import { Stage } from "./Stage.tsx";
import { useBuiltinCommands } from "./commands.ts";
import { useTermEffects } from "./terms.ts";
import { ZoomLayer } from "./Zoom.tsx";
import { ThumbnailHost } from "../export/thumbnail.tsx";
import type { DeckLayers } from "../theming/contract.ts";
import { fontsForTheme, packageConfigLayer } from "../theming/merge.ts";
import { useDeckFonts, useDeckPackages, usePackageSetup, useRootVars } from "../theming/react.tsx";
import { ThemeNotice } from "./ThemeNotice.tsx";
import { readScheme } from "../core/print-options.ts";
import { createMenuRegistry, type MenuInput } from "./menu.ts";
import { devNotesEditor, type NotesEditor } from "./notes.ts";
import { PresentingLayer, usePresentingRoot } from "./Presenting.tsx";
import { SideEditor } from "./SideEditor.tsx";
import { useDocumentHead } from "./head.ts";
import type { RoutesSetup } from "../theming/contract.ts";
import { RoutePage, useDeckRoutes, usePackageRoutes } from "./routes.tsx";

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
 *   /<slug>/notes-edit     every note, editable, on one page (`kadal-deck dev`, or a notesEditor)
 *   /<slug>/teleprompter   this slide's notes, big, following the presenter (opened from its view)
 *   /<slug>/overview       every slide in a list, with a step slider and its notes
 *   /<slug>/stats          the deck's numbers
 *   /<slug>/remote         the phone remote    (#ticket=… hosted, ?pair=CODE on `kadal-deck dev`)
 *   /<slug>/export         the browser exporter (PDF, PNG, PPTX, Markdown; no Playwright)
 *
 * Extra pages plug in through `pages` so the presenter, audience and stats modules stay optional
 * imports; a deck that never goes live ships without them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface DeckProps {
  manifest: DeckManifest;
  config?: DeckConfigInput | Frontmatter;
  components?: Record<string, ComponentType<Record<string, unknown>>>;
  /**
   * Route → page component, for the presenter/audience/notes/stats/remote pages. A deck with a
   * presenter and no remote still gets the phone remote (the engine's, loaded on /remote only).
   */
  pages?: Partial<Record<Exclude<ViewMode, "play" | "print" | "page">, ComponentType>>;
  /**
   * Pages of the deck's own at `<base><path>` (react/routes.tsx): `[{ path: "handout", component:
   * Handout }]`, or a function of the routes so far. A `routes.tsx` beside deck.mdx adds its own.
   */
  routes?: RoutesSetup;
  /** Wraps the runtime (the live provider, a theme provider). */
  children?: ReactNode;
  /**
   * The URL path the deck lives under, e.g. "/@you/talk/". Defaults to Vite's `BASE_URL`; a deck
   * that was not built for its address (the prebuilt shell) works it out and passes it here.
   */
  base?: string;
  /**
   * Layers on every slide (react/Layers.tsx): `global-top`, `global-bottom`, `slide-top`,
   * `slide-bottom`, and `custom-nav-controls` (buttons beside the controls). They draw with the
   * theme's and the addons' (and a `global-top.tsx` beside deck.mdx); `false` for one hides that
   * layer from all of them.
   */
  layers?: DeckLayers;
  /**
   * Custom keyboard shortcuts (core/shortcuts.ts): an array is laid over the defaults, a function
   * gets the defaults and returns the whole list — `defineShortcuts((d) => [...d, {…}])`.
   */
  shortcuts?: ShortcutsInput;
  /** Items for the right-click menu (react/menu.ts): an array is added, a function gets the defaults. */
  contextMenu?: MenuInput;
  /**
   * Where edited speaker notes go (react/notes.ts). Default: the dev server under
   * `kadal-deck dev`, none in a build (the notes views are read-only there). A host's builder
   * passes its own; `null` turns editing off even in dev.
   */
  notesEditor?: NotesEditor | null;
}

function baseOf(): string {
  const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return b.endsWith("/") ? b : `${b}/`;
}

/**
 * The phone remote, for a deck with a presenter view that passed no remote page. The presenter
 * offers the remote's QR code, so the page behind it must exist; decks made before the remote
 * existed pass only presenter, audience, notes and stats, and their phones met an error. It loads
 * on /remote alone, in a chunk of its own, so the deck itself carries none of it.
 */
const FallbackRemote = lazy(() =>
  import("../remote/index.tsx").then((m) => ({ default: m.RemotePage })),
);
/** The engine's own /overview and /notes-edit, each a chunk of its own, for any deck. */
const FallbackOverview = lazy(() =>
  import("./OverviewPage.tsx").then((m) => ({ default: m.OverviewPage })),
);
const FallbackNotesEdit = lazy(() =>
  import("./NotesEditPage.tsx").then((m) => ({ default: m.NotesEditPage })),
);
/**
 * The teleprompter: every deck has one, as it has the presenter's notes — decks made before it
 * existed, and the hosted builder's, pass no page for it. A chunk of its own, loaded there only.
 */
const FallbackTeleprompter = lazy(() =>
  import("../presenter/Teleprompter.tsx").then((m) => ({ default: m.TeleprompterPage })),
);

/**
 * The browser exporter: every deck has it (a lazy chunk of its own, loaded on /export only), so a
 * deck built before it existed, or hosted where no Playwright runs, can still be saved as a file.
 */
const FallbackExport = lazy(() =>
  import("../export/browser/ExportPage.tsx").then((m) => ({ default: m.ExportPage })),
);

/** The page for a route: the deck's own, else the remote the presenter needs, else none. */
export function pageFor(
  mode: ViewMode,
  pages: Partial<Record<Exclude<ViewMode, "play" | "print" | "page">, ComponentType>>,
): ComponentType | null {
  if (mode === "play" || mode === "print" || mode === "page") return null;
  if (pages[mode]) return pages[mode]!;
  if (mode === "export") return FallbackExport;
  if (mode === "overview") return FallbackOverview;
  if (mode === "notes-edit") return FallbackNotesEdit;
  if (mode === "teleprompter") return FallbackTeleprompter;
  return mode === "remote" && pages.presenter ? FallbackRemote : null;
}

function modeFromLocation(base: string): ViewMode {
  if (typeof window === "undefined") return "play";
  const path = window.location.pathname;
  const rest = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, "");
  const first = rest.split("/")[0]?.replace(/\.html$/, "") ?? "";
  if (first === "presenter") return "presenter";
  if (first === "join" || first === "audience") return "audience";
  if (first === "notes") return "notes";
  if (first === "notes-edit") return "notes-edit";
  if (first === "teleprompter") return "teleprompter";
  if (first === "overview") return "overview";
  if (first === "stats") return "stats";
  if (first === "remote") return "remote";
  if (first === "export") return "export";
  if (parseFlags(window.location.search).print) return "print";
  return "play";
}

/**
 * The deck. A kit's manifest (runtime/shell.tsx `kitManifest`: the deck's own entry built as its
 * editing kit) has no slides of its own — the shell compiles them from the editor's text — so it
 * renders the shell with these same props instead.
 */
export function Deck(props: DeckProps) {
  const Shell = props.manifest.kit?.Shell as ComponentType<DeckProps> | undefined;
  return Shell ? <Shell {...props} /> : <DeckRuntimeView {...props} />;
}

/** The deck itself, from a manifest with slides. */
export function DeckRuntimeView({
  manifest,
  config: configIn,
  components = {},
  pages = {},
  children,
  base: baseIn,
  layers: deckLayers,
  shortcuts: shortcutsIn,
  contextMenu: menuIn,
  notesEditor: notesEditorIn,
  routes: routesIn,
}: DeckProps) {
  const base = useMemo(
    () => (baseIn ? (baseIn.endsWith("/") ? baseIn : `${baseIn}/`) : baseOf()),
    [baseIn],
  );
  const slugFromBase = base.replace(/^\/|\/$/g, "");
  const config = useMemo(() => {
    // Before anything reads the fragment: a presenter ticket rides in it (live/ticket.ts).
    captureTicket();
    // The theme package's own config sits under the headmatter; the names it resolved to (a
    // `theme: ./theme` is the class its package names) over it; deck.config.ts over both.
    const pk = packageConfigLayer(manifest.packages);
    return withHostOverride(
      resolveConfig({ slug: slugFromBase }, pk.below, manifest.headmatter, pk.names, configIn),
      readHostOverride(),
    );
  }, [manifest.headmatter, manifest.packages, configIn, slugFromBase]);
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

  // The deck's own pages (react/routes.tsx): an address one of them names is that page.
  const deckRoutes = useDeckRoutes(base, { deck: manifest.packages?.routes, prop: routesIn });
  const routeMatch = deckRoutes.match;
  const mode = useMemo<ViewMode>(() => {
    const m = modeFromLocation(base);
    return m === "play" && routeMatch ? "page" : m;
  }, [base, routeMatch]);
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
  const teleprompterWindow = useMemo<{ ref: Window | null }>(() => ({ ref: null }), []);
  /** This deck's other windows in this browser: the bus to them, and the ones this window opened. */
  const related = useMemo<Related>(
    () => ({ bus: null, children: new Set(), listeners: new Set(), pending: [] }),
    [],
  );
  const windows = useMemo<DeckWindows>(
    () => ({
      post: (message) => {
        // Positions are the runtime's own to send (useDeckEffects), with its rules about who may
        // move whom; nothing else gets to speak as one.
        if (!message || (message as { type?: unknown }).type === "nav") return;
        // A page's effects run before the runtime's, which opens the bus: what a page says on
        // mount waits for it.
        if (related.bus) related.bus.post(message);
        else if (related.pending.length < 16) related.pending.push(message);
      },
      subscribe: (listener) => {
        related.listeners.add(listener);
        return () => {
          related.listeners.delete(listener);
        };
      },
    }),
    [related],
  );
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
    // A teleprompter follows the presenter and nothing else; it has no moves of its own to make.
    if (projector || mode === "teleprompter") return true;
    if (flags.at) return false;
    const remembered = rememberedFollow(config);
    return remembered ?? !wantedAtLoad;
  }, [config, flags.at, projector, mode, wantedAtLoad]);

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
        laser: null,
        spotlight: false,
        colorScheme:
          (typeof location === "undefined" ? null : readScheme(location.search)) ??
          stored(config, "scheme", ["light", "dark"]) ??
          resolveScheme(config.colorScheme),
        cursorHidden: false,
        fullscreen: false,
        hints: false,
        themeMenu: false,
        projectorOpen: false,
        teleprompterOpen: false,
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
  // What the ad frame takes from the viewport; nothing, unless it is showing (react/AdFrame.tsx).
  const [stageInset] = useState(() => createStore<StageInset>({ right: 0, bottom: 0 }));

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
      // The slide being ARRIVED AT decides, as it does for every other transition (see Stage):
      // asking the slide being left meant a view-transition slide was entered with a cut and
      // left with the browser's animation instead.
      const target = options.get(`${after.h},${after.v}`);
      const useView =
        splitTransition(target?.transition, config.transition).in === "view-transition" &&
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
          const floor = N.clickFloor(columns, s.h, s.v);
          if (s.click > floor) return N.prevClick(s, floor);
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
        adoptWindow(related, projectorWindow.ref);
        ui.update((s) => ({ ...s, projectorOpen: !!projectorWindow.ref }));
      },
      /**
       * The teleprompter (presenter/Teleprompter.tsx): a window of the presenter view's, so it
       * joins the bus as the share window does and follows the presenter's slide and step. A
       * place puts it on a screen (presenter/TeleprompterControl.tsx asks the Window Management
       * API for one); without one it is a popup to drag. No ticket rides along: it does not join
       * the room, and the notes it shows are the ones /notes shows.
       */
      openTeleprompter: (place) => {
        const w = teleprompterWindow.ref;
        if (w && !w.closed) {
          if (place)
            try {
              w.moveTo(place.left, place.top);
              w.resizeTo(place.width, place.height);
            } catch {
              /* a window the browser will not move: it stays where it is */
            }
          w.focus();
          return;
        }
        const url = `${base}teleprompter${formatHash(nav.get(), {
          withClick: true,
          oneBased: config.hashOneBasedIndex,
        })}`;
        teleprompterWindow.ref = window.open(
          url,
          `deck-teleprompter-${config.slug || "deck"}`,
          windowFeatures(place ?? null),
        );
        adoptWindow(related, teleprompterWindow.ref);
        ui.update((s) => ({ ...s, teleprompterOpen: !!teleprompterWindow.ref }));
      },
      closeTeleprompter: () => {
        teleprompterWindow.ref?.close();
        teleprompterWindow.ref = null;
        ui.update((s) => (s.teleprompterOpen ? { ...s, teleprompterOpen: false } : s));
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
      toggleAutoSlide: () => {
        nav.update((s) => ({ ...s, autoSliding: !s.autoSliding }));
        // Nothing else on screen says auto-slide changed until a slide moves by itself.
        const message = nav.get().autoSliding ? "Auto-slide on" : "Auto-slide paused";
        ui.update((s) => ({ ...s, toast: message }));
        setTimeout(() => ui.update((s) => (s.toast === message ? { ...s, toast: null } : s)), 1800);
      },
      toggleDrawing: (force) => drawingsOn({ config, manifest }) && uiToggle("drawing", force),
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
        // This window is the one the presenter view will drive (the projector, a shared screen):
        // it follows from here, even after moves of its own had stopped it following.
        nav.update((s) => (s.follow ? s : { ...s, follow: true }));
        const p = nav.get();
        // The presenter this window was opened for (a ticket) is the presenter of the view it opens.
        const opened = window.open(
          `${base}presenter${withTicket(formatHash(p, { withClick: true }))}`,
          `deck-presenter-${config.slug || "deck"}`,
          "width=1280,height=800",
        );
        adoptWindow(related, opened);
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
  }, [
    nav,
    ui,
    columns,
    config,
    options,
    base,
    sync,
    projector,
    projectorWindow,
    teleprompterWindow,
    related,
  ]);

  const commands = useMemo(() => createCommandRegistry(), []);
  const terms = useMemo(() => createStore<TermReveal | null>(null), []);
  const glossary = useMemo(
    () => new Map((manifest.glossary ?? []).map((e) => [e.id, e])),
    [manifest.glossary],
  );

  // One registry for the page's life: a host registers its panels once, whatever re-renders.
  const [panels] = useState(createPanelRegistry);
  // The same for the keyboard's shortcuts and the context menu's items (an addon adds to them).
  const [shortcuts] = useState(createShortcutRegistry);
  const [menu] = useState(createMenuRegistry);
  // `keyboard: { KeyQ: overview }` in the config is a map of single-key changes.
  shortcuts.configure({ prop: shortcutsIn ?? null, keyboard: config.keyboard });
  menu.configure(menuIn ?? null);
  const notesEditor = useMemo<NotesEditor | null>(
    () =>
      notesEditorIn !== undefined
        ? notesEditorIn
        : manifest.notesApi
          ? devNotesEditor(manifest.notesApi)
          : null,
    [notesEditorIn, manifest.notesApi],
  );

  // The theme on show (this screen's choice) decides the layouts, components and layers merged
  // in from the packages; theming/react.tsx.
  const shownTheme = useStore(ui, (s) => s.theme);
  const merged = useDeckPackages(manifest, components, deckLayers, shownTheme);

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
      components: merged.components,
      layers: merged.layers,
      actions,
      commands,
      ticket: () => presenterTicket.get(),
      windowId,
      sync,
      isPresenter: mode === "presenter",
      projector,
      terms,
      glossary,
      panels,
      stageInset,
      shortcuts,
      menu,
      notesEditor,
      routes: deckRoutes.registry,
      windows,
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
      merged.components,
      merged.layers,
      actions,
      commands,
      windowId,
      sync,
      projector,
      terms,
      glossary,
      panels,
      stageInset,
      shortcuts,
      menu,
      notesEditor,
      deckRoutes.registry,
      windows,
    ],
  );

  useBuiltinCommands(runtime);
  usePackageSetup(runtime, merged.modules);
  usePackageRoutes(deckRoutes.registry, merged.modules);
  useDeckEffects(runtime, flags, wantedAtLoad, related);
  useTermEffects(runtime);
  // A share window or teleprompter the viewer closed themselves: the button that opened it stops
  // looking lit.
  useEffect(() => {
    const id = setInterval(() => {
      if (projectorWindow.ref?.closed) {
        projectorWindow.ref = null;
        ui.update((s) => (s.projectorOpen ? { ...s, projectorOpen: false } : s));
      }
      if (teleprompterWindow.ref?.closed) {
        teleprompterWindow.ref = null;
        ui.update((s) => (s.teleprompterOpen ? { ...s, teleprompterOpen: false } : s));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [projectorWindow, teleprompterWindow, ui]);
  // A handle for the console and tests, as Slidev's `$slidev`: `__deck.nav.get()`, `__deck.actions.next()`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __deck?: DeckRuntime };
    // eslint-disable-next-line no-underscore-dangle -- a deliberate global, like Slidev's $slidev
    w.__deck = runtime;
  }, [runtime]);

  const Page = pageFor(mode, pages);

  const view =
    mode === "print" ? (
      <PrintView />
    ) : mode === "page" && routeMatch ? (
      <Suspense fallback={null}>
        <RoutePage match={routeMatch} />
      </Suspense>
    ) : Page ? (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
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
      <DeckRoot>
        {/* Every slide's own <style>, scoped to it (compiler/slide-style.ts): one sheet, every view. */}
        {manifest.styles ? <style data-deck-slide-styles="">{manifest.styles}</style> : null}
        {wrapped}
        {mode !== "print" ? <ThemeNotice /> : null}
        {/* A picture of a slide for a host's lists (export.thumbnail); nothing until one is asked for. */}
        {mode !== "print" && mode !== "remote" ? <ThumbnailHost /> : null}
      </DeckRoot>
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
  // The controls, the slide number and the progress bar live in the area the slide does: with the
  // ad frame up it shrinks with the slide, so none of them sits over an ad.
  const inset = useStore(deck.stageInset);
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
      <div
        className="deck-chrome-area"
        style={inset.chrome === false ? undefined : { right: inset.right, bottom: inset.bottom }}
      >
        <Chrome />
      </div>
      <AdFrame />
      <SideEditor />
      <NarrationGate />
      <Lightbox />
      {/* The camera bubble on the slide (V, or the presenter's Camera): src/media/. */}
      <CameraLayer />
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
  const root = useRef<HTMLDivElement>(null);
  usePresentingRoot(deck, root);
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
  // The fonts of the theme on show (a theme picked from the menu brings its own), loaded here;
  // `--theme-*` from themeConfig, and the font tokens `fonts` points at its families.
  const fonts = useMemo(
    () => fontsForTheme(deck.manifest.packages, theme, deck.config.fonts),
    [deck.manifest.packages, theme, deck.config.fonts],
  );
  useDeckFonts(fonts);
  const vars = useRootVars(deck.manifest, theme, deck.config.themeConfig, fonts);
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
      ref={root}
      style={Object.keys(vars).length ? (vars as React.CSSProperties) : undefined}
    >
      {children}
      {deck.mode !== "print" ? <PresentingLayer /> : null}
    </div>
  );
}

/** Per-deck, per-browser memory for the theme menu's choices. */
function stored<T extends string>(
  config: DeckConfig,
  what: string,
  allowed: readonly T[],
): T | null {
  const v = readItem(`deck.${what}.${config.slug || "deck"}`);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function remember(config: DeckConfig, what: string, value: string) {
  writeItem(`deck.${what}.${config.slug || "deck"}`, value);
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
  const raw = readItem(`deck.follow.${config.slug || "deck"}`);
  const [value, at] = (raw ?? "").split(":");
  if ((value !== "on" && value !== "off") || !Number.isFinite(Number(at))) return null;
  return Date.now() - Number(at) > FOLLOW_MEMORY_MS ? null : value === "on";
}
function rememberFollow(config: DeckConfig, follow: boolean) {
  writeItem(`deck.follow.${config.slug || "deck"}`, `${follow ? "on" : "off"}:${Date.now()}`);
}

interface Related {
  bus: WindowBus<WindowMessage> | null;
  children: Set<unknown>;
  /** `deck.windows` subscribers: everything on the bus that is not a position. */
  listeners: Set<(message: Exclude<WindowMessage, { type: "nav" }>, via: Via) => void>;
  /** What `deck.windows` was given before the bus was open. */
  pending: WindowMessage[];
}

/** A window this one opened joins the bus (a desktop shell may hand back a stand-in, or null). */
function adoptWindow(related: Related, opened: unknown) {
  if (!opened) return;
  related.children.add(opened);
  related.bus?.adopt(opened);
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
  related: Related,
) {
  const { nav, ui, layout, config, columns, actions, base, mode, stageInset } = deck;

  // The title (the fonts are theming/react.tsx's `useDeckFonts`).
  useEffect(() => {
    document.title = config.title;
  }, [config.title]);
  // Description, Open Graph, favicon, lang: what index.html has from the build, kept in step.
  useDocumentHead(config, base);

  // Layout: scale to the viewport (or the embedding element), less whatever the ad frame keeps.
  // The presenter view lays its own canvas out (presenter/index.tsx sets scale 1 inside a box it
  // fits itself); measuring the window there too scaled the current slide twice, to ~83% of its pane.
  useEffect(() => {
    const measure = () => {
      if (mode === "presenter") return;
      const vp = viewport();
      const inset = stageInset.get();
      layout.set(
        computeLayout(
          config,
          {
            width: Math.max(1, vp.width - inset.right),
            height: Math.max(1, vp.height - inset.bottom),
          },
          window.devicePixelRatio,
        ),
      );
    };
    measure();
    const offInset = stageInset.subscribe(measure);
    window.addEventListener("resize", measure);
    const narrow = () => {
      if (mode !== "play" || !config.scrollActivationWidth || flags.view === "slide") return;
      const on = window.innerWidth < config.scrollActivationWidth;
      ui.update((s) => (s.scroll === on || flags.view === "scroll" ? s : { ...s, scroll: on }));
    };
    narrow();
    window.addEventListener("resize", narrow);
    return () => {
      offInset();
      window.removeEventListener("resize", measure);
      window.removeEventListener("resize", narrow);
    };
  }, [layout, config, ui, mode, flags.view, stageInset]);

  // Hash ↔ navigation.
  useEffect(() => {
    if (!config.hash || mode === "print" || mode === "remote") return;
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
      // A step on a slide not shown yet has no total to clamp against: keep it, as at load.
      const known = s.totals[`${p.h},${p.v}`] ?? 0;
      if ((p.click ?? 0) > known) pending = p;
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
    // The remote is a phone: its keys (if any) are its own buttons', not the deck's.
    // The teleprompter's keys are its own (scroll, size); it only ever follows the presenter.
    if (
      !config.keyboard ||
      deck.projector ||
      mode === "print" ||
      mode === "audience" ||
      mode === "remote" ||
      mode === "teleprompter"
    )
      return;
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e)) return;
      const u = ui.get();
      const s = nav.get();
      // The binding this key has here (core/shortcuts.ts): the defaults, the deck's own changes.
      const hit = deck.shortcuts.match(e, mode);
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
      // A custom binding (a command or a function of the deck's own) runs as it is, before vim's g.
      if (hit && !hit.action && (hit.command || hit.run)) {
        if (s.paused) {
          actions.togglePause(false);
          return;
        }
        e.preventDefault();
        if (hit.run) hit.run(e);
        else void deck.commands.run(hit.command!, hit.params ?? {}, "keyboard");
        return;
      }
      // vim's gg: a second g within a beat goes to the first slide; a lone g is the jump prompt.
      // A deck that bound G to something else has that instead (above, or as an action below).
      const gIsVim = !hit || hit.action === "jump";
      if (gIsVim && e.code === "KeyG" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
      const action: KeyAction | null = hit?.action ?? null;
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
      // Every key runs a command, so a key, a button, the phone remote and an agent do the same thing.
      const command = KEY_COMMANDS[action];
      if (!command) return;
      e.preventDefault();
      void deck.commands.run(command, {}, "keyboard");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, nav, ui, actions, mode, deck.projector, deck.shortcuts, deck.commands]);

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

  // Auto-slide. It runs on any play window but a projector (which follows instead): on by itself
  // when the deck or any slide sets an interval, and on `A` otherwise — see `autoSlideDelay`.
  useEffect(() => {
    if (mode !== "play" || deck.projector) return;
    const configured =
      config.autoSlide > 0 || [...deck.options.values()].some((o) => (o.autoSlide ?? 0) > 0);
    if (configured) nav.update((s) => ({ ...s, autoSliding: true }));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const s = nav.get();
      if (!s.autoSliding || s.paused || s.overview) return;
      const opts = deck.options.get(`${s.h},${s.v}`);
      const ms = N.autoSlideDelay(opts?.autoSlide ?? null, config.autoSlide, configured);
      if (ms === null) return;
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
  }, [config, nav, actions, mode, deck.options, deck.projector]);

  // Cross-window sync: the presenter window and the play window mirror each other (core/windows.ts).
  // A phone remote shows the presenter's slide; it is nobody's window to follow.
  useEffect(() => {
    if (typeof window === "undefined" || mode === "print" || mode === "remote") return;
    const bus = createWindowBus<WindowMessage>(config.slug || base);
    related.bus = bus;
    for (const child of related.children) bus.adopt(child);
    for (const message of related.pending.splice(0)) bus.post(message);
    const unsub = nav.subscribe((s, prev) => {
      // Only local moves go out: a position applied from another window or the room stays put.
      // A teleprompter makes none, and says nothing that could move the play window either.
      if (deck.sync.source || mode === "teleprompter") return;
      if (s.h === prev.h && s.v === prev.v && s.click === prev.click && s.paused === prev.paused)
        return;
      bus.post({
        type: "nav",
        h: s.h,
        v: s.v,
        click: s.click,
        paused: s.paused,
        from: deck.windowId,
        presenter: deck.isPresenter,
      });
    });
    const unlisten = bus.subscribe(({ data: m, via }) => {
      if (!m || typeof m !== "object") return;
      if (m.type !== "nav") {
        // Not a position: for whoever listens through `deck.windows` (each checks its own).
        for (const l of related.listeners) l(m, via);
        return;
      }
      // Who may move this window, and who may not: core/window-messages.ts.
      const self = {
        windowId: deck.windowId,
        presenter: deck.isPresenter,
        teleprompter: mode === "teleprompter",
      };
      if (!isNavMessage(m) || !takesNav(self, m, via)) return;
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
    });
    return () => {
      unsub();
      unlisten();
      bus.close();
      if (related.bus === bus) related.bus = null;
    };
  }, [nav, columns, config.slug, base, deck.windowId, deck.isPresenter, deck.sync, mode, related]);
}
