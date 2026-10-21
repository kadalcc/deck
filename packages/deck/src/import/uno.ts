import { PALETTE, SHADES } from "./uno-palette.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SLIDEV'S UTILITY CLASSES, AS PLAIN CSS FOR THE CLASSES A DECK USES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A Slidev deck is styled with UnoCSS (preset-wind3 + attributify + Slidev's shortcuts): `text-3xl`,
 * `grid grid-cols-2 gap-4`, `abs-br m-6`, `op-50`, `bg-primary/10`, `<div grid="~ cols-2 gap-4">`.
 * Kadal has no utility engine of its own; the starter carries Tailwind v4, which knows most of the
 * wind3 names but not the Uno-only spellings (`op70`, `abs-tr`, `border-main`, `m-t-4`, attributify),
 * and the hosted shell — which compiles decks in the browser — has none at all.
 *
 * So the importer writes the CSS itself: this module turns every class the converted deck uses into
 * a rule, and nothing else (a deck that uses forty classes gets forty rules, not a framework). The
 * output is a plain stylesheet, so it works the same under `kadal-deck build` and in the shell.
 *
 * Scale. Slidev draws on a 980px-wide canvas with a 16px rem; Kadal on a 1920px stage. Every length
 * here is written in `--slidev-rem` (one Slidev rem at Kadal's scale, set by the stylesheet's
 * header) or, for px, multiplied by the same factor, so `w-80` takes the same third of the slide
 * and `text-xl` the same height it did in Slidev. The ported themes measure in the same unit.
 *
 * Coverage: the families the Slidev starter, its docs and the themes' READMEs use — spacing,
 * sizing, inset, flex and grid, type, colours with opacity, borders and radii, shadows, opacity,
 * transforms, transitions and animations, a handful of effects — with the variants hover/focus/…,
 * `dark:`/`light:`, `sm:`…`2xl:` and `lt-*:`, `print:`, `forward:`/`backward:`, `group-hover:` and
 * `!` (important). A class it does not know comes back in `unknown`, for the import report; under
 * `kadal-deck build` Tailwind may still style it, at Tailwind's own (unscaled) size.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface UtilityOptions {
  /** Kadal stage width ÷ Slidev canvas width (1920 / 980 for a default deck). */
  scale: number;
}

export interface UtilityResult {
  css: string;
  /** Classes that are not utilities this engine knows (custom classes, or unsupported ones). */
  unknown: string[];
}

type Decls = Record<string, string>;
interface RuleOut {
  decls: Decls;
  /** Extra selector text after the class (e.g. ` > * + *` for space-x). */
  suffix?: string;
}
type Rule = [
  RegExp,
  (m: RegExpExecArray, c: Ctx) => RuleOut | Record<string, string | undefined> | null,
];

