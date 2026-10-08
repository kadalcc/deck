import {
  Children,
  type ReactNode,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useStore } from "../core/store.ts";
import {
  type GlossaryEntry,
  adhocId,
  buildMatcher,
  inlineHtml,
  linkLabel,
} from "../glossary/model.ts";
import { type TermReveal, useDeck, useSlideOptional } from "../react/context.ts";
import { closeTerm, entryFor, mentionIndex, openTerm, slideKeyOf } from "../react/terms.ts";
import { Icon } from "./bling.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Term>  —  a key concept or abbreviation that can explain itself
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * At rest a term reads like the text around it, with a faint dotted underline. Rest the pointer
 * on it and a countdown runs — the cursor becomes a filling pie and the underline draws itself
 * solid — so sweeping the mouse across a slide never sets cards off; when it completes, the
 * definition opens in a card anchored to the word. A click, a tap or an `f` hint label opens it
 * at once and pins it while you talk. Escape, a press elsewhere or the next step closes it.
 *
 * Most terms are never written by hand: the compiler wraps the first mention of every glossary
 * entry on each slide (`compiler/rehype-glossary.ts`). By hand:
 *
 *   <Term>UTM</Term>                                   the glossary's entry, found by name or alias
 *   <Term id="utm">projected metres</Term>            other words, same entry
 *   <Term def="Root-mean-square error, in metres.">RMSE</Term>      a one-off, no entry needed
 *   <Term def="…" title="Thiessen polygon" full="…" tag="Geometry" link="https://…">cells</Term>
 *
 * The card lives inside the slide's canvas, in stage pixels, so it is part of the picture every
 * screen shows — and it never lets its type fall below a readable size: on a small window or a
 * phone the card grows against the canvas's scale instead of shrinking with it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface TermProps {
  /** The glossary entry (its id, name or alias). Without it the children's text is looked up. */
  id?: string;
  /** A one-off definition (inline Markdown). With it, the glossary is not consulted. */
  def?: string;
  more?: string;
  /** The card's title for a one-off; defaults to the children's text. */
  title?: string;
  full?: string;
  tag?: string;
  link?: string;
  /** Set by the compiler: `def`/`more` already rendered (with KaTeX), and an automatic link. */
  html?: string;
  moreHtml?: string;
  auto?: boolean;
  children?: ReactNode;
}

/** The smallest the card's body type may get on screen, in CSS pixels. */
const MIN_BODY_PX = 13;
/** The card's body type in stage pixels at zoom 1 (the stylesheet's `--term-body`). */
const BODY_STAGE_PX = 23;
const CLOSE_GRACE = 180;

function textOf(node: ReactNode): string {
  let out = "";
  Children.forEach(node, (c) => {
    if (typeof c === "string" || typeof c === "number") out += String(c);
    else if (isValidElement<{ children?: ReactNode }>(c)) out += textOf(c.props.children);
  });
  return out;
}

