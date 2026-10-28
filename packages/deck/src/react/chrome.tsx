import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { keyLabel } from "../core/shortcuts.ts";
import {
  autoSlideDelay,
  availableRoutes,
  countedSlides,
  isCounted,
  progressOf,
  slideNumberShown as shownIn,
  slideNumberText,
} from "../core/navigation.ts";
import { useDeck } from "./context.ts";
import { HintLayer } from "./Hints.tsx";
import { NavControlsLayer } from "./Layers.tsx";
import { ConfettiLayer } from "./ConfettiLayer.tsx";
import { ThemeMenu } from "./ThemeMenu.tsx";
import { useActions, useCurrentSlide, useNav, useUi } from "./hooks.ts";
import { loadSlide } from "./SlideFrame.tsx";
import { MDXProvider } from "./mdx.tsx";
import { Icon } from "../components/bling.tsx";

/**
 * The chrome around the slides: arrows, progress, the slide number, the pause curtain, the
 * help sheet, jump-to, search, the speaker-notes footer, and a toast. Each piece reads only the
 * slice of state it needs.
 */
export function Chrome() {
  const deck = useDeck();
  const shown = useUi((s) => s.chrome);
  // Without the chrome (an editor's preview), only what a key or the slide itself opens.
  if (!shown)
    return (
      <>
        <PauseCurtain />
        <HelpSheet />
        <JumpTo />
        <SearchSheet />
        <HintLayer />
        <Toast />
        <ConfettiLayer />
      </>
    );
  return (
    <>
      {deck.config.controls === true ? <Controls /> : null}
      <CornerTools />
      {deck.config.progress ? <Progress /> : null}
      {/* The pill of arrows carries the number itself (Controls). */}
      {slideNumberShown(deck) &&
      !(deck.config.controls === true && deck.config.controlsLayout === "bottom-right") ? (
        <SlideNumber />
      ) : null}
      {deck.config.showNotes ? <NotesFooter /> : null}
      <ThemeMenu />
      <SlideAnnouncer />
      <PauseCurtain />
      <HelpSheet />
      <JumpTo />
      <SearchSheet />
      <HintLayer />
      <Toast />
      <ConfettiLayer />
    </>
  );
}

/** Whether the play view draws the slide number (`slideNumber`, `showSlideNumber: all`). */
function slideNumberShown(deck: ReturnType<typeof useDeck>): boolean {
  return shownIn(deck.config, "play");
}

/**
 * The arrows. `edges` puts one on each edge of the stage, reveal.js's way. `bottom-right` (the
 * default) is one pill in the corner — ‹ 5 / 138 › — on the same line and at the same height as
 * the theme button opposite it: the up and down arrows join it only on a slide that has a stack to
 * go up or down, and the slide number, when the deck shows one, sits in the middle and opens
 * jump-to. It replaced a 3 × 3 cross of bare chevrons with the number floating beside it, which
 * lined up with nothing else on the screen.
 */