interface Ctx {
  scale: number;
  neg: boolean;
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
const rem = (n: number) =>
  n === 0 ? "0" : n === 1 ? "var(--slidev-rem)" : `calc(${fmt(n)} * var(--slidev-rem))`;
const px = (n: number, c: Ctx) => (n === 0 ? "0" : `${fmt(n * c.scale)}px`);
const neg = (v: string, c: Ctx) =>
  !c.neg || v === "0" || v === "auto"
    ? v
    : v.startsWith("calc(")
      ? `calc(-1 * ${v.slice(5, -1)})`
      : v.startsWith("var(")
        ? `calc(-1 * ${v})`
        : `-${v}`;

/** Scale the `px` lengths in a CSS value; `rem` becomes Slidev's rem. */
export function scaleCssValue(value: string, scale: number): string {
  return value.replace(/(-?\d*\.?\d+)(px|rem)\b/g, (_, n: string, unit: string) => {
    const v = Number(n);
    if (unit === "rem") return rem(v);
    return v === 0 || Math.abs(v) === 1 ? `${n}px` : `${fmt(v * scale)}px`;
  });
}

/** Slidev's CSS variables in a `$name` utility value (`bg-$slidev-code-background`), Kadal's names. */
const SLIDEV_VARS: Record<string, string> = {
  "slidev-theme-primary": "--deck-accent",
  "slidev-code-background": "--deck-code-bg",
  "slidev-code-foreground": "--deck-code-fg",
  "slidev-code-radius": "--deck-radius",
};
const cssVar = (v: string) => SLIDEV_VARS[v.slice(1)] ?? `--${v.slice(1)}`;

/** `[1fr_max-content]` → `1fr max-content`, px scaled. */
function arbitrary(v: string, c: Ctx): string | null {
  const m = /^\[(.+)\]$/.exec(v);
  if (!m) return null;
  return scaleCssValue(m[1]!.replace(/_/g, " "), c.scale);
}

/** A spacing/sizing value: 4 → 1rem, 1/2 → 50%, px, full, auto, [12px], 10px, 50%. */
function size(v: string, c: Ctx, axis?: "x" | "y"): string | null {
  if (v === undefined || v === "") return null;
  const a = arbitrary(v, c);
  if (a !== null) return a;
  if (v.startsWith("$")) return `var(${cssVar(v)})`;
  if (/^\d+(\.\d+)?$/.test(v)) return rem(Number(v) / 4);
  if (/^\d+\/\d+$/.test(v)) {
    const [p, q] = v.split("/").map(Number);
    return `${fmt((p! / q!) * 100)}%`;
  }
  const unit = /^(\d*\.?\d+)(px|rem|em|%|vw|vh|ch|ex|vmin|vmax)$/.exec(v);
  if (unit) {
    const n = Number(unit[1]);
    return unit[2] === "px" ? px(n, c) : unit[2] === "rem" ? rem(n) : v;
  }
  const named: Record<string, string> = {
    px: px(1, c),
    full: "100%",
    auto: "auto",
    min: "min-content",
    max: "max-content",
    fit: "fit-content",
    prose: "65ch",
    none: "none",
  };
  if (v === "screen") return axis === "y" ? "100vh" : "100vw";
  return named[v] ?? null;
}

const MAX_W: Record<string, number> = {
  xs: 20,
  sm: 24,
  md: 28,
  lg: 32,
  xl: 36,
  "2xl": 42,
  "3xl": 48,
  "4xl": 56,
  "5xl": 64,
  "6xl": 72,
  "7xl": 80,
};

/* ── colours ─────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace(/^#/, "");
  if (h.length === 3 || h.length === 4)
    h = h
      .slice(0, 3)
      .split("")
      .map((x) => x + x)
      .join("");
  if (h.length !== 6 && h.length !== 8) return null;
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A colour with an opacity slot: `(alpha) => css`. `alpha` is a CSS number expression (a literal
 * from `/50`, or the `--un-*-opacity` variable a separate `bg-opacity-50` sets).
 */
type Color = (alpha: string) => string;

function colorOf(raw: string): { color: Color; alpha: string | null } | null {
  let v = raw;
  let alpha: string | null = null;
  const slash = /^(.+?)\/(\d+(?:\.\d+)?|\[[^\]]+\])$/.exec(v);
  if (slash) {
    v = slash[1]!;
    const a = slash[2]!;
    alpha = a.startsWith("[") ? a.slice(1, -1) : fmt(Number(a) / 100);
  }
  const named: Record<string, string> = {
    transparent: "transparent",
    current: "currentColor",
    currentColor: "currentColor",
    inherit: "inherit",
  };
  if (named[v]) return { color: () => named[v]!, alpha };
  if (v === "white" || v === "black") {
    const ch = v === "white" ? "255 255 255" : "0 0 0";
    return { color: (a) => `rgb(${ch} / ${a})`, alpha };
  }
  // Slidev's theme colour: `text-primary`, `bg-primary/10` (the Kadal themes' accent).
  if (v === "primary") return { color: mix("var(--deck-accent)"), alpha };
  if (v.startsWith("$")) return { color: mix(`var(${cssVar(v)})`), alpha };
  const arb = /^\[(.+)\]$/.exec(v)?.[1] ?? (/^#[0-9a-f]{3,8}$/i.test(v) ? v : null);
  if (arb) {
    const rgb = hexToRgb(arb);
    if (rgb) return { color: (a) => `rgb(${rgb.join(" ")} / ${a})`, alpha };
    if (/^(rgb|hsl|oklch|oklab|lab|lch|color|var)\(/.test(arb) || /^[a-z]+$/i.test(arb))
      return { color: mix(arb.replace(/_/g, " ")), alpha };
    return null;
  }
  const m = /^([a-z]+)(?:-?(\d{2,3}))?$/.exec(v);
  if (m && PALETTE[m[1]!]) {
    const shade = m[2] ?? "400";
    const i = SHADES.indexOf(shade);
    if (i < 0) return null;
    const ch = PALETTE[m[1]!]!.split(",")[i]!;
    return { color: (a) => `oklch(${ch} / ${a})`, alpha };
  }
  return null;
}

/** A colour we only have as a CSS value: opacity through color-mix. */
function mix(css: string): Color {
  return (a) => (a === "1" ? css : `color-mix(in oklab, ${css} calc(${a} * 100%), transparent)`);
}

function colorDecl(prop: string, raw: string, opacityVar: string): Decls | null {
  const c = colorOf(raw);
  if (!c) return null;
  if (c.alpha !== null) return { [prop]: c.color(c.alpha) };
  return { [opacityVar]: "1", [prop]: c.color(`var(${opacityVar})`) };
}

/* ── the rules ───────────────────────────────────────────────────────────── */

const TEXT_SIZES: Record<string, [number, string]> = {
  xs: [0.75, "1rem"],
  sm: [0.875, "1.25rem"],
  base: [1, "1.5rem"],
  lg: [1.125, "1.75rem"],
  xl: [1.25, "1.75rem"],
  "2xl": [1.5, "2rem"],
  "3xl": [1.875, "2.25rem"],
  "4xl": [2.25, "2.5rem"],
  "5xl": [3, "1"],
  "6xl": [3.75, "1"],
  "7xl": [4.5, "1"],
  "8xl": [6, "1"],
  "9xl": [8, "1"],
};
const WEIGHTS: Record<string, string> = {
  thin: "100",
  extralight: "200",
  light: "300",
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
};
const RADII: Record<string, number> = {
  none: 0,
  sm: 0.125,
  DEFAULT: 0.25,
  md: 0.375,
  lg: 0.5,
  xl: 0.75,
  "2xl": 1,
  "3xl": 1.5,
};
const SHADOWS: Record<string, string> = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
  inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
  none: "0 0 #0000",
};
const BLURS: Record<string, number> = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 40,
  "3xl": 64,
};
const LEADING: Record<string, string> = {
  none: "1",
  tight: "1.25",
  snug: "1.375",
  normal: "1.5",
  relaxed: "1.625",
  loose: "2",
};
const TRACKING: Record<string, string> = {
  tighter: "-0.05em",
  tight: "-0.025em",
  normal: "0em",
  wide: "0.025em",
  wider: "0.05em",
  widest: "0.1em",
};
const EASE: Record<string, string> = {
  linear: "linear",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
  DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
};
const DIRS: Record<string, string[]> = {
  "": [""],
  x: ["-left", "-right"],
  y: ["-top", "-bottom"],
  t: ["-top"],
  r: ["-right"],
  b: ["-bottom"],
  l: ["-left"],
  s: ["-inline-start"],
  e: ["-inline-end"],
};
const INSET_DIRS: Record<string, string[]> = {
  inset: ["top", "right", "bottom", "left"],
  "inset-x": ["left", "right"],
  "inset-y": ["top", "bottom"],
  top: ["top"],
  right: ["right"],
  bottom: ["bottom"],
  left: ["left"],
  start: ["inset-inline-start"],
  end: ["inset-inline-end"],
};
const ALIGN: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
  stretch: "stretch",
  baseline: "baseline",
  normal: "normal",
};
const KEYFRAMES: Record<string, string> = {
  spin: "@keyframes slidev-spin { to { transform: rotate(360deg); } }",
  ping: "@keyframes slidev-ping { 75%, 100% { transform: scale(2); opacity: 0; } }",
  pulse: "@keyframes slidev-pulse { 50% { opacity: 0.5; } }",
  bounce:
    "@keyframes slidev-bounce { 0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); } 50% { transform: none; animation-timing-function: cubic-bezier(0, 0, 0.2, 1); } }",
};
const ANIMATIONS: Record<string, string> = {
  spin: "slidev-spin 1s linear infinite",
  ping: "slidev-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
  pulse: "slidev-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  bounce: "slidev-bounce 1s infinite",
};