/** The countdown cursor Paadam and the Sanket docs use: a 24 px ring whose pie fills over the delay. */
function pieCursor(fraction: number): string {
  const f = Math.max(0, Math.min(1, fraction));
  const ink = "%23475569";
  let fill = "";
  if (f >= 0.999) fill = `<circle cx='12' cy='12' r='7' fill='${ink}'/>`;
  else if (f > 0.01) {
    const a = 2 * Math.PI * f;
    const x = (12 + 7 * Math.sin(a)).toFixed(2);
    const y = (12 - 7 * Math.cos(a)).toFixed(2);
    fill = `<path d='M12 12 L12 5 A7 7 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y} Z' fill='${ink}'/>`;
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>` +
    `<circle cx='12' cy='12' r='9' fill='white' fill-opacity='0.85'/>` +
    `<circle cx='12' cy='12' r='9' fill='none' stroke='${ink}' stroke-width='1'/>${fill}</svg>`;
  return `url("data:image/svg+xml;utf8,${svg}") 12 12, help`;
}

export function Term({
  id,
  def,
  more,
  title,
  full,
  tag,
  link,
  html,
  moreHtml,
  auto,
  children,
}: TermProps) {
  const deck = useDeck();
  const slide = useSlideOptional();
  const label = useMemo(() => textOf(children).replace(/\s+/g, " ").trim(), [children]);

  const oneOff = def !== undefined || html !== undefined;
  const entry = useMemo<GlossaryEntry | undefined>(() => {
    if (!oneOff) return entryFor(deck, id ?? label) ?? resolveByWord(deck.glossary, id ?? label);
    const source = String(def ?? "");
    return {
      id: id ?? adhocId(`${label}|${source}`),
      name: title ?? label,
      full: full ?? null,
      aliases: [],
      tag: tag ?? null,
      link: link ? { href: link, label: linkLabel(link) } : null,
      see: [],
      auto: false,
      html: {
        def: html ?? inlineHtml(source.replace(/\s+/g, " ").trim()),
        more: moreHtml ?? (more ? inlineHtml(more.replace(/\s+/g, " ").trim()) : null),
      },
    };
  }, [oneOff, deck, id, label, def, more, title, full, tag, link, html, moreHtml]);

  // A one-off's words are known only here; registering them lets the phone's readout and a
  // relayed reveal find them by id like any glossary entry.
  useEffect(() => {
    if (oneOff && entry) deck.glossary.set(entry.id, entry);
  }, [oneOff, entry, deck.glossary]);

  const live = !!entry && !!slide && slide.terms && deck.mode !== "print";
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<TermReveal | null>(null);
  const [arming, setArming] = useState(false);
  const timers = useRef({ open: 0, close: 0, raf: 0 });
  const delay = deck.config.glossary.delay;
  const slideKey = slide ? `${slide.h},${slide.v}` : "";

  // Is the window's card ours? Asked of the DOM, because "which mention" is a document-order fact.
  useEffect(() => {
    if (!live || !entry) return;
    const check = (r: TermReveal | null) => {
      const el = ref.current;
      const mine =
        !!r && !!el && r.id === entry.id && r.slide === slideKey && mentionIndex(el, r.id) === r.n;
      setShown(mine ? r : null);
    };
    check(deck.terms.get());
    return deck.terms.subscribe(check);
  }, [live, entry, slideKey, deck.terms]);

  const disarm = useCallback(() => {
    const t = timers.current;
    if (t.open) clearTimeout(t.open);
    if (t.raf) cancelAnimationFrame(t.raf);
    t.open = 0;
    t.raf = 0;
    if (ref.current) ref.current.style.cursor = "";
    setArming(false);
  }, []);
  const holdOpen = useCallback(() => {
    if (timers.current.close) clearTimeout(timers.current.close);
    timers.current.close = 0;
  }, []);
  useEffect(
    () => () => {
      disarm();
      holdOpen();
    },
    [disarm, holdOpen],
  );

  const reveal = useCallback(
    (pinned: boolean) => {
      const el = ref.current;
      if (!el || !entry) return;
      const key = slideKeyOf(el);
      if (!key) return;
      disarm();
      holdOpen();
      openTerm(deck, {
        slide: key,
        id: entry.id,
        n: mentionIndex(el, entry.id),
        view: null,
        pinned,
        from: "local",
      });
    },
    [deck, entry, disarm, holdOpen],
  );

  const leaveSoon = useCallback(() => {
    holdOpen();
    timers.current.close = window.setTimeout(() => {
      const now = deck.terms.get();
      if (now && !now.pinned && now.from === "local") closeTerm(deck);
    }, CLOSE_GRACE);
  }, [deck, holdOpen]);

  if (!entry) return <>{children}</>;
  if (!live) {
    return (
      <span className="deck-term is-inert" data-term={entry.id}>
        {children}
      </span>
    );
  }

  const cardId = `deck-term-${entry.id.replace(/[^a-z0-9-]/gi, "")}-${slideKey.replace(",", "-")}`;
  return (
    <>
      <span
        ref={ref}
        role="term"
        className={[
          "deck-term",
          auto ? "is-auto" : "",
          arming ? "is-arming" : "",
          shown ? "is-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ "--term-delay": `${delay}ms` } as React.CSSProperties}
        data-term={entry.id}
        data-hint=""
        aria-describedby={shown ? cardId : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || deck.ui.get().drawing) return;
          holdOpen();
          if (shown || timers.current.open) return;
          setArming(true);
          const t0 = performance.now();
          let last = -1;
          const tick = () => {
            const f = (performance.now() - t0) / Math.max(1, delay);
            if (f >= 1) return;
            const step = Math.floor(f * 12); // twelve frames read as motion and cost nothing
            if (step !== last && ref.current) {
              last = step;
              ref.current.style.cursor = pieCursor(f);
            }
            timers.current.raf = requestAnimationFrame(tick);
          };
          if (delay > 0) timers.current.raf = requestAnimationFrame(tick);
          timers.current.open = window.setTimeout(() => reveal(false), delay);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          disarm();
          if (shown && !shown.pinned) leaveSoon();
        }}
        onClick={(e) => {
          // The slide's own click handlers (the phone mirror's "open full screen") stay out of it.
          e.preventDefault();
          e.stopPropagation();
          if (shown?.pinned && shown.from === "local") closeTerm(deck);
          else reveal(true);
        }}
      >
        {children}
      </span>
      {shown ? (
        <TermCard
          id={cardId}
          anchor={ref}
          entry={entry}
          reveal={shown}
          onEnter={holdOpen}
          onLeave={() => {
            if (!shown.pinned && shown.from === "local") leaveSoon();
          }}
        />
      ) : null}
    </>
  );
}

let wordIndex: {
  map: Map<string, GlossaryEntry>;
  matcher: ReturnType<typeof buildMatcher>;
} | null = null;
function matcherFor(glossary: Map<string, GlossaryEntry>) {
  if (!wordIndex || wordIndex.map !== glossary) {
    wordIndex = { map: glossary, matcher: buildMatcher([...glossary.values()]) };
  }
  return wordIndex.matcher;
}
/** A hand-written `<Term>` the compiler never saw (inside a custom component): find it by name. */
function resolveByWord(glossary: Map<string, GlossaryEntry>, word: string) {
  return matcherFor(glossary).resolve(word);
}

/**
 * Links the glossary's mentions inside a plain string, at render time — for a component whose
 * words arrive as a prop (`<Stat label="quantisation RMSE" />`), where the compiler, which only
 * sees a slide's children, cannot reach. The first mention of each term in the string is linked.
 *
 *   <small><Terms>{note}</Terms></small>
 */
export function Terms({ children }: { children?: string | null }) {
  const deck = useDeck();
  const text = children ?? "";
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    const seen = new Set<string>();
    let last = 0;
    for (const m of matcherFor(deck.glossary).find(text)) {
      if (seen.has(m.entry.id)) continue;
      seen.add(m.entry.id);
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(
        <Term key={m.index} id={m.entry.id} auto>
          {m.text}
        </Term>,
      );
      last = m.index + m.text.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [deck.glossary, text]);
  return <>{parts}</>;
}

interface Placement {
  left: number;
  top: number;
  arrow: number;
  above: boolean;
  zoom: number;
  ready: boolean;
}

function TermCard({
  id,
  anchor,
  entry,
  reveal,
  onEnter,
  onLeave,
}: {
  id: string;
  anchor: React.RefObject<HTMLSpanElement | null>;
  entry: GlossaryEntry;
  reveal: TermReveal;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const deck = useDeck();
  const card = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<Placement>({
    left: 0,
    top: 0,
    arrow: 40,
    above: true,
    zoom: 1,
    ready: false,
  });
  const sync = useStore(deck.ui, (s) => s.termSync);
  const viewed = (reveal.view ? entryFor(deck, reveal.view) : undefined) ?? entry;

  useLayoutEffect(() => {
    const el = anchor.current;
    const slide = el?.closest<HTMLElement>(".deck-slide") ?? null;
    // A host that shows definitions its own way (the phone page's readout) keeps the canvas clear.
    setHost(slide && !slide.closest("[data-term-cards='off']") ? slide : null);
  }, [anchor]);

  // Measure in stage pixels: client rectangles over the canvas's on-screen scale. The first line
  // box anchors a term that wraps; the card goes above unless only below has the room.
  useLayoutEffect(() => {
    const el = anchor.current;
    const box = card.current;
    if (!el || !box || !host) return;
    const measure = () => {
      const sr = host.getBoundingClientRect();
      const scale = sr.width / host.offsetWidth || 1;
      const zoom = Math.min(3.2, Math.max(1, MIN_BODY_PX / (BODY_STAGE_PX * scale)));
      const tr = el.getClientRects()[0] ?? el.getBoundingClientRect();
      const W = host.offsetWidth;
      const H = host.offsetHeight;
      const x = (tr.left - sr.left) / scale;
      const y = (tr.top - sr.top) / scale;
      const w = tr.width / scale;
      const h = tr.height / scale;
      const cw = box.offsetWidth;
      const ch = box.offsetHeight;
      const gap = 16 * zoom;
      const pad = 20;
      const roomAbove = y - gap - pad;
      const roomBelow = H - (y + h) - gap - pad;
      const above = roomAbove >= ch || roomAbove >= roomBelow;
      const left = Math.min(Math.max(pad, x + w / 2 - cw / 2), Math.max(pad, W - cw - pad));
      const top = above ? Math.max(pad, y - gap - ch) : Math.min(y + h + gap, H - ch - pad);
      const arrow = Math.min(Math.max(28 * zoom, x + w / 2 - left), cw - 28 * zoom);
      setPlace((p) =>
        p.ready &&
        Math.abs(p.left - left) < 0.5 &&
        Math.abs(p.top - top) < 0.5 &&
        Math.abs(p.arrow - arrow) < 0.5 &&
        p.above === above &&
        p.zoom === zoom
          ? p
          : { left, top, arrow, above, zoom, ready: true },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchor, host, viewed]);

  if (!host) return null;
  const swap = (view: string | null) => {
    const now = deck.terms.get();
    if (now) openTerm(deck, { ...now, view, pinned: true, from: "local" });
  };

  return createPortal(
    <div
      ref={card}
      id={id}
      role="tooltip"
      className={[
        "deck-term-card",
        place.above ? "is-above" : "is-below",
        place.ready ? "is-ready" : "",
        reveal.pinned ? "is-pinned" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          left: place.left,
          top: place.top,
          "--term-arrow": `${place.arrow}px`,
          "--term-zoom": place.zoom,
        } as React.CSSProperties
      }
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <TermBody
        entry={viewed}
        origin={viewed === entry ? null : entry}
        onView={swap}
        badge={
          reveal.from === "remote"
            ? { icon: "radio", text: "From the presenter" }
            : deck.isPresenter && sync
              ? { icon: "radio", text: "On every screen" }
              : null
        }
      />
      {reveal.pinned ? (
        <button
          type="button"
          className="deck-term-close"
          aria-label="Close"
          onClick={() => closeTerm(deck)}
        >
          <Icon name="x" />
        </button>
      ) : null}
    </div>,
    host,
  );
}

/** What a definition says, shared by the card on the slide and the readout on a phone. */
function TermBody({
  entry,
  origin,
  onView,
  badge,
}: {
  entry: GlossaryEntry;
  /** The term the card was opened on, when a "see also" chip has swapped it. */
  origin: GlossaryEntry | null;
  onView: (id: string | null) => void;
  badge: { icon: string; text: string } | null;
}) {
  const deck = useDeck();
  const related = entry.see
    .map((id) => entryFor(deck, id))
    .filter((e): e is GlossaryEntry => !!e && e.id !== origin?.id);
  return (
    <>
      <div className="deck-term-head">
        <Icon name="book-open-text" className="deck-term-icon" />
        <span className="deck-term-name">{entry.name}</span>
        {entry.tag ? <span className="deck-term-tag">{entry.tag}</span> : null}
      </div>
      {entry.full ? <div className="deck-term-full">{entry.full}</div> : null}
      <p className="deck-term-def" dangerouslySetInnerHTML={{ __html: entry.html.def }} />
      {entry.html.more ? (
        <p className="deck-term-more" dangerouslySetInnerHTML={{ __html: entry.html.more }} />
      ) : null}
      {origin || related.length || entry.link || badge ? (
        <div className="deck-term-foot">
          {origin ? (
            <button type="button" className="deck-term-see is-back" onClick={() => onView(null)}>
              <Icon name="arrow-left" /> {origin.name}
            </button>
          ) : null}
          {related.length ? <span className="deck-term-see-label">See also</span> : null}
          {related.map((r) => (
            <button type="button" key={r.id} className="deck-term-see" onClick={() => onView(r.id)}>
              {r.name}
            </button>
          ))}
          {entry.link ? (
            <a
              className="deck-term-link"
              href={entry.link.href}
              target="_blank"
              rel="noopener noreferrer"
              data-no-preview=""
            >
              {entry.link.label} <Icon name="arrow-up-right" />
            </a>
          ) : null}
          {badge ? (
            <span className="deck-term-badge">
              <Icon name={badge.icon} /> {badge.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * The window's open definition as ordinary page content, at reading size — for a page whose slide
 * is too small to carry a card (the audience's phone). Put the mirror inside an element with
 * `data-term-cards="off"` and this beside it.
 */
export function TermReadout({ className }: { className?: string }) {
  const deck = useDeck();
  const reveal = useStore(deck.terms);
  const entry = reveal ? entryFor(deck, reveal.id) : undefined;
  if (!reveal || !entry) return null;
  const viewed = (reveal.view ? entryFor(deck, reveal.view) : undefined) ?? entry;
  return (
    <div className={["deck-term-readout", className].filter(Boolean).join(" ")} role="status">
      <TermBody
        entry={viewed}
        origin={viewed === entry ? null : entry}
        onView={(view) => openTerm(deck, { ...reveal, view, pinned: true, from: "local" })}
        badge={reveal.from === "remote" ? { icon: "radio", text: "From the presenter" } : null}
      />
      <button
        type="button"
        className="deck-term-close"
        aria-label="Close"
        onClick={() => closeTerm(deck)}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}