export function Controls() {
  const deck = useDeck();
  const nav = useNav((s) => ({
    h: s.h,
    v: s.v,
    click: s.click,
    totals: s.totals,
    overview: s.overview,
  }));
  const actions = useActions();
  const routes = availableRoutes(
    {
      ...nav,
      direction: "none",
      paused: false,
      autoSliding: false,
      presenter: null,
      follow: true,
      seq: 0,
    },
    deck.columns,
    deck.config,
  );
  const [tutorial, setTutorial] = useState(deck.config.controlsTutorial);
  useEffect(() => {
    if (!tutorial) return;
    const unsub = deck.nav.subscribe((s, p) => {
      if (s.h !== p.h || s.v !== p.v || s.click !== p.click) setTutorial(false);
    });
    return unsub;
  }, [deck.nav, tutorial]);
  const back = deck.config.controlsBackArrows;
  const pill = deck.config.controlsLayout === "bottom-right";
  const arrow = (
    dir: "left" | "right" | "up" | "down",
    enabled: boolean,
    onClick: () => void,
    isBack: boolean,
  ) => (
    <button
      type="button"
      className={[
        "deck-control",
        `deck-control-${dir}`,
        enabled ? "is-enabled" : "",
        isBack && back === "faded" ? "is-faded" : "",
        tutorial && enabled && !isBack ? "is-highlight" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Navigate ${dir}`}
      title={NAV_TITLES[dir]}
      disabled={!enabled}
      hidden={isBack && back === "hidden" && enabled}
      onClick={onClick}
    >
      <span />
    </button>
  );
  // In the pill, up and down are there only where there is somewhere to go: most slides have no
  // stack, and two dead chevrons on every one of them were most of the old cross.
  const stack = routes.up || routes.down;
  return (
    <div
      className={`deck-controls layout-${deck.config.controlsLayout}`}
      role="toolbar"
      aria-label="Slide navigation"
      aria-hidden={nav.overview || undefined}
    >
      {arrow("left", routes.left || routes.prevClick, actions.prev, true)}
      {!pill || stack ? arrow("up", routes.up, actions.up, true) : null}
      {pill && slideNumberShown(deck) ? <SlideNumber inPill /> : null}
      {!pill || stack ? arrow("down", routes.down, actions.down, false) : null}
      {arrow("right", routes.right || routes.nextClick, actions.next, false)}
    </div>
  );
}

const NAV_TITLES = {
  left: "Back (←)",
  right: "Next (→ or Space)",
  up: "Up the stack (↑)",
  down: "Down the stack (↓)",
} as const;

/**
 * The row above the theme pill, bottom-left: the engine's own "back to the start" (from the
 * second slide on), then the deck's, its theme's and its addons' buttons (the custom-nav-controls
 * layer), all in the pill look. Hidden under the overview, which covers the stage; never in a
 * projector window.
 */
export function CornerTools() {
  const deck = useDeck();
  const overview = useNav((s) => s.overview);
  const away = useNav((s) => s.h > 0 || s.v > 0 || s.click > 0);
  const custom = !!deck.layers?.["custom-nav-controls"].length;
  const auto = useAutoSlideShown();
  if (deck.projector || (!away && !custom && !auto)) return null;
  return (
    <div className="deck-corner-tools" hidden={overview || undefined}>
      {auto ? <AutoSlideControl /> : null}
      {away ? <StartButton /> : null}
      {custom ? <NavControlsLayer placement="toolbar" /> : null}
    </div>
  );
}

/**
 * Whether the play view offers the auto-slide control: on a deck that sets an interval (its own or
 * a slide's) and lets the viewer stop it (`autoSlideStoppable`), and, once `A` has started it, on
 * one that sets none. reveal.js draws its control on the first kind only.
 */
function useAutoSlideShown(): boolean {
  const deck = useDeck();
  const on = useNav((s) => s.autoSliding);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (on) setStarted(true);
  }, [on]);
  if (deck.mode !== "play" || !deck.config.autoSlideStoppable) return false;
  return autoSlideConfigured(deck) || on || started;
}

function autoSlideConfigured(deck: ReturnType<typeof useDeck>): boolean {
  return (
    (deck.config.autoSlide || 0) > 0 ||
    [...deck.options.values()].some((o) => (o.autoSlide ?? 0) > 0)
  );
}

/**
 * reveal.js's auto-slide control: play or pause, in a ring that fills as the current slide's
 * interval runs out. The timer itself is the deck's (react/Deck.tsx), which restarts it on every
 * change of position; the ring restarts with it, from the same `autoSlideDelay`.
 */
export function AutoSlideControl() {
  const deck = useDeck();
  const actions = useActions();
  const nav = useNav((s) => ({
    h: s.h,
    v: s.v,
    on: s.autoSliding,
    held: s.paused || s.overview,
  }));
  // Every change of the nav state restarts the deck's timer, so it restarts the ring too.
  const [run, setRun] = useState(0);
  useEffect(() => deck.nav.subscribe(() => setRun((n) => n + 1)), [deck.nav]);
  const ms = autoSlideDelay(
    deck.options.get(`${nav.h},${nav.v}`)?.autoSlide ?? null,
    deck.config.autoSlide || 0,
    autoSlideConfigured(deck),
  );
  const playing = nav.on && !nav.held;
  const label = nav.on ? "Pause auto-slide" : "Start auto-slide";
  return (
    <button
      type="button"
      className={["deck-autoslide", playing ? "is-playing" : "is-paused"].join(" ")}
      // The deck stops auto-slide on any pointer press (`autoSlideStoppable`); this press is the
      // control's own, or pausing would stop it and the click start it again.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => actions.toggleAutoSlide()}
      aria-label={label}
      aria-pressed={nav.on}
      title={`${label} (A)`}
    >
      <svg className="deck-autoslide-dial" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="deck-autoslide-track" cx="18" cy="18" r="16" />
        {playing && ms !== null ? (
          <circle
            key={run}
            className="deck-autoslide-ring"
            cx="18"
            cy="18"
            r="16"
            pathLength={100}
            style={{ animationDuration: `${ms}ms` }}
          />
        ) : null}
      </svg>
      <Icon name={nav.on ? "pause" : "play"} />
    </button>
  );
}

/** Back to the first slide: the play view's corner row, and the presenter's toolbar (`label`). */
export function StartButton({ label = false }: { label?: boolean }) {
  const actions = useActions();
  return (
    <button
      type="button"
      className="deck-start-button"
      onClick={() => actions.first()}
      aria-label="Back to the start"
      title="Back to the start (Home)"
    >
      <Icon name="arrow-left-to-line" />
      {label ? " Start" : null}
    </button>
  );
}

export function Progress() {
  const deck = useDeck();
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  const actions = useActions();
  const p = progressOf(nav, deck.columns);
  // The bar spans the counted slides, so a click lands on the counted slide under the pointer.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const want = Math.round(frac * Math.max(0, countedSlides(deck.columns) - 1));
    let flat = 0;
    let seen = 0;
    for (const c of deck.columns)
      for (const s of c.slides) {
        if (isCounted(s) && seen++ === want) return actions.gotoFlat(flat);
        flat++;
      }
    actions.gotoFlat(Math.round(frac * Math.max(0, flat - 1)));
  };
  return (
    <div
      className="deck-progress"
      onClick={onClick}
      role="progressbar"
      aria-valuenow={Math.round(p * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}

export function SlideNumber({ inPill = false }: { inPill?: boolean }) {
  const deck = useDeck();
  const nav = useNav((s) => ({ h: s.h, v: s.v, click: s.click }));
  const text = slideNumberText(deck.config.slideNumber, nav, deck.columns);
  if (text === null) return null;
  if (inPill)
    return (
      <button
        type="button"
        className="deck-slide-number"
        // The command, so a deck that turned jump-to off (`jumpToSlide: false`) keeps it off.
        onClick={() => void deck.commands.run("view.jump", {}, "ui")}
        disabled={!deck.config.jumpToSlide}
        title="Go to a slide (G)"
        aria-label={`Slide ${text}. Go to another slide`}
      >
        {text}
      </button>
    );
  return (
    <a
      className="deck-slide-number"
      href={typeof window === "undefined" ? undefined : window.location.hash}
    >
      {text}
    </a>
  );
}

/**
 * reveal.js's status region: a visually hidden, polite live region that a screen reader reads out
 * when the slide changes — "Slide 3 of 12." and the slide's words — and, on a click step forward,
 * the words that step brought in. Only what is on the slide and shown is read: hidden clicks are
 * `aria-hidden` (components/Click.tsx), and so is anything else the deck keeps out of the
 * accessibility tree. Stepping back says nothing, as in reveal.js; the slide is already known.
 */
export function SlideAnnouncer() {
  const deck = useDeck();
  // A fresh node per announcement: the same words twice (a step taken back and again) are a
  // change a screen reader reads; the same text node rewritten with the same text is not.
  const [said, setSaid] = useState({ text: "", n: 0 });
  useEffect(() => {
    const setText = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
    const announce = (h: number, v: number, from: number | null, to: number) => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      let tries = 0;
      const read = () => {
        const el = activeSlide(h, v);
        const meta = deck.columns[h]?.slides[v];
        if (from !== null) {
          // A step forward: what came in with it, if it brought words.
          if (!el) return;
          const said = newlyShown(el, from, to);
          if (said) setText(said);
          return;
        }
        let words = el ? statusText(el) : "";
        // The slide's module may still be loading: wait a little for its words, then fall back
        // to the manifest's.
        if (!words && tries++ < 15 && meta?.text) {
          timer = setTimeout(read, 100);
          return;
        }
        if (!words) words = meta?.text?.replace(/\s+/g, " ").trim() || meta?.title || "";
        let index = v;
        for (let i = 0; i < h; i++) index += deck.columns[i]!.slides.length;
        setText(`Slide ${index + 1} of ${total}.${words ? ` ${words}` : ""}`);
      };
      // After the new slide has rendered and laid out its steps.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(read);
      });
    };
    const now = deck.nav.get();
    announce(now.h, now.v, null, now.click);
    const unsub = deck.nav.subscribe((s, p) => {
      if (s.h !== p.h || s.v !== p.v) announce(s.h, s.v, null, s.click);
      else if (s.click > p.click) announce(s.h, s.v, p.click, s.click);
    });
    return () => {
      unsub();
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [deck.nav, deck.columns]);
  return (
    <div className="deck-sr-only deck-announcer" aria-live="polite" aria-atomic="true">
      {said.text ? <span key={said.n}>{said.text}</span> : null}
    </div>
  );
}

/** The slide on the stage (or in the scroll view) at a position. */
function activeSlide(h: number, v: number): HTMLElement | null {
  const at = `.deck-slide[data-h="${h}"][data-v="${v}"]`;
  return (
    document.querySelector<HTMLElement>(`.deck-stage ${at}[data-active="true"]`) ??
    document.querySelector<HTMLElement>(`.deck-stage ${at}`) ??
    document.querySelector<HTMLElement>(`.deck-scroll ${at}`)
  );
}

/** The words of the elements a step from `from` to `to` brought in, outermost first. */
export function newlyShown(slide: HTMLElement, from: number, to: number): string {
  const hits = [...slide.querySelectorAll<HTMLElement>("[data-click-at]")].filter((el) => {
    const at = Number(el.dataset.clickAt);
    return at > from && at <= to && el.getAttribute("aria-hidden") !== "true";
  });
  return hits
    .filter((el) => !hits.some((o) => o !== el && o.contains(el)))
    .map(statusText)
    .filter(Boolean)
    .join(" ");
}

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

/**
 * The text a screen reader would find in an element, reveal.js's `getStatusText`: text nodes in
 * order, skipping `aria-hidden` and undisplayed subtrees; an image says its alt text. Blocks are
 * kept apart by a space, inline runs are not.
 */
export function statusText(node: Node): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      out.push(n.textContent ?? "");
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    if (SKIP.has(el.tagName) || el.getAttribute("aria-hidden") === "true") return;
    const display = typeof getComputedStyle === "function" ? getComputedStyle(el).display : "";
    if (display === "none") return;
    if (el.tagName === "IMG") {
      const alt = el.getAttribute("alt");
      if (alt) out.push(` ${alt} `);
      return;
    }
    const block = !display.startsWith("inline") && display !== "contents";
    if (block) out.push(" ");
    for (const c of el.childNodes) walk(c);
    if (block) out.push(" ");
  };
  walk(node);
  return out.join("").replace(/\s+/g, " ").trim();
}

export function PauseCurtain() {
  const paused = useNav((s) => s.paused);
  const actions = useActions();
  return (
    <div
      className="deck-pause-curtain"
      data-on={paused || undefined}
      onClick={() => actions.togglePause(false)}
      role="presentation"
      // Drawn at opacity 0 while the deck runs, so its words stay in the page: a screen reader
      // (and anything reading the page's text) heard "Paused" on a deck that was not.
      aria-hidden={!paused || undefined}
    >
      <span>Paused — press any key</span>
    </div>
  );
}

export function HelpSheet() {
  const open = useUi((s) => s.help);
  const actions = useActions();
  const deck = useDeck();
  if (!open) return null;
  // What the keys do HERE: the defaults with the deck's own changes laid over them.
  const bindings = deck.shortcuts.list().filter((b) => !b.views || b.views.includes(deck.mode));
  return (
    <div
      className="deck-sheet deck-help"
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={() => actions.toggleHelp(false)}
    >
      <div className="deck-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard</h2>
        <table>
          <tbody>
            {bindings.map((b, i) => (
              <tr
                key={`${b.action ?? b.command ?? "fn"}:${i}`}
                className={b.custom ? "is-custom" : ""}
              >
                <td>
                  <kbd>{b.label ?? b.keys.map(keyLabel).join("  ")}</kbd>
                </td>
                <td>
                  {b.description}
                  {b.custom ? <span className="deck-help-custom">this deck</span> : null}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <kbd>Alt click</kbd>
              </td>
              <td>Zoom in on a point</td>
            </tr>
          </tbody>
        </table>
        <p className="deck-sheet-hint">Press ? or Esc to close.</p>
      </div>
    </div>
  );
}

/**
 * What jump-to's field asks for: a number is the slide in reading order; two numbers are column
 * and row, 1-based — reveal.js's `6/2` (its hash form) or `6.2` (its h.v number); anything else
 * is a slide id. 0-based out, for the actions.
 */
export function jumpTarget(
  input: string,
): { flat: number } | { h: number; v: number } | { id: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return { flat: Number(raw) - 1 };
  const hv = /^(\d+)[./](\d+)$/.exec(raw);
  if (hv) return { h: Number(hv[1]) - 1, v: Number(hv[2]) - 1 };
  return { id: raw };
}

export function JumpTo() {
  const open = useUi((s) => s.jump);
  const actions = useActions();
  const deck = useDeck();
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Focus synchronously on open (a layout effect, plus autoFocus): keys typed right after `:`
  // or G must land in the field, not on the deck.
  useLayoutEffect(() => {
    if (open) {
      setValue("");
      input.current?.focus();
    }
  }, [open]);
  if (!open) return null;
  const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
  const submit = () => {
    const to = jumpTarget(value);
    if (to && "flat" in to) actions.gotoFlat(to.flat);
    else if (to && "id" in to) actions.gotoId(to.id);
    else if (to) actions.goto(to.h, to.v);
    actions.toggleJump(false);
  };
  return (
    <div className="deck-jump" role="dialog" aria-label="Jump to slide">
      <input
        ref={input}
        autoFocus
        value={value}
        placeholder={`Slide 1–${total}, or an id`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") actions.toggleJump(false);
          e.stopPropagation();
        }}
        onBlur={() => actions.toggleJump(false)}
      />
    </div>
  );
}

interface SearchHit {
  h: number;
  v: number;
  title: string | null;
  snippet: string;
}

export function SearchSheet() {
  const open = useUi((s) => s.search);
  const actions = useActions();
  const deck = useDeck();
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<Map<string, string>>(new Map());
  const input = useRef<HTMLInputElement>(null);

  // Slide text comes from the manifest when the plugin provides it; otherwise it is read from the
  // mounted DOM lazily, which means only slides near the current one are searchable until visited.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 0);
    const map = new Map<string, string>();
    deck.columns.forEach((c) =>
      c.slides.forEach((s, v) => {
        const t = (s as unknown as { text?: string }).text;
        if (t) map.set(`${c.h},${v}`, t);
      }),
    );
    for (const el of document.querySelectorAll<HTMLElement>(".deck-slide[data-h]")) {
      const k = `${el.dataset.h},${el.dataset.v}`;
      if (!map.has(k)) map.set(k, el.innerText);
    }
    setTexts(map);
  }, [open, deck.columns]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchHit[] = [];
    deck.columns.forEach((c) =>
      c.slides.forEach((s, v) => {
        const text = texts.get(`${c.h},${v}`) ?? "";
        const i = text.toLowerCase().indexOf(q);
        if (i === -1 && !(s.title ?? "").toLowerCase().includes(q)) return;
        const start = Math.max(0, i - 40);
        out.push({
          h: c.h,
          v,
          title: s.title,
          snippet: i === -1 ? (s.title ?? "") : `…${text.slice(start, i + q.length + 40)}…`,
        });
      }),
    );
    return out.slice(0, 20);
  }, [query, texts, deck.columns]);

  if (!open) return null;
  return (
    <div
      className="deck-sheet deck-search"
      role="dialog"
      aria-label="Search"
      onClick={() => actions.toggleSearch(false)}
    >
      <div className="deck-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder="Search the deck"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") actions.toggleSearch(false);
            if (e.key === "Enter" && hits[0]) {
              actions.goto(hits[0].h, hits[0].v);
              actions.toggleSearch(false);
            }
            e.stopPropagation();
          }}
        />
        <ul>
          {hits.map((hit) => (
            <li key={`${hit.h},${hit.v}`}>
              <button
                type="button"
                onClick={() => {
                  actions.goto(hit.h, hit.v);
                  actions.toggleSearch(false);
                }}
              >
                <strong>{hit.title ?? `Slide ${hit.h + 1}${hit.v ? `.${hit.v + 1}` : ""}`}</strong>
                <span>{hit.snippet}</span>
              </button>
            </li>
          ))}
          {query && !hits.length ? <li className="deck-search-empty">Nothing matches.</li> : null}
        </ul>
      </div>
    </div>
  );
}

/** The current slide's notes, rendered under the stage when `showNotes` is on. */
export function NotesFooter() {
  const { meta } = useCurrentSlide();
  const [Notes, setNotes] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    setNotes(null);
    if (!meta?.loadNotes) return;
    void loadSlide(meta);
    meta.loadNotes().then((m) => alive && setNotes(() => m.default as React.ComponentType));
    return () => {
      alive = false;
    };
  }, [meta]);
  if (!Notes) return null;
  return (
    <aside className="deck-notes-footer">
      <MDXProvider>
        <Notes />
      </MDXProvider>
    </aside>
  );
}

export function Toast() {
  const toast = useUi((s) => s.toast);
  return (
    <div className="deck-toast" data-on={toast ? "true" : undefined} role="status">
      {toast}
    </div>
  );
}