const num = (v: string | undefined) =>
  v !== undefined && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;

const RULES: Rule[] = [
  // display, position, visibility
  [
    /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|table|contents|flow-root|list-item)$/,
    (m) => ({ display: m[1]! }),
  ],
  [/^hidden$/, () => ({ display: "none" })],
  [/^(static|relative|absolute|fixed|sticky)$/, (m) => ({ position: m[1]! })],
  [/^(visible|invisible)$/, (m) => ({ visibility: m[1] === "visible" ? "visible" : "hidden" })],
  [/^(?:position-)?(?:pos-)?(isolate)$/, () => ({ isolation: "isolate" })],
  // inset
  [
    /^(inset-x|inset-y|inset|top|right|bottom|left|start|end)-(.+)$/,
    (m, c) => {
      const v = size(m[2]!, c);
      if (v === null) return null;
      return Object.fromEntries(INSET_DIRS[m[1]!]!.map((p) => [p, neg(v, c)]));
    },
  ],
  [
    /^z-(.+)$/,
    (m, c) => {
      const n = num(m[1]);
      if (n !== null) return { "z-index": c.neg ? `-${n}` : String(n) };
      if (m[1] === "auto") return { "z-index": "auto" };
      const a = arbitrary(m[1]!, c);
      return a ? { "z-index": a } : null;
    },
  ],
  [
    /^order-(\d+|first|last|none)$/,
    (m, c) => ({
      order:
        m[1] === "first"
          ? "-9999"
          : m[1] === "last"
            ? "9999"
            : m[1] === "none"
              ? "0"
              : neg(m[1]!, c),
    }),
  ],
  // spacing (Uno accepts `m-t-4` and `mt-4`; `ma`/`pa` for all sides)
  [
    /^([mp])a?-?([xytrblse])?-(.+)$/,
    (m, c) => {
      const prop = m[1] === "m" ? "margin" : "padding";
      if (m[1] === "p" && c.neg) return null;
      const v = size(m[3]!, c);
      if (v === null) return null;
      return Object.fromEntries(DIRS[m[2] ?? ""]!.map((d) => [prop + d, neg(v, c)]));
    },
  ],
  [
    /^space-([xy])-(.+)$/,
    (m, c) => {
      if (m[2] === "reverse") return null;
      const v = size(m[2]!, c);
      if (v === null) return null;
      return {
        suffix: " > :not(:last-child)",
        decls: { [m[1] === "x" ? "margin-inline-end" : "margin-block-end"]: neg(v, c) },
      };
    },
  ],
  // sizing
  [
    /^(min-|max-)?([wh])-(.+)$/,
    (m, c) => {
      const prop = `${m[1] ?? ""}${m[2] === "w" ? "width" : "height"}`;
      const key = m[3]!;
      if (m[1] === "max-" && m[2] === "w" && MAX_W[key] !== undefined)
        return { [prop]: rem(MAX_W[key]!) };
      if (m[1] === "max-" && m[2] === "w" && key.startsWith("screen-")) {
        const bp: Record<string, string> = {
          sm: "640px",
          md: "768px",
          lg: "1024px",
          xl: "1280px",
          "2xl": "1536px",
        };
        return bp[key.slice(7)] ? { [prop]: bp[key.slice(7)]! } : null;
      }
      const v = size(key, c, m[2] === "w" ? "x" : "y");
      return v === null ? null : { [prop]: v };
    },
  ],
  [
    /^size-(.+)$/,
    (m, c) => {
      const v = size(m[1]!, c);
      return v === null ? null : { width: v, height: v };
    },
  ],
  [
    /^aspect-(square|video|auto|\[.+\]|\d+\/\d+)$/,
    (m) => ({
      "aspect-ratio":
        m[1] === "square"
          ? "1 / 1"
          : m[1] === "video"
            ? "16 / 9"
            : m[1] === "auto"
              ? "auto"
              : m[1]!.replace(/^\[|\]$/g, "").replace("/", " / "),
    }),
  ],
  // flex
  [
    /^flex-(row|col|row-reverse|col-reverse)$/,
    (m) => ({ "flex-direction": m[1]!.replace("col", "column") }),
  ],
  [/^flex-(wrap|wrap-reverse|nowrap)$/, (m) => ({ "flex-wrap": m[1]! })],
  [
    /^flex-(1|auto|initial|none)$/,
    (m) => ({
      flex: { "1": "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }[m[1]!]!,
    }),
  ],
  [/^(?:flex-)?(grow|shrink)(?:-(\d+))?$/, (m) => ({ [`flex-${m[1]}`]: m[2] ?? "1" })],
  [
    /^basis-(.+)$/,
    (m, c) => {
      const v = size(m[1]!, c);
      return v === null ? null : { "flex-basis": v };
    },
  ],
  [
    /^(?:flex-|grid-)?gap-?([xy])?-(.+)$/,
    (m, c) => {
      const v = size(m[2]!, c);
      if (v === null) return null;
      return { [m[1] === "x" ? "column-gap" : m[1] === "y" ? "row-gap" : "gap"]: v };
    },
  ],
  [
    /^items-(start|end|center|baseline|stretch)$/,
    (m) => ({ "align-items": ALIGN[m[1]!] ?? m[1]! }),
  ],
  [
    /^justify-(start|end|center|between|around|evenly|stretch|normal)$/,
    (m) => ({ "justify-content": ALIGN[m[1]!]! }),
  ],
  [/^justify-items-(start|end|center|stretch)$/, (m) => ({ "justify-items": m[1]! })],
  [/^justify-self-(auto|start|end|center|stretch)$/, (m) => ({ "justify-self": m[1]! })],
  [
    /^content-(start|end|center|between|around|evenly|stretch)$/,
    (m) => ({ "align-content": ALIGN[m[1]!]! }),
  ],
  [
    /^self-(auto|start|end|center|stretch|baseline)$/,
    (m) => ({ "align-self": ALIGN[m[1]!] ?? m[1]! }),
  ],
  [
    /^place-(content|items|self)-(start|end|center|stretch|between|around|evenly|auto)$/,
    (m) => ({
      [`place-${m[1]}`]:
        m[2] === "between" || m[2] === "around" || m[2] === "evenly" ? `space-${m[2]}` : m[2]!,
    }),
  ],
  // grid
  [
    /^grid-(cols|rows)-(.+)$/,
    (m, c) => {
      const prop = m[1] === "cols" ? "grid-template-columns" : "grid-template-rows";
      const n = num(m[2]);
      if (n !== null) return { [prop]: `repeat(${n}, minmax(0, 1fr))` };
      if (m[2] === "none") return { [prop]: "none" };
      const a = arbitrary(m[2]!, c);
      return a ? { [prop]: a } : null;
    },
  ],
  [
    /^(col|row)-span-(\d+|full)$/,
    (m) => ({
      [m[1] === "col" ? "grid-column" : "grid-row"]:
        m[2] === "full" ? "1 / -1" : `span ${m[2]} / span ${m[2]}`,
    }),
  ],
  [
    /^(col|row)-(start|end)-(\d+|auto)$/,
    (m) => ({ [`grid-${m[1] === "col" ? "column" : "row"}-${m[2]}`]: m[3]! }),
  ],
  [
    /^grid-flow-(row|col|dense|row-dense|col-dense)$/,
    (m) => ({ "grid-auto-flow": m[1]!.replace("col", "column").replace("-", " ") }),
  ],
  // type
  [/^text-(left|center|right|justify|start|end)$/, (m) => ({ "text-align": m[1]! })],
  [
    /^text-(xs|sm|base|lg|xl|[2-9]xl)$/,
    (m) => {
      const [s, lh] = TEXT_SIZES[m[1]!]!;
      return { "font-size": rem(s), "line-height": lh === "1" ? "1" : rem(Number.parseFloat(lh)) };
    },
  ],
  [
    /^(?:text|font)-size-(.+)$/,
    (m, c) => {
      const v = size(m[1]!, c);
      return v === null ? null : { "font-size": v };
    },
  ],
  [
    /^text-(\d+(?:\.\d+)?(?:px|rem|em)|\[\d[^\]]*\])$/,
    (m, c) => ({ "font-size": arbitrary(m[1]!, c) ?? scaleCssValue(m[1]!, c.scale) }),
  ],
  [/^(?:text|color|c)-(.+)$/, (m) => colorDecl("color", m[1]!, "--un-text-opacity")],
  [
    /^(?:text|color|c)-op(?:acity)?-?(\d+)$/,
    (m) => ({ "--un-text-opacity": fmt(Number(m[1]) / 100) }),
  ],
  [
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
    (m) => ({ "font-weight": WEIGHTS[m[1]!]! }),
  ],
  [/^(?:font|fw)-(\d00)$/, (m) => ({ "font-weight": m[1]! })],
  [
    /^font-(sans|serif|mono)$/,
    (m) => ({ "font-family": `var(--deck-${m[1] === "sans" ? "body" : m[1]}-font)` }),
  ],
  [
    /^(?:leading|lh|line-height)-(.+)$/,
    (m, c) => {
      if (LEADING[m[1]!]) return { "line-height": LEADING[m[1]!]! };
      const v = size(m[1]!, c);
      return v === null ? null : { "line-height": v };
    },
  ],
  [
    /^tracking-(.+)$/,
    (m, c) => (TRACKING[m[1]!] ? { "letter-spacing": neg(TRACKING[m[1]!]!, c) } : null),
  ],
  [/^(uppercase|lowercase|capitalize)$/, (m) => ({ "text-transform": m[1]! })],
  [/^normal-case$/, () => ({ "text-transform": "none" })],
  [/^italic$/, () => ({ "font-style": "italic" })],
  [/^not-italic$/, () => ({ "font-style": "normal" })],
  [/^(underline|overline|line-through)$/, (m) => ({ "text-decoration-line": m[1]! })],
  [/^no-underline$/, () => ({ "text-decoration-line": "none" })],
  [
    /^truncate$/,
    () => ({ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }),
  ],
  [
    /^(?:whitespace|ws)-(normal|nowrap|pre|pre-line|pre-wrap|break-spaces)$/,
    (m) => ({ "white-space": m[1]! }),
  ],
  [
    /^break-(words|all|keep|normal)$/,
    (m) =>
      m[1] === "words"
        ? { "overflow-wrap": "break-word" }
        : m[1] === "normal"
          ? { "overflow-wrap": "normal", "word-break": "normal" }
          : { "word-break": m[1] === "all" ? "break-all" : "keep-all" },
  ],
  [
    /^list-(none|disc|decimal|inside|outside)$/,
    (m) =>
      m[1] === "inside" || m[1] === "outside"
        ? { "list-style-position": m[1] }
        : { "list-style-type": m[1]! },
  ],
  [
    /^align-(baseline|top|middle|bottom|text-top|text-bottom|sub|super)$/,
    (m) => ({ "vertical-align": m[1]! }),
  ],
  [
    /^text-shadow(?:-(sm|md|lg|xl|none))?$/,
    (m) => ({
      "text-shadow":
        m[1] === "none"
          ? "none"
          : m[1] === "lg" || m[1] === "xl"
            ? "3px 3px 6px rgb(0 0 0 / 0.26), 0 0 5px rgb(15 3 86 / 0.22)"
            : "0 0 1px rgb(0 0 0 / 0.2), 0 0 1px rgb(1 0 5 / 0.1)",
    }),
  ],
  // backgrounds
  [/^bg-op(?:acity)?-?(\d+)$/, (m) => ({ "--un-bg-opacity": fmt(Number(m[1]) / 100) })],
  [/^bg-(cover|contain|auto)$/, (m) => ({ "background-size": m[1]! })],
  [/^bg-(center|top|bottom|left|right)$/, (m) => ({ "background-position": m[1]! })],
  [/^bg-(no-repeat|repeat)$/, (m) => ({ "background-repeat": m[1]! })],
  [
    /^bg-gradient-to-(t|tr|r|br|b|bl|l|tl)$/,
    (m) => {
      const dir: Record<string, string> = {
        t: "top",
        tr: "top right",
        r: "right",
        br: "bottom right",
        b: "bottom",
        bl: "bottom left",
        l: "left",
        tl: "top left",
      };
      return { "background-image": `linear-gradient(to ${dir[m[1]!]}, var(--un-gradient-stops))` };
    },
  ],
  [
    /^(from|via|to)-(.+)$/,
    (m) => {
      const c = colorOf(m[2]!);
      if (!c) return null;
      const color = c.color(c.alpha ?? "1");
      if (m[1] === "from")
        return {
          "--un-gradient-from": color,
          "--un-gradient-to": c.color("0"),
          "--un-gradient-stops": "var(--un-gradient-from), var(--un-gradient-to)",
        };
      if (m[1] === "via")
        return {
          "--un-gradient-to": c.color("0"),
          "--un-gradient-stops": `var(--un-gradient-from), ${color}, var(--un-gradient-to)`,
        };
      return { "--un-gradient-to": color };
    },
  ],
  [/^bg-(.+)$/, (m) => colorDecl("background-color", m[1]!, "--un-bg-opacity")],
  // borders
  [/^(?:border|b)-?([xytrbl])?$/, (m) => borderWidth(m[1], "1px")],
  [/^(?:border|b)-?([xytrbl])?-(\d+)$/, (m, c) => borderWidth(m[1], px(Number(m[2]), c))],
  [/^(?:border|b)-(solid|dashed|dotted|double|none)$/, (m) => ({ "border-style": m[1]! })],
  [
    /^(?:border|b)-op(?:acity)?-?(\d+)$/,
    (m) => ({ "--un-border-opacity": fmt(Number(m[1]) / 100) }),
  ],
  [
    /^(?:rounded|rd|(?:border|b)-(?:rounded|rd))(?:-([trbl]{1,2}|[se]{1,2}))?(?:-(none|sm|md|lg|xl|2xl|3xl|full|\d+|\[.+\]))?$/,
    (m, c) => {
      const key = m[2] ?? "DEFAULT";
      const n = num(key);
      const v =
        key === "full"
          ? "9999px"
          : RADII[key] !== undefined
            ? rem(RADII[key]!)
            : n !== null
              ? rem(n / 4)
              : arbitrary(key, c);
      if (v === null) return null;
      const corners: Record<string, string[]> = {
        t: ["top-left", "top-right"],
        r: ["top-right", "bottom-right"],
        b: ["bottom-right", "bottom-left"],
        l: ["top-left", "bottom-left"],
        tl: ["top-left"],
        tr: ["top-right"],
        br: ["bottom-right"],
        bl: ["bottom-left"],
      };
      if (!m[1]) return { "border-radius": v };
      const list = corners[m[1]];
      return list ? Object.fromEntries(list.map((k) => [`border-${k}-radius`, v])) : null;
    },
  ],
  [
    /^(?:border|b)-?([xytrbl])?-(.+)$/,
    (m) => {
      const d = colorDecl("border-color", m[2]!, "--un-border-opacity");
      if (!d || !m[1]) return d;
      const sides = (
        {
          x: ["left", "right"],
          y: ["top", "bottom"],
          t: ["top"],
          r: ["right"],
          b: ["bottom"],
          l: ["left"],
        } as Record<string, string[]>
      )[m[1]]!;
      const out: Decls = {};
      for (const [k, val] of Object.entries(d)) {
        if (k.startsWith("--")) out[k] = val;
        else for (const s of sides) out[`border-${s}-color`] = val;
      }
      return out;
    },
  ],
  [
    /^(?:divide)-([xy])(?:-(\d+))?$/,
    (m, c) => ({
      suffix: " > :not(:last-child)",
      decls: {
        [m[1] === "x" ? "border-inline-end-width" : "border-block-end-width"]: m[2]
          ? px(Number(m[2]), c)
          : "1px",
        "border-style": "solid",
      },
    }),
  ],
  [/^outline-none$/, () => ({ outline: "2px solid transparent", "outline-offset": "2px" })],
  [
    /^outline(?:-(\d+))?$/,
    (m) => ({ "outline-style": "solid", "outline-width": `${m[1] ?? 1}px` }),
  ],
  [
    /^ring(?:-(\d+))?$/,
    (m, c) => ({
      "box-shadow": `0 0 0 ${px(Number(m[1] ?? 3), c)} var(--un-ring-color, rgb(59 130 246 / 0.5))`,
    }),
  ],
  // effects
  [/^(?:op|opacity)-?(\d+)$/, (m) => ({ opacity: fmt(Number(m[1]) / 100) })],
  [
    /^shadow(?:-(sm|md|lg|xl|2xl|inner|none))?$/,
    (m) => ({ "box-shadow": SHADOWS[m[1] ?? "DEFAULT"]! }),
  ],
  [
    /^(backdrop-)?blur(?:-(sm|md|lg|xl|2xl|3xl|none|\d+))?$/,
    (m, c) => {
      const key = m[2] ?? "DEFAULT";
      const v = key === "none" ? "none" : `blur(${px(BLURS[key] ?? Number(key), c)})`;
      return {
        [m[1] ? "backdrop-filter" : "filter"]: v,
        ...(m[1] ? { "-webkit-backdrop-filter": v } : {}),
      };
    },
  ],
  [
    /^(grayscale|invert|sepia)(?:-(0|\d+))?$/,
    (m) => ({ filter: `${m[1]}(${m[2] === undefined ? "100%" : `${m[2]}%`})` }),
  ],
  [
    /^(brightness|contrast|saturate)-(\d+)$/,
    (m) => ({ filter: `${m[1]}(${fmt(Number(m[2]) / 100)})` }),
  ],
  [/^mix-blend-(.+)$/, (m) => ({ "mix-blend-mode": m[1]! })],
  [
    /^object-(contain|cover|fill|none|scale-down|center|top|bottom|left|right)$/,
    (m) =>
      ["center", "top", "bottom", "left", "right"].includes(m[1]!)
        ? { "object-position": m[1]! }
        : { "object-fit": m[1]! },
  ],
  [
    /^overflow-(?:([xy])-)?(auto|hidden|visible|scroll|clip)$/,
    (m) => ({ [m[1] ? `overflow-${m[1]}` : "overflow"]: m[2]! }),
  ],
  [/^cursor-(.+)$/, (m) => ({ cursor: m[1]! })],
  [/^select-(none|text|all|auto)$/, (m) => ({ "user-select": m[1]! })],
  [/^pointer-events-(none|auto)$/, (m) => ({ "pointer-events": m[1]! })],
  [
    /^resize(?:-(none|x|y))?$/,
    (m) => ({ resize: m[1] === "x" ? "horizontal" : m[1] === "y" ? "vertical" : (m[1] ?? "both") }),
  ],
  // transforms: the individual properties, so `rotate-10 scale-90 translate-x-4` compose
  [
    /^transform(?:-gpu|-cpu|-none)?$/,
    (m) => (m[0] === "transform-none" ? { transform: "none" } : {}),
  ],
  [/^rotate-(\d+(?:\.\d+)?)$/, (m, c) => ({ rotate: `${c.neg ? "-" : ""}${m[1]}deg` })],
  [
    /^scale-(?:([xy])-)?(\d+)$/,
    (m) => {
      const v = fmt(Number(m[2]) / 100);
      return { scale: m[1] === "x" ? `${v} 1` : m[1] === "y" ? `1 ${v}` : v };
    },
  ],
  [
    /^translate-([xy])-(.+)$/,
    (m, c) => {
      const v = size(m[2]!, c);
      if (v === null) return null;
      return { translate: m[1] === "x" ? `${neg(v, c)} 0` : `0 ${neg(v, c)}` };
    },
  ],
  [
    /^skew-([xy])-(\d+)$/,
    (m, c) => ({ transform: `skew${m[1]!.toUpperCase()}(${c.neg ? "-" : ""}${m[2]}deg)` }),
  ],
  [
    /^origin-(.+)$/,
    (m) => ({ "transform-origin": m[1]!.replace(/-/g, " ").replace("tl", "top left") }),
  ],
  // transitions and animation
  [
    /^transition(?:-(all|colors|opacity|shadow|transform|none))?$/,
    (m) => {
      const props: Record<string, string> = {
        DEFAULT:
          "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter",
        all: "all",
        colors: "color, background-color, border-color, text-decoration-color, fill, stroke",
        opacity: "opacity",
        shadow: "box-shadow",
        transform: "transform, translate, scale, rotate",
      };
      if (m[1] === "none") return { "transition-property": "none" };
      return {
        "transition-property": props[m[1] ?? "DEFAULT"]!,
        "transition-timing-function": EASE.DEFAULT!,
        "transition-duration": "150ms",
      };
    },
  ],
  [/^duration-(\d+)$/, (m) => ({ "transition-duration": `${m[1]}ms` })],
  [/^delay-(\d+)$/, (m) => ({ "transition-delay": `${m[1]}ms` })],
  [
    /^ease(?:-(linear|in|out|in-out))?$/,
    (m) => ({ "transition-timing-function": EASE[m[1] ?? "DEFAULT"]! }),
  ],
  [
    /^animate-(spin|ping|pulse|bounce|none)$/,
    (m) => ({ animation: m[1] === "none" ? "none" : ANIMATIONS[m[1]!]! }),
  ],
];

