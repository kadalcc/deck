import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { KEY_BINDINGS } from "../core/keyboard.ts";
import { availableRoutes, formatSlideNumber, progressOf } from "../core/navigation.ts";
import { useDeck } from "./context.ts";
import { HintLayer } from "./Hints.tsx";
import { ConfettiLayer } from "./ConfettiLayer.tsx";
import { ThemeMenu } from "./ThemeMenu.tsx";
import { useActions, useCurrentSlide, useNav, useUi } from "./hooks.ts";
import { loadSlide } from "./SlideFrame.tsx";

/**
 * The chrome around the slides: arrows, progress, the slide number, the pause curtain, the
 * help sheet, jump-to, search, the speaker-notes footer, and a toast. Each piece reads only the
 * slice of state it needs.
 */
export function Chrome() {
  const deck = useDeck();
  return (
    <>
      {deck.config.controls === true ? <Controls /> : null}
      {deck.config.progress ? <Progress /> : null}
      {deck.config.slideNumber &&
      (deck.config.showSlideNumber === "all" ||
        (deck.config.showSlideNumber === "print" && deck.mode === "print")) ? (
        <SlideNumber />
      ) : null}
      {deck.config.showNotes ? <NotesFooter /> : null}
      <ThemeMenu />
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
      disabled={!enabled}
      hidden={isBack && back === "hidden" && enabled}
      onClick={onClick}
    >
      <span />
    </button>
  );
  return (
    <div
      className={`deck-controls layout-${deck.config.controlsLayout}`}
      aria-hidden={nav.overview || undefined}
    >
      {arrow("left", routes.left || routes.prevClick, actions.prev, true)}
      {arrow("right", routes.right || routes.nextClick, actions.next, false)}
      {arrow("up", routes.up, actions.up, true)}
      {arrow("down", routes.down, actions.down, false)}
    </div>
  );
}

export function Progress() {
  const deck = useDeck();
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  const actions = useActions();
  const p = progressOf(
    {
      ...nav,
      click: 0,
      direction: "none",
      overview: false,
      paused: false,
      autoSliding: false,
      totals: {},
      presenter: null,
      follow: true,
      seq: 0,
    },
    deck.columns,
  );
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const total = deck.columns.reduce((n, c) => n + c.slides.length, 0);
    actions.gotoFlat(Math.round(frac * (total - 1)));
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

export function SlideNumber() {
  const deck = useDeck();
  const nav = useNav((s) => ({ h: s.h, v: s.v, click: s.click }));
  const format = deck.config.slideNumber === true ? "h.v" : deck.config.slideNumber;
  if (!format) return null;
  const text = formatSlideNumber(format, nav, deck.columns, true);
  return (
    <a
      className="deck-slide-number"
      href={typeof window === "undefined" ? undefined : window.location.hash}
    >
      {text}
    </a>
  );
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
    >
      <span>Paused — press any key</span>
    </div>
  );
}

export function HelpSheet() {
  const open = useUi((s) => s.help);
  const actions = useActions();
  if (!open) return null;
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
            {KEY_BINDINGS.map((b) => (
              <tr key={b.action}>
                <td>
                  <kbd>{b.label}</kbd>
                </td>
                <td>{b.description}</td>
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
    const raw = value.trim();
    if (/^\d+$/.test(raw)) actions.gotoFlat(Number(raw) - 1);
    else if (/^\d+\.\d+$/.test(raw)) {
      const [h, v] = raw.split(".").map((n) => Number(n) - 1);
      actions.goto(h!, v!);
    } else if (raw) actions.gotoId(raw);
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
      <Notes />
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
