import katex from "katex";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { burstConfetti } from "../react/ConfettiLayer.tsx";
import { FrameShell } from "../react/Frame.tsx";
import { useDeck, useSlide, useSlideOptional } from "../react/context.ts";
import { useActions, useClick, useNav, useUi } from "../react/hooks.ts";

/* ─────────────────────────── Math, diagrams, notes ─────────────────────────── */

/** `$…$` in Markdown is rendered at build time; this is for JSX: `<Math tex="…" block />`. */
export function Tex({
  tex,
  block = false,
  children,
}: {
  tex?: string;
  block?: boolean;
  children?: ReactNode;
}) {
  const source = tex ?? (typeof children === "string" ? children : "");
  const html = useMemo(
    () => katex.renderToString(source, { displayMode: block, throwOnError: false }),
    [source, block],
  );
  return block ? (
    <div className="deck-math" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="deck-math" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

let mermaidPromise: Promise<typeof import("mermaid")> | null = null;

/** A Mermaid diagram, rendered in the browser in the deck's colour scheme. */
export function Mermaid({
  children,
  scale = 1,
  className,
}: {
  children?: ReactNode;
  scale?: number;
  className?: string;
}) {
  const source =
    typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
  const scheme = useUi((s) => s.colorScheme);
  const [svg, setSvg] = useState("");
  const id = useMemo(() => `m${Math.random().toString(36).slice(2, 9)}`, []);
  useEffect(() => {
    let alive = true;
    mermaidPromise ??= import("mermaid");
    mermaidPromise.then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: scheme === "dark" ? "dark" : "neutral",
        securityLevel: "loose",
      });
      try {
        const out = await mermaid.render(id, source.trim());
        if (alive) setSvg(out.svg);
      } catch (e) {
        if (alive) setSvg(`<pre class="deck-mermaid-error">${String(e)}</pre>`);
      }
    });
    return () => {
      alive = false;
    };
  }, [source, scheme, id]);
  return (
    <div
      className={["deck-mermaid", className].filter(Boolean).join(" ")}
      style={{ zoom: scale }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Speaker notes are lifted out at compile time; anything left renders nowhere. */
export function Notes(_props: { children?: ReactNode }) {
  return null;
}

/* ─────────────────────────── Links and the table of contents ─────────────────────────── */

/** Go to a slide by number (1-based), `h.v`, or id. */
export function Link({
  to,
  title,
  children,
  className,
}: {
  to: string | number;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const actions = useActions();
  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    const raw = String(to);
    if (/^\d+$/.test(raw)) actions.gotoFlat(Number(raw) - 1);
    else if (/^\d+\.\d+$/.test(raw)) {
      const [h, v] = raw.split(".").map((n) => Number(n) - 1);
      actions.goto(h!, v!);
    } else actions.gotoId(raw);
  };
  return (
    <a
      href={`#/${to}`}
      onClick={go}
      className={["deck-link", className].filter(Boolean).join(" ")}
      title={title}
    >
      {children ?? title ?? String(to)}
    </a>
  );
}

/** The `a` mapping: in-deck `#/…` links navigate, external links open in a new tab. */
export function Anchor({
  href,
  children,
  ...rest
}: {
  href?: string;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  const actions = useActions();
  if (href?.startsWith("#/")) {
    return (
      <a
        href={href}
        {...rest}
        onClick={(e) => {
          e.preventDefault();
          actions.gotoId(href.slice(2));
        }}
      >
        {children}
      </a>
    );
  }
  const external = !!href && /^https?:/.test(href);
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}

export interface TocProps {
  columns?: number;
  maxDepth?: number;
  minDepth?: number;
  mode?: "all" | "onlyCurrentTree" | "onlySiblings";
  listClass?: string;
}

/** The table of contents from every slide's title and level (`hideInToc` slides skipped). */
export function Toc({
  columns = 1,
  maxDepth = Number.POSITIVE_INFINITY,
  minDepth = 1,
  mode = "all",
  listClass,
}: TocProps) {
  const deck = useDeck();
  const actions = useActions();
  const nav = useNav((s) => ({ h: s.h, v: s.v }));
  const entries = deck.columns.flatMap((c) =>
    c.slides
      .map((s, v) => ({
        h: c.h,
        v,
        title: s.title,
        level: s.level,
        hide: !!s.frontmatter.hideInToc || deck.options.get(`${c.h},${v}`)?.hideInToc,
      }))
      .filter((e) => e.title && !e.hide && e.level >= minDepth && e.level <= maxDepth),
  );
  const currentFlat = entries.findIndex((e) => e.h === nav.h && e.v === nav.v);
  const shown = entries.filter((e, i) => {
    if (mode === "all") return true;
    if (currentFlat === -1) return e.level === minDepth;
    const cur = entries[currentFlat]!;
    if (mode === "onlySiblings") return e.level <= cur.level;
    // onlyCurrentTree: top-level items, plus the children of the current branch.
    if (e.level === minDepth) return true;
    let j = i;
    while (j >= 0 && entries[j]!.level > minDepth) j--;
    let k = currentFlat;
    while (k >= 0 && entries[k]!.level > minDepth) k--;
    return j === k;
  });
  return (
    <ol
      className={["deck-toc", listClass].filter(Boolean).join(" ")}
      style={{ columnCount: columns }}
    >
      {shown.map((e) => (
        <li
          key={`${e.h},${e.v}`}
          className={[
            `level-${e.level}`,
            e.h === nav.h && e.v === nav.v ? "is-current" : "",
            entries.indexOf(e) < currentFlat ? "is-past" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ marginInlineStart: `${(e.level - minDepth) * 1.2}em` }}
        >
          <a
            href={`#/${e.h}${e.v ? `/${e.v}` : ""}`}
            onClick={(ev) => {
              ev.preventDefault();
              actions.goto(e.h, e.v);
            }}
          >
            {e.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────── Media ─────────────────────────── */

/** The `img` mapping: lazy, optionally a lightbox on click (`preview`). */
export function Image({
  src,
  alt = "",
  preview,
  fit,
  className,
  ...rest
}: {
  src?: string;
  alt?: string;
  preview?: boolean | string;
  fit?: string;
  className?: string;
  [key: string]: unknown;
}) {
  const previewSrc = typeof preview === "string" ? preview : preview ? src : undefined;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={["deck-image", className].filter(Boolean).join(" ")}
      data-preview-image={previewSrc}
      data-preview-fit={fit}
      {...rest}
    />
  );
}

export function Video({
  src,
  autoplay,
  loop,
  muted = true,
  controls = false,
  className,
  ...rest
}: {
  src: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <video
      data-src={src}
      data-autoplay={autoplay ? "" : undefined}
      loop={loop}
      muted={muted}
      controls={controls}
      playsInline
      className={["deck-video", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function Audio({
  src,
  autoplay,
  loop,
  controls = true,
  className,
}: {
  src: string;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  className?: string;
}) {
  return (
    <audio
      data-src={src}
      data-autoplay={autoplay ? "" : undefined}
      loop={loop}
      controls={controls}
      className={className}
    />
  );
}

/** An embedded page, loaded only while its slide is near (`preload` loads it earlier). */
export function Iframe({
  src,
  preload,
  className,
  title,
  poster,
  posterSize,
  scale,
}: {
  src: string;
  preload?: boolean;
  className?: string;
  title?: string;
  /** Stands in for the page in print, the overview and the next-slide box, and while it loads. */
  poster?: string;
  posterSize?: readonly [number, number];
  /** Render the page larger and shrink it: 0.5 gives a small pane the desktop layout. */
  scale?: number;
  [key: string]: unknown;
}) {
  return (
    <FrameShell
      url={src}
      preload={preload}
      className={className}
      title={title}
      poster={poster}
      posterSize={posterSize}
      scale={scale}
    />
  );
}

export function Youtube({
  id,
  url,
  autoplay,
  start,
  className,
}: {
  id?: string;
  url?: string;
  autoplay?: boolean;
  start?: number;
  className?: string;
}) {
  const videoId = id ?? (url ? (/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/.exec(url)?.[1] ?? "") : "");
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    ...(autoplay ? { autoplay: "1", mute: "1" } : {}),
    ...(start ? { start: String(start) } : {}),
  });
  return (
    <Iframe
      src={`https://www.youtube-nocookie.com/embed/${videoId}?${params}`}
      className={["deck-youtube", className].filter(Boolean).join(" ")}
    />
  );
}

export function Tweet({
  id,
  url,
  scale = 1,
}: {
  id?: string | number;
  url?: string;
  scale?: number;
}) {
  const tweetId = String(id ?? (url ? (/status\/(\d+)/.exec(url)?.[1] ?? "") : ""));
  const scheme = useUi((s) => s.colorScheme);
  return (
    <div className="deck-tweet" style={{ zoom: scale }}>
      <Iframe
        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=${scheme}&dnt=true`}
      />
    </div>
  );
}

/* ─────────────────────────── Layout helpers ─────────────────────────── */

/** reveal.js's `r-stack`: children stacked at the same spot, for stepping through with clicks. */
export function Stack({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={["deck-stack", className].filter(Boolean).join(" ")}>{children}</div>;
}

/** reveal.js's `r-stretch`: grows to fill the slide's remaining height. */
export function Stretch({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={["deck-stretch", className].filter(Boolean).join(" ")}>{children}</div>;
}

/** Columns: `<Cols cols="2fr 1fr">` or `<Cols n={3}>`, each child a column (or use `<Col>`). */
export function Cols({
  cols,
  n,
  gap = "2rem",
  children,
  className,
  align,
}: {
  cols?: string;
  n?: number;
  gap?: string;
  children?: ReactNode;
  className?: string;
  align?: string;
}) {
  const template = cols ?? `repeat(${n ?? 2}, minmax(0, 1fr))`;
  return (
    <div
      className={["deck-cols", className].filter(Boolean).join(" ")}
      style={{ gridTemplateColumns: template, gap, alignItems: align }}
    >
      {children}
    </div>
  );
}

export function Col({
  children,
  className,
  span,
}: {
  children?: ReactNode;
  className?: string;
  span?: number;
}) {
  return (
    <div
      className={["deck-col", className].filter(Boolean).join(" ")}
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      {children}
    </div>
  );
}

export function Grid({
  cols = 3,
  rows,
  gap = "1.5rem",
  children,
  className,
}: {
  cols?: number | string;
  rows?: number | string;
  gap?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["deck-grid", className].filter(Boolean).join(" ")}
      style={{
        gridTemplateColumns: typeof cols === "number" ? `repeat(${cols}, minmax(0, 1fr))` : cols,
        gridTemplateRows: typeof rows === "number" ? `repeat(${rows}, minmax(0, 1fr))` : rows,
        gap,
      }}
    >
      {children}
    </div>
  );
}

export function Center({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={["deck-center", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function Spacer({ size = "1rem" }: { size?: string }) {
  return <div className="deck-spacer" style={{ height: size }} />;
}

/** reveal.js's `r-frame`. */
export function Frame({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={["deck-frame", className].filter(Boolean).join(" ")}>{children}</div>;
}

/** Slidev's `<Transform>`: scale a block around an origin. */
export function Transform({
  scale = 1,
  origin = "top left",
  children,
  className,
}: {
  scale?: number;
  origin?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["deck-transform", className].filter(Boolean).join(" ")}
      style={{ transform: `scale(${scale})`, transformOrigin: origin }}
    >
      {children}
    </div>
  );
}

/** Place a block at stage coordinates: `<Absolute x={100} y={200} w={400}>`. */
export function Absolute({
  x = 0,
  y = 0,
  w,
  h,
  rotate = 0,
  children,
  className,
}: {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotate?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["deck-absolute", className].filter(Boolean).join(" ")}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** reveal.js's `r-fit-text` and Slidev's `AutoFitText`: as big as fits, no bigger than `max`. */
export function FitText({
  children,
  max = 400,
  min = 12,
  className,
}: {
  children?: ReactNode;
  max?: number;
  min?: number;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const avail = o.clientWidth;
      if (!avail) return;
      let lo = min;
      let hi = max;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        i.style.fontSize = `${mid}px`;
        if (i.scrollWidth <= avail) lo = mid;
        else hi = mid;
      }
      setSize(lo);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    return () => ro.disconnect();
  }, [max, min, children]);
  return (
    <div ref={outer} className={["deck-fit-text", className].filter(Boolean).join(" ")}>
      <span ref={inner} style={{ fontSize: size, whiteSpace: "nowrap", display: "inline-block" }}>
        {children}
      </span>
    </div>
  );
}

/** Slidev's `<Arrow>`: a straight arrow in stage coordinates. */
export function Arrow({
  x1,
  y1,
  x2,
  y2,
  width = 2,
  color = "currentColor",
  twoWay = false,
  className,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  color?: string;
  twoWay?: boolean;
  className?: string;
}) {
  const id = useMemo(() => `arrow${Math.random().toString(36).slice(2, 8)}`, []);
  const minX = Math.min(x1, x2) - 20;
  const minY = Math.min(y1, y2) - 20;
  const w = Math.abs(x2 - x1) + 40;
  const h = Math.abs(y2 - y1) + 40;
  return (
    <svg
      className={["deck-arrow", className].filter(Boolean).join(" ")}
      style={{
        position: "absolute",
        left: minX,
        top: minY,
        width: w,
        height: h,
        overflow: "visible",
        pointerEvents: "none",
      }}
      viewBox={`${minX} ${minY} ${w} ${h}`}
    >
      <defs>
        <marker
          id={id}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={width}
        markerEnd={`url(#${id})`}
        markerStart={twoWay ? `url(#${id})` : undefined}
      />
    </svg>
  );
}

/* ─────────────────────────── Small pieces ─────────────────────────── */

export function Kbd({ children }: { children?: ReactNode }) {
  return <kbd className="deck-kbd">{children}</kbd>;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children?: ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn" | "bad";
  className?: string;
}) {
  return (
    <span className={["deck-badge", `tone-${tone}`, className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

export function Callout({
  kind = "info",
  title,
  children,
  className,
}: {
  kind?: "info" | "tip" | "warn" | "danger" | "note";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={["deck-callout", `kind-${kind}`, className].filter(Boolean).join(" ")}>
      {title ? <strong className="deck-callout-title">{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

/** A number that counts up when its slide is shown (or at its click). */
export function Counter({
  value,
  from = 0,
  duration = 1500,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const slide = useSlide();
  const [shown, setShown] = useState(slide.preview && !slide.active ? value : from);
  useEffect(() => {
    // A slide being watched counts up — the stage, and the audience's mirror, which is a preview
    // in every other respect. A thumbnail of a slide nobody is watching (the overview, print, the
    // presenter's next box) shows the number it ends on.
    if (!slide.active) {
      setShown(slide.preview ? value : from);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slide.active, slide.preview, value, from, duration]);
  return (
    <span className={["deck-counter", className].filter(Boolean).join(" ")}>
      {prefix}
      {shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Text that types itself out when the slide is shown. */
export function Typewriter({
  text,
  speed = 35,
  className,
  cursor = true,
}: {
  text: string;
  speed?: number;
  className?: string;
  cursor?: boolean;
}) {
  const slide = useSlide();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!slide.active) {
      setN(0);
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [slide.active, text, speed]);
  return (
    <span className={["deck-typewriter", className].filter(Boolean).join(" ")}>
      {text.slice(0, n)}
      {cursor && n < text.length ? <span className="deck-typewriter-cursor">▍</span> : null}
    </span>
  );
}

const GLYPHS = "!<>-_\\/[]{}—=+*^?#________";

/** Text that resolves out of noise, glyph by glyph — the RLA deck's `EncryptedText`. */
export function Encrypted({
  text,
  speed = 30,
  delay = 0,
  className,
}: {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
}) {
  const slide = useSlide();
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!slide.active) {
      setOut(text.replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!));
      return;
    }
    let frame = 0;
    const perChar = 3;
    const total = text.length * perChar + 10;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      if (t < start) {
        raf = requestAnimationFrame(tick);
        return;
      }
      frame++;
      const resolved = Math.floor(frame / perChar);
      setOut(
        text
          .split("")
          .map((ch, i) =>
            ch === " "
              ? " "
              : i < resolved
                ? ch
                : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!,
          )
          .join(""),
      );
      if (frame < total)
        raf = setTimeout(() => requestAnimationFrame(tick), speed) as unknown as number;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(raf);
    };
  }, [slide.active, text, speed, delay]);
  return <span className={["deck-encrypted", className].filter(Boolean).join(" ")}>{out}</span>;
}

/** A countdown or stopwatch that starts when its slide is shown. */
export function Timer({ seconds, className }: { seconds?: number; className?: string }) {
  const slide = useSlide();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!slide.active) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(t);
  }, [slide.active]);
  const value = seconds !== undefined ? Math.max(0, seconds - elapsed) : elapsed;
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return (
    <span
      className={["deck-timer", seconds !== undefined && value === 0 ? "is-done" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

/** A hand-drawn mark around inline content, drawn on its click: underline, circle, box, highlight. */
export function Mark({
  type = "underline",
  color = "var(--deck-accent)",
  at,
  children,
  className,
}: {
  type?: "underline" | "circle" | "box" | "highlight" | "strike";
  color?: string;
  at?: number | string;
  children?: ReactNode;
  className?: string;
}) {
  const { shown } = useClick({ at });
  return (
    <span
      className={["deck-mark", `type-${type}`, shown ? "is-on" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{ "--mark-color": color } as React.CSSProperties}
    >
      {children}
    </span>
  );
}

/** A quick burst of confetti when the slide (or its click) arrives. */
export function Confetti({
  at,
  count = 140,
  duration = 2200,
}: {
  at?: number | string;
  count?: number;
  duration?: number;
}) {
  const { shown, current } = useClick(at !== undefined ? { at } : { at: "+0" });
  const slide = useSlideOptional();
  const canvas = useRef<HTMLCanvasElement>(null);
  const fire = at !== undefined ? shown && current : !!slide?.active;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !fire) return;
    return burstConfetti(c, { count, duration });
  }, [fire, count, duration]);
  return <canvas ref={canvas} className="deck-confetti" aria-hidden />;
}

/** A QR code, rendered locally. */
export function Qr({
  value,
  size = 240,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" }),
      )
      .then((url) => alive && setSrc(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img
      src={src}
      width={size}
      height={size}
      alt={`QR code for ${value}`}
      className={["deck-qr", className].filter(Boolean).join(" ")}
    />
  ) : (
    <div className="deck-qr" style={{ width: size, height: size }} />
  );
}