function borderWidth(side: string | undefined, width: string): Decls {
  const sides: Record<string, string[]> = {
    x: ["left", "right"],
    y: ["top", "bottom"],
    t: ["top"],
    r: ["right"],
    b: ["bottom"],
    l: ["left"],
  };
  const list = side ? sides[side]! : null;
  const w: Decls = list
    ? Object.fromEntries(list.map((s) => [`border-${s}-width`, width]))
    : { "border-width": width };
  return {
    ...w,
    "border-style": "solid",
    "--un-border-opacity": "1",
    "border-color": "var(--un-border-color, rgb(156 163 175 / 0.2))",
  };
}

/**
 * Slidev's own shortcuts (packages/client/uno.config.ts) — what its themes and its starter write —
 * with the theme colour pointed at the Kadal theme's accent.
 */
const SHORTCUTS: Record<string, string> = {
  "bg-main": "bg-white dark:bg-[#121212]",
  "bg-active": "bg-gray-400/10",
  "border-main": "border-gray/20",
  "text-main": "text-[#181818] dark:text-[#ddd]",
  "text-primary": "color-primary",
  "bg-primary": "bg-primary",
  "border-primary": "border-primary",
  "abs-tl": "absolute top-0 left-0",
  "abs-tr": "absolute top-0 right-0",
  "abs-b": "absolute bottom-0 left-0 right-0",
  "abs-bl": "absolute bottom-0 left-0",
  "abs-br": "absolute bottom-0 right-0",
  "slidev-glass-effect": "shadow-xl backdrop-blur-8 border border-main bg-main bg-opacity-75!",
  "slidev-icon-btn":
    "inline-flex items-center justify-center opacity-75 transition duration-200 ease-in-out align-middle rounded p-1 relative cursor-pointer select-none outline-none aspect-square hover:opacity-100 hover:bg-gray-400 hover:bg-opacity-10",
};

/** Slidev's z-index names. */
const Z_NAMES: Record<string, number> = {
  "z-drawing": 10,
  "z-camera": 15,
  "z-dragging": 18,
  "z-menu": 20,
  "z-label": 40,
  "z-nav": 50,
  "z-context-menu": 60,
  "z-modal": 70,
  "z-focus-indicator": 200,
};

/* ── variants ────────────────────────────────────────────────────────────── */

const PSEUDO: Record<string, string> = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  visited: ":visited",
  disabled: ":disabled",
  checked: ":checked",
  first: ":first-child",
  last: ":last-child",
  odd: ":nth-child(odd)",
  even: ":nth-child(even)",
  "first-of-type": ":first-of-type",
  "last-of-type": ":last-of-type",
  empty: ":empty",
  placeholder: "::placeholder",
  before: "::before",
  after: "::after",
  marker: "::marker",
  selection: "::selection",
};
const BREAKPOINTS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

interface Variant {
  /** Wraps the selector: `(s) => ":where([data-color-scheme=dark]) " + s`. */
  wrap?: (sel: string) => string;
  pseudo?: string;
  media?: string;
}

function variantOf(name: string): Variant | null {
  if (PSEUDO[name]) return { pseudo: PSEUDO[name] };
  if (name === "dark") return { wrap: (s) => `:where([data-color-scheme="dark"]) ${s}` };
  if (name === "light") return { wrap: (s) => `:where([data-color-scheme="light"]) ${s}` };
  if (name === "forward" || name === "backward")
    return { wrap: (s) => `:where([data-nav-direction="${name}"]) ${s}` };
  if (name === "print") return { media: "print" };
  // UnoCSS: `*:` styles the children, `all:` every descendant
  if (name === "*") return { wrap: (s) => `${s} > *` };
  if (name === "all") return { wrap: (s) => `${s} *` };
  if (name.startsWith("group-") && PSEUDO[name.slice(6)])
    return { wrap: (s) => `.group${PSEUDO[name.slice(6)]} ${s}` };
  if (name.startsWith("peer-") && PSEUDO[name.slice(5)])
    return { wrap: (s) => `.peer${PSEUDO[name.slice(5)]} ~ ${s}` };
  if (BREAKPOINTS[name]) return { media: `(min-width: ${BREAKPOINTS[name]}px)` };
  const lt = /^lt-(sm|md|lg|xl|2xl)$/.exec(name);
  if (lt) return { media: `(max-width: ${BREAKPOINTS[lt[1]!]! - 0.1}px)` };
  const at = /^at-(sm|md|lg|xl|2xl)$/.exec(name);
  if (at) return { media: `(min-width: ${BREAKPOINTS[at[1]!]}px)` };
  return null;
}

/** Split `dark:hover:bg-red` at the colons that are not inside brackets. */
function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** A class name as a CSS selector (escaping `:`, `/`, `[`, `!`, `.`, `#`…). */
export function cssEscape(cls: string): string {
  return cls.replace(/^(\d)/, "\\3$1 ").replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Uno's variant groups: `hover:(bg-gray-400 opacity-100)` → `hover:bg-gray-400 hover:opacity-100`,
 * nested and repeated. Applied to class strings before they are split into tokens.
 */
export function expandVariantGroups(text: string): string {
  let out = text;
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/([\w-:!]+:)\(([^()]*)\)/g, (_, prefix: string, inner: string) =>
      inner
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => prefix + t)
        .join(" "),
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

interface Generated {
  /** The class's own selector, its pseudo-classes, and what follows (` > :not(:last-child)`). */
  base: string;
  pseudo: string;
  suffix: string;
  wraps: Array<(sel: string) => string>;
  media: string | null;
  decls: Decls;
  order: number;
}

const selectorOf = (g: Generated) =>
  g.wraps.reduce((sel, w) => w(sel), g.base + g.pseudo + g.suffix);

/** The declarations one utility body (no variants) stands for, or null. */
function resolveBody(
  body: string,
  c: Omit<Ctx, "neg">,
): { decls: Decls; suffix?: string; order: number } | null {
  let b = body;
  let important = false;
  if (b.startsWith("!")) {
    important = true;
    b = b.slice(1);
  } else if (b.endsWith("!")) {
    important = true;
    b = b.slice(0, -1);
  }
  const negative = b.startsWith("-") && !b.startsWith("--");
  if (negative) b = b.slice(1);
  if (Z_NAMES[b] !== undefined) return { decls: { "z-index": String(Z_NAMES[b]) }, order: 3 };
  for (let i = 0; i < RULES.length; i++) {
    const [re, fn] = RULES[i]!;
    const m = re.exec(b);
    if (!m) continue;
    const out = fn(m, { ...c, neg: negative });
    if (!out) continue;
    const r: RuleOut =
      "decls" in out && typeof out.decls === "object"
        ? (out as RuleOut)
        : {
            decls: Object.fromEntries(
              Object.entries(out).filter((e): e is [string, string] => typeof e[1] === "string"),
            ),
          };
    const decls = important
      ? Object.fromEntries(Object.entries(r.decls).map(([k, v]) => [k, `${v} !important`]))
      : r.decls;
    return { decls, ...(r.suffix ? { suffix: r.suffix } : {}), order: i };
  }
  return null;
}

function generate(token: string, c: Omit<Ctx, "neg">, base: string, depth = 0): Generated[] | null {
  // `!all:leading-12`: the `!` before the variants still means the declarations are important
  const lead = token.startsWith("!") && token.includes(":");
  const parts = splitVariants(lead ? token.slice(1) : token);
  const body = (lead ? "!" : "") + parts.pop()!;
  const variants: Variant[] = [];
  for (const p of parts) {
    const v = variantOf(p);
    if (!v) return null;
    variants.push(v);
  }
  const apply = (g: Generated): Generated => {
    let { pseudo, media } = g;
    const wraps = [...g.wraps];
    for (const v of variants) {
      if (v.pseudo) pseudo += v.pseudo;
      if (v.wrap) wraps.push(v.wrap);
      if (v.media) media = media ? `${media} and ${v.media}` : v.media;
    }
    return { ...g, pseudo, wraps, media };
  };
  const shortcut = SHORTCUTS[body.replace(/!$|^!/, "")];
  if (shortcut && depth < 4) {
    const out: Generated[] = [];
    // One rule per selector and media query, declarations in the shortcut's order (later wins).
    for (const inner of shortcut.split(/\s+/)) {
      const g = generate(inner, c, base, depth + 1);
      if (!g) continue;
      for (const r of g.map(apply)) {
        const same = out.find((o) => selectorOf(o) === selectorOf(r) && o.media === r.media);
        if (same) Object.assign(same.decls, r.decls);
        else out.push({ ...r, decls: { ...r.decls } });
      }
    }
    return out.length ? out : null;
  }
  const r = resolveBody(body, c);
  if (!r) return null;
  return [
    apply({
      base,
      pseudo: "",
      suffix: r.suffix ?? "",
      wraps: [],
      media: null,
      decls: r.decls,
      order: r.order,
    }),
  ];
}

/** Is this word a utility class (for attributify: a bare `text-sm` or `mt-12` attribute)? */
export function isUtility(token: string, scale = 1): boolean {
  return generate(token, { scale }, ".x") !== null;
}

/** The declarations of a utility list, for Uno's `@apply` inside a slide's `<style>`. */
export function applyDeclarations(
  tokens: string,
  scale: number,
): { css: string; unknown: string[] } {
  const unknown: string[] = [];
  const decls: string[] = [];
  for (const t of expandVariantGroups(tokens).split(/\s+/).filter(Boolean)) {
    const g = generate(t, { scale }, "&");
    if (!g) {
      unknown.push(t);
      continue;
    }
    for (const r of g) {
      const body = Object.entries(r.decls)
        .map(([k, v]) => `${k}: ${v};`)
        .join(" ");
      const selector = selectorOf(r);
      if (selector === "&" && !r.media) decls.push(body);
      else {
        const nested = `${selector} { ${body} }`;
        decls.push(r.media ? `@media ${r.media} { ${nested} }` : nested);
      }
    }
  }
  return { css: decls.join(" "), unknown };
}

const ATTRIBUTIFY_PREFIXES = new Set([
  "m",
  "p",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "text",
  "bg",
  "flex",
  "grid",
  "border",
  "b",
  "font",
  "w",
  "h",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "op",
  "opacity",
  "rounded",
  "shadow",
  "gap",
  "items",
  "justify",
  "place",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "z",
  "leading",
  "tracking",
  "transition",
  "duration",
  "ease",
  "delay",
  "animate",
  "transform",
  "rotate",
  "scale",
  "translate",
  "origin",
  "overflow",
  "cursor",
  "select",
  "outline",
  "ring",
  "col",
  "row",
  "self",
  "content",
  "space",
  "divide",
  "list",
  "object",
  "position",
  "pos",
  "display",
  "color",
  "c",
  "filter",
  "backdrop",
  "blur",
  "aspect",
  "size",
  "decoration",
  "underline",
]);

/**
 * Uno's attributify mode: `<div grid="~ cols-2 gap-4" m="t-4" text-sm>`. Returns the class tokens
 * an attribute stands for, or null when the attribute is an ordinary one. `~` is the bare prefix
 * (`flex="~ col"` → `flex flex-col`); a variant prefixes the name (`hover:bg="white op-10"`).
 */
export function attributifyClasses(name: string, value: string | true, scale = 1): string[] | null {
  if (value === true) return isUtility(name, scale) ? [name] : null;
  const parts = splitVariants(name);
  const prefix = parts.pop()!;
  const variant = parts.length ? `${parts.join(":")}:` : "";
  if (!ATTRIBUTIFY_PREFIXES.has(prefix)) return null;
  if (parts.some((p) => !variantOf(p))) return null;
  const tokens = expandVariantGroups(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((v) => {
      const imp = v.startsWith("!") ? "!" : "";
      const w = imp ? v.slice(1) : v;
      // a variant inside the value: `text="hover:red"` → `hover:text-red`
      const inner = splitVariants(w);
      const last = inner.pop()!;
      const pre = inner.length ? `${inner.join(":")}:` : "";
      const body =
        last === "~" ? prefix : last.startsWith("-") ? `-${prefix}${last}` : `${prefix}-${last}`;
      return `${variant}${pre}${imp}${body}`;
    });
  // Every token must resolve, or this is a real attribute that happens to share a name (`color`).
  return tokens.length && tokens.every((t) => isUtility(t, scale)) ? tokens : null;
}

/**
 * The stylesheet for `classes`: one rule per class this engine knows, in rule order (so `p-2 px-4`
 * cascades as in Uno), media queries last; the classes it does not know come back in `unknown`.
 */
export function utilityCss(classes: Iterable<string>, options: UtilityOptions): UtilityResult {
  const out: Generated[] = [];
  const unknown: string[] = [];
  const keyframes = new Set<string>();
  for (const cls of new Set(classes)) {
    const g = generate(cls, { scale: options.scale }, `.${cssEscape(cls)}`);
    if (!g) {
      unknown.push(cls);
      continue;
    }
    out.push(...g);
    const anim = /animate-(spin|ping|pulse|bounce)/.exec(cls);
    if (anim) keyframes.add(KEYFRAMES[anim[1]!]!);
  }
  out.sort((a, b) => (a.media ? 1 : 0) - (b.media ? 1 : 0) || a.order - b.order);
  const lines: string[] = [];
  for (const r of out) {
    const body = Object.entries(r.decls)
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");
    if (!body) continue;
    const rule = `${selectorOf(r)} { ${body} }`;
    lines.push(r.media ? `@media ${r.media} { ${rule} }` : rule);
  }
  return { css: [...keyframes, ...lines].join("\n"), unknown };
}
