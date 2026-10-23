import { closingBrace, parseComarkAttributes } from "../compiler/comark-attributes.ts";
import { iconFromTag } from "../icons/data.ts";
import { GENERATED } from "../catalog/generated.ts";
import { convertFence, fenceClicks } from "./code.ts";
import { evaluate, scriptConsts, toJs, type Value } from "./expr.ts";
import type { Reporter } from "./report.ts";
import { type El, scanSlide, type Span } from "./tags.ts";
import { attributifyClasses, expandVariantGroups, scaleCssValue } from "./uno.ts";
import { convertStyle } from "./style.ts";
import { PALETTE, SHADES } from "./uno-palette.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SLIDEV SLIDE BODY → KADAL MDX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Markdown is kept exactly; what changes is everything Vue: the tags and their attributes,
 * the directives, `{{ mustaches }}`, `<script setup>`, and the few places Markdown and MDX
 * disagree (`<br>` must close, `{` and a stray `<` must be escaped, `<https://autolinks>` are not
 * MDX, comments are not MDX). Element by element:
 *
 *   <div v-click class="x">            <Click as="div" className="x">
 *   <p v-after.hide>                   <After as="p" hide>
 *   <img v-click="[2, 4]" …>           <Click as="img" at={[2, 4]} … />
 *   <v-click at="+2">, <v-clicks>      <Click at="+2">, <Clicks every depth>
 *   <span v-mark.circle.red="3">       <Mark type="circle" color="…" at={3}>
 *   <div v-motion :initial :enter …>   <Motion initial={…} enter={…} clicks={{ "click-3": … }}>
 *   <v-switch><template #1-3>          <Switch><Case at="1-3">
 *   <v-drag pos="…">, v-drag           <Drag pos="…"> (positions scaled to the 1920px stage)
 *   <carbon:arrow-right />             <Icon name="carbon:arrow-right" size="1.2em" />
 *   <arrow x1="10" …>, <AutoFitText>   <Arrow x1={20} …>, <FitText> — Slidev's built-ins by name
 *   grid="~ cols-2 gap-4", text-sm     className="grid grid-cols-2 grid-gap-4 text-sm" (attributify)
 *   style="flex-grow: 1"               style={{ flexGrow: "1" }}
 *   {{ $slidev.nav.currentPage }}      <SlideCurrentNo />
 *   :enter="final", v-for="n in 3"     the values, from the slide's <script setup> / unrolled
 *   @click="$slidev.nav.next"          <SlidevOn click="next"> (a helper written into the deck)
 *
 * What cannot be converted — a Vue expression that needs Vue, a component nobody defines — stays
 * in the slide as an MDX comment `{/* slidev: … *\/}` and gets a report line.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Slidev's names for the click count of the slide, and for its total. */
const CLICK_NOW =
  /^(\$clicks|\$clicksContext\.current|\$slidev\.nav\.clicks|\$nav\.clicks|\$slidev\.nav\.clicksContext\.current)$/;
const CLICK_TOTAL =
  /^(\$clicksContext\.total|\$slidev\.nav\.clicksTotal|\$nav\.clicksTotal|\$slidev\.nav\.clicksContext\.total)$/;

/**
 * A `v-if` on the click count as JavaScript of `$clicks` (`$clicks > 3 && $clicks < 6`), or null
 * when it reads anything else. Only the count, numbers, comparisons, arithmetic and parentheses
 * pass, so what is written into the deck is exactly what the Vue expression meant.
 */
export function clicksJs(expr: string): string | null {
  const src = expr.trim();
  if (!src) return null;
  const token =
    /\s+|\$slidev\.nav\.clicksContext\.current|\$clicksContext\.current|\$slidev\.nav\.clicks|\$nav\.clicks|\$clicks(?![\w$.])|\d+(?:\.\d+)?|===|!==|==|!=|>=|<=|&&|\|\||[<>!()+\-*%]/y;
  let out = "";
  let reads = false;
  let i = 0;
  while (i < src.length) {
    token.lastIndex = i;
    const m = token.exec(src);
    if (!m) return null;
    const t = m[0];
    if (t.startsWith("$")) {
      out += "$clicks";
      reads = true;
    } else out += t === "==" ? "===" : t === "!=" ? "!==" : t;
    i += t.length;
  }
  return reads ? out.trim() : null;
}

export interface MarkupContext {
  report: Reporter;
  /** Source line (1-based) for an offset into the text being converted. */
  lineAt: (offset: number) => number;
  /** Kadal stage ÷ Slidev canvas. */
  scale: number;
  /** Values expressions may read: `$frontmatter`, `$slidev.configs`, script-setup consts. */
  scope: Record<string, Value>;
  /** Every class token the deck uses (for the utility stylesheet). */
  classes: Set<string>;
  /** Every Iconify `set:name` the deck draws. */
  icons: Set<string>;
  /** Helpers the deck needs from the generated src/slidev.tsx (`SlidevOn`, `slidevAnim`). */
  helpers: Set<string>;
  /** Components the converted deck has: its converted SFCs and its theme's. */
  components: Set<string>;
  /** Packages `twoslash` fences import (their types must be installed for TwoSlash). */
  typeImports?: Set<string>;
  /** Hears each file a `<<<` line reads (as written: `@/snippets/a.ts`, `./b.ts`). */
  onSnippet?: (path: string) => void;
  /** `clickAnimation:` of the slide (or the deck): the default v-click presets. */
  clickAnimation: string[];
  /** The slide's `dragPos` names (their positions are scaled in the frontmatter). */
  dragNames: Set<string>;
  /** True inside speaker notes: no click machinery, only markup. */
  notes?: boolean;
  /** The deck turns Comark on (`mdc: true` / `comark: true`): its `{…}` attribute lists stay. */
  comark?: boolean;
  /**
   * "tsx" converts a Vue file's template (vue.ts): HTML, not Markdown, so text is escaped for JSX,
   * and expressions the script defines are written through as JavaScript by `dynamic`.
   */
  mode?: "mdx" | "tsx";
  /** tsx: a template expression as JavaScript (props, state, loop variables), or null. */
  dynamic?: (expr: string, locals: Set<string>) => string | null;
  /** tsx: Vue's `:class` value as a JavaScript string expression, and the class names it names. */
  dynamicClass?: (expr: string, locals: Set<string>) => { js: string; tokens: string[] } | null;
  /** tsx: an event handler as a JavaScript function, or null. */
  handler?: (expr: string, locals: Set<string>) => string | null;
  /** tsx: what `<slot>` / `<slot name="x">` renders as. */
  slot?: (name: string | null) => string;
  /** tsx: a className expression merged onto the template's root element (fallthrough attrs). */
  rootClass?: string;
}

/* ── names ───────────────────────────────────────────────────────────────── */

const HTML_TAGS = new Set(
  (
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite " +
    "code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption " +
    "figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label " +
    "legend li link main map mark menu meta meter nav noscript object ol optgroup option output p param " +
    "picture pre progress q rp rt ruby s samp section select slot small source span strong sub summary " +
    "sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr center font " +
    "svg g path circle ellipse line polyline polygon rect text tspan defs use symbol marker mask pattern " +
    "linearGradient radialGradient stop clipPath filter foreignObject image desc"
  ).split(" "),
);

/** HTML attributes React spells differently. */
const REACT_ATTRS: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  minlength: "minLength",
  colspan: "colSpan",
  rowspan: "rowSpan",
  contenteditable: "contentEditable",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
  autoplay: "autoPlay",
  playsinline: "playsInline",
  allowfullscreen: "allowFullScreen",
  frameborder: "frameBorder",
  referrerpolicy: "referrerPolicy",
  autofocus: "autoFocus",
  autocomplete: "autoComplete",
  inputmode: "inputMode",
  novalidate: "noValidate",
  spellcheck: "spellCheck",
  datetime: "dateTime",
  accesskey: "accessKey",
  usemap: "useMap",
  srcdoc: "srcDoc",
  cellpadding: "cellPadding",
  cellspacing: "cellSpacing",
  "http-equiv": "httpEquiv",
  charset: "charSet",
  "accept-charset": "acceptCharset",
  enctype: "encType",
  viewbox: "viewBox",
  "xlink:href": "xlinkHref",
  "xml:space": "xmlSpace",
  "xmlns:xlink": "xmlnsXlink",
};

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pascal = (s: string) => {
  const c = camel(s);
  return c[0]!.toUpperCase() + c.slice(1);
};

/** Slidev's built-in components (and their kebab spellings) → Kadal's. */
const BUILTINS: Record<string, string> = {
  Arrow: "Arrow",
  AutoFitText: "FitText",
  LightOrDark: "LightOrDark",
  Link: "Link",
  RenderWhen: "RenderWhen",
  SlideCurrentNo: "SlideCurrentNo",
  SlidesTotal: "SlidesTotal",
  TitleRenderer: "TitleRenderer",
  Titles: "TitleRenderer",
  Toc: "Toc",
  Transform: "Transform",
  Tweet: "Tweet",
  BlueSky: "BlueSky",
  Youtube: "Youtube",
  SlidevVideo: "Video",
  VClick: "Click",
  VAfter: "After",
  VClicks: "Clicks",
  VSwitch: "Switch",
  VDrag: "Drag",
  VDragArrow: "DragArrow",
  VClickGap: "#gap",
  PoweredBySlidev: "#drop",
  Mermaid: "Mermaid",
  CodeGroup: "CodeGroup",
};

/** Kadal's built-in component names, and the props each one takes (name → type text). */
const KADAL_PROPS = new Map<string, Map<string, string>>(
  GENERATED.components.map((c) => [c.name, new Map(c.props.map((p) => [p.name, p.type.text]))]),
);

/* ── output helpers ──────────────────────────────────────────────────────── */

/** One JSX attribute: `name="text"`, `name={js}` or a bare `name`. */
function jsxAttr(name: string, value: Value | { js: string }): string {
  if (value === true) return name;
  if (value && typeof value === "object" && "js" in value && typeof value.js === "string")
    return `${name}={${value.js}}`;
  if (typeof value === "string")
    return /["\\{}\n]/.test(value) ? `${name}={${JSON.stringify(value)}}` : `${name}="${value}"`;
  return `${name}={${toJs(value as Value)}}`;
}

/** Text that MDX would read as an expression or a tag, escaped. */
export function escapeText(text: string): string {
  return text.replace(/[{}]/g, (c) => `\\${c}`).replace(/<(?![A-Za-z/!])/g, "\\<");
}

/**
 * escapeText for a deck with Comark on: an attribute list where Comark reads one — straight after
 * `]`, `)`, `**`, `_`, a code span or a `:name` (compiler/comark-syntax.ts) — is kept as written,
 * since the compiler takes it before MDX does. `before` is the text that precedes `text`.
 */
export function escapeComarkText(text: string, before: string): string {
  let out = "";
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const prev = i > 0 ? text.slice(0, i) : before;
    if (!/(?:[\])*_`]|:[A-Za-z][\w-]*)$/.test(prev)) continue;
    const close = closingBrace(text, i);
    if (close < 0 || !parseComarkAttributes(text.slice(i + 1, close))) continue;
    out += escapeText(text.slice(from, i)) + text.slice(i, close + 1);
    from = close + 1;
    i = close;
  }
  return out + escapeText(text.slice(from));
}

/** Text for a JSX file: the characters JSX reads as code, as string expressions. */
export function escapeJsxText(text: string): string {
  return text.replace(/[{}<>]/g, (c) => `{${JSON.stringify(c)}}`);
}

/** A comment MDX accepts, for what could not be converted. */
export function mdxComment(text: string): string {
  return `{/* ${text.replace(/\*\//g, "*\\/").trim()} */}`;
}

const STYLE_UNITLESS = new Set([
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "flexGrow",
  "flexShrink",
  "order",
  "zoom",
  "scale",
]);

/** `"flex-grow: 1; width: 300px"` → `{ flexGrow: "1", width: "588px" }` (lengths scaled). */
export function styleObject(css: string, scale: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(/;(?![^(]*\))/)) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    const key = prop.startsWith("--")
      ? prop
      : camel(prop.replace(/^-(webkit|moz|ms)-/, (_, v: string) => `${v}-`));
    out[key === "msTransform" ? "msTransform" : key] = STYLE_UNITLESS.has(key)
      ? value
      : scaleCssValue(value, scale);
  }
  return out;
}

function styleJs(style: Record<string, string>): string {
  return `{ ${Object.entries(style)
    .map(
      ([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)}`,
    )
    .join(", ")} }`;
}

/* ── directives ──────────────────────────────────────────────────────────── */

interface Directive {
  name: string;
  arg: string | null;
  mods: string[];
  value: string | true;
}

/** `v-click.hide`, `:enter`, `@click.stop`, `#1-3`, `v-bind:x`, `v-slot:name` → parts. */
function directiveOf(attrName: string, value: string | true): Directive | null {
  let m = /^v-([\w-]+)(?::([^.]+))?((?:\.[\w-]+)*)$/.exec(attrName);
  if (m)
    return { name: m[1]!, arg: m[2] ?? null, mods: m[3] ? m[3].slice(1).split(".") : [], value };
  m = /^:([^.]+)((?:\.[\w-]+)*)$/.exec(attrName);
  if (m) return { name: "bind", arg: m[1]!, mods: m[2] ? m[2].slice(1).split(".") : [], value };
  m = /^@([^.]+)((?:\.[\w-]+)*)$/.exec(attrName);
  if (m) return { name: "on", arg: m[1]!, mods: m[2] ? m[2].slice(1).split(".") : [], value };
  m = /^#(.+)$/.exec(attrName);
  if (m) return { name: "slot", arg: m[1]!, mods: [], value };
  return null;
}

/** Slidev's click-animation presets → Kadal's effect (one) or Slidev's own (composed). */
const PRESETS = new Set(["fade", "fade-in", "up", "down", "left", "right", "scale", "none"]);
const NATIVE_EFFECT: Record<string, string> = {
  up: "fade-up",
  down: "fade-down",
  left: "fade-left",
  right: "fade-right",
  "fade-in": "fade-in",
};

/** Slidev's `v-mark` colour modifiers (UnoCSS `text-<colour>`: shade 400). */
function markColor(name: string): string | null {
  if (name === "black") return "#000";
  if (name === "white") return "#fff";
  const ch = PALETTE[name]?.split(",")[SHADES.indexOf("400")];
  return ch ? `oklch(${ch})` : null;
}
const MARK_TYPES: Record<string, string> = {
  box: "box",
  circle: "circle",
  underline: "underline",
  highlight: "highlight",
  "strike-through": "strike-through",
  "crossed-off": "crossed-off",
  bracket: "bracket",
  strike: "strike-through",
  cross: "crossed-off",
  crossed: "crossed-off",
  linethrough: "strike-through",
  "line-through": "strike-through",
};

/** Slidev's `$slidev.nav` methods → the action the generated `SlidevOn` helper runs. */
const NAV_ACTIONS: Record<string, string> = {
  next: "next",
  prev: "prev",
  nextSlide: "nextSlide",
  prevSlide: "prevSlide",
  first: "first",
  last: "last",
  go: "go",
  goFirst: "first",
  goLast: "last",
  toggleDark: "toggleDark",
  toggleOverview: "toggleOverview",
  showOverview: "toggleOverview",
  togglePresenterMode: "presenter",
  enterPresenter: "presenter",
  toggleFullscreen: "fullscreen",
  toggleDrawing: "drawing",
};

/* ── the converter ───────────────────────────────────────────────────────── */

interface Built {
  tag: string;
  attrs: string[];
  /** null: self-closing. */
  children: string | null;
}

const render = (b: Built) =>
  b.children === null
    ? `<${b.tag}${b.attrs.length ? ` ${b.attrs.join(" ")}` : ""} />`
    : `<${b.tag}${b.attrs.length ? ` ${b.attrs.join(" ")}` : ""}>${b.children}</${b.tag}>`;

/** Slidev's click numbering against Kadal's, to keep a slide's steps where Slidev put them. */
interface ClickSim {
  /** Slidev: the running offset of relative elements (absolute ones do not move it). */
  slidev: number;
  /** Kadal: the registry's cursor (every element moves it to its last step). */
  kadal: number;
  /** False once an element whose size cannot be known statically has passed. */
  known: boolean;
}

export function convertMarkup(body: string, ctx: MarkupContext): string {
  const tsx = ctx.mode === "tsx";
  const scan = scanSlide(body, tsx);
  const locals = new Set<string>();
  const esc = tsx ? escapeJsxText : escapeText;
  let rootDone = false;
  const sim: ClickSim = { slidev: 0, kadal: 0, known: true };
  const scaleNumberAttrs = (attrs: string[], names: string[]) =>
    scaleNumberAttrsWith(attrs, names, ctx.scale);
  const scope: Record<string, Value> = { ...ctx.scope };

  // `<script setup>` first: its consts are used by bindings above it (`:enter="final"`).
  for (const span of scan.spans) {
    if (span.kind !== "script") continue;
    const text = body.slice(span.start, span.end);
    const open = /^<script([^>]*)>/i.exec(text)!;
    const code = text.slice(open[0].length).replace(/<\/script\s*>$/i, "");
    const { consts, rest } = scriptConsts(code, scope);
    Object.assign(scope, consts);
    if (rest.length)
      ctx.report({
        severity: "error",
        line: ctx.lineAt(span.start),
        what: `The slide's <script> runs code Kadal cannot carry over: ${rest
          .map((r) => r.split("\n")[0])
          .join("; ")
          .slice(0, 160)}`,
        suggestion:
          "Move it into a component in src/components.tsx; the source is kept in a comment.",
      });
  }

  for (const s of scan.stray)
    ctx.report({
      severity: "warning",
      line: ctx.lineAt(s.at),
      what: `A closing </${s.name}> closes nothing; it is dropped.`,
    });

  const emitText = (from: number, to: number): string => {
    let out = "";
    let i = from;
    for (const span of scan.spans) {
      if (span.end <= from || span.start >= to) continue;
      if (span.start > i) out += plain(body.slice(i, span.start), i);
      out += emitSpan(span);
      i = span.end;
    }
    if (i < to) out += plain(body.slice(i, to), i);
    return out;
  };

  const emitSpan = (span: Span): string => {
    const text = body.slice(span.start, span.end);
    switch (span.kind) {
      case "fence": {
        blockStep(fenceClicks(text), ctx.lineAt(span.start));
        return convertFence(text, ctx.scale, ctx.report, ctx.lineAt(span.start), ctx.typeImports);
      }
      case "math": {
        const steps = /^\$\$\s*\{([^}]*)\}/.exec(text)?.[1];
        if (steps) blockStep(steps.split("|").length - 1, ctx.lineAt(span.start));
        return text;
      }
      case "snippet": {
        const path = /^\s*<<<\s+(\S+)/.exec(text)?.[1]?.split("#")[0];
        if (path) ctx.onSnippet?.(path);
        return text;
      }
      case "code":
        return text;
      case "comment":
        return mdxComment(text.slice(4, text.endsWith("-->") ? -3 : undefined));
      case "autolink": {
        const url = text.slice(1, -1);
        const href = /^[\w.+-]+@/.test(url) ? `mailto:${url}` : url;
        return `[${url.replace(/^mailto:/, "")}](${href})`;
      }
      case "style":
        return convertStyle(text, ctx);
      case "script": {
        const code = text
          .replace(/^<script[^>]*>/i, "")
          .replace(/<\/script\s*>$/i, "")
          .trim();
        const { rest } = scriptConsts(code, ctx.scope);
        return rest.length ? mdxComment(`slidev: <script setup>\n${code}\n</script>`) : "";
      }
    }
  };

  /** Text outside tags and spans: mustaches converted, MDX's specials escaped. */
  const plain = (text: string, offset: number): string =>
    text
      .split(/(\{\{[\s\S]*?\}\})/)
      .map((part, k) => {
        if (k % 2 === 0)
          return ctx.comark && !tsx
            ? escapeComarkText(part, body.slice(0, offset + text.indexOf(part)))
            : esc(part);
        return mustache(part.slice(2, -2), offset + text.indexOf(part));
      })
      .join("");

  const mustache = (src: string, at: number): string => {
    const r = evaluate(src.trim(), scope);
    if (r.kind === "static")
      return esc(r.value === null || r.value === undefined ? "" : String(r.value));
    const js = ctx.dynamic?.(src.trim(), locals);
    if (js) return `{${js}}`;
    if (r.kind === "runtime") {
      const p = r.path;
      if (
        /^(\$slidev\.nav\.currentPage|\$page|\$nav\.currentPage|\$slidev\.nav\.currentSlideNo)$/.test(
          p,
        )
      )
        return "<SlideCurrentNo />";
      if (/^(\$slidev\.nav\.total|\$nav\.total)$/.test(p)) return "<SlidesTotal />";
      if (CLICK_NOW.test(p)) return "<ClickCount />";
      if (CLICK_TOTAL.test(p)) return "<ClickCount total />";
      if (
        /^\$slidev\.nav\.currentSlideRoute\.meta\.slide\.title$|^\$slidev\.nav\.currentTitle$/.test(
          p,
        )
      )
        return "<TitleRenderer />";
    }
    ctx.report({
      severity: "error",
      line: ctx.lineAt(at),
      what: `{{ ${src.trim()} }} needs Vue to run (${r.kind === "runtime" ? `it reads ${r.path}` : r.reason}).`,
      suggestion:
        "Write the value in, or use a component that reads it (useSlide/useNav in src/components.tsx).",
    });
    return mdxComment(`slidev: {{ ${src.trim()} }}`);
  };

  /** A node's content: its text and its children, in order. */
  const inner = (el: El, override?: Record<string, Value>): string => {
    const saved = override ? { ...scope } : null;
    if (override) Object.assign(scope, override);
    let out = "";
    let at = el.openEnd;
    let chain: "none" | "taken" | "open" = "none";
    let chainJs: string[] = [];
    // A `v-if` chain on the click count: each test so far, for the next `v-else(-if)`.
    let clickChain: string[] = [];
    for (const child of el.children) {
      out += emitText(at, child.start);
      const d = child.attrs.map((a) => directiveOf(a.name, a.value));
      const vIf = d.find((x) => x?.name === "if");
      const vElseIf = d.find((x) => x?.name === "else-if");
      const vElse = d.find((x) => x?.name === "else");
      let keep = true;
      let guard: string | null = null;
      if (vIf) {
        chainJs = [];
        clickChain = [];
      }
      if ((vElseIf || vElse) && chainJs.length) {
        // tsx: the chain is decided at run time
        const before = chainJs.map((c) => `!(${c})`).join(" && ");
        if (vElse) guard = before;
        else {
          const js = ctx.dynamic?.(String(vElseIf!.value), locals);
          if (js) {
            guard = `${before} && (${js})`;
            chainJs.push(js);
          }
        }
      }
      if (guard) {
        out += `{${guard} ? (${emitElement(child)}) : null}`;
        at = child.end;
        continue;
      }
      if (vIf || vElseIf) {
        if (vElseIf && chain === "taken") keep = false;
        else {
          const r = evaluate(String((vIf ?? vElseIf)!.value), scope);
          const js =
            r.kind === "static" ? null : ctx.dynamic?.(String((vIf ?? vElseIf)!.value), locals);
          if (js) {
            chainJs.push(js);
            out += `{(${js}) ? (${emitElement(child)}) : null}`;
            at = child.end;
            continue;
          }
          const cj = r.kind === "static" ? null : clicksJs(String((vIf ?? vElseIf)!.value));
          if (cj !== null && (vIf || clickChain.length)) {
            // `$clicks > 3`: decided as the clicks move, by <ClickCount when> (ClickCount.tsx)
            const test = [...clickChain.map((c) => `!(${c})`), `(${cj})`].join(" && ");
            clickChain.push(cj);
            out += `<ClickCount when={($clicks) => ${test}}>${emitElement(child)}</ClickCount>`;
            at = child.end;
            continue;
          }
          if (r.kind === "static") {
            keep = !!r.value;
            chain = keep ? "taken" : "open";
          } else {
            chain = "taken";
            ctx.report({
              severity: "error",
              line: ctx.lineAt(child.start),
              what: `v-${vIf ? "if" : "else-if"}="${(vIf ?? vElseIf)!.value}" decides while the deck runs; the element is always shown.`,
              suggestion:
                "Use <Click> steps, <RenderWhen> or <LightOrDark> for what changes during the talk.",
            });
          }
        }
      } else if (vElse && clickChain.length) {
        const test = clickChain.map((c) => `!(${c})`).join(" && ");
        clickChain = [];
        out += `<ClickCount when={($clicks) => ${test}}>${emitElement(child)}</ClickCount>`;
        at = child.end;
        continue;
      } else if (vElse) {
        keep = chain !== "taken";
        chain = "none";
      } else {
        chain = "none";
        chainJs = [];
        clickChain = [];
      }
      if (keep) out += emitElement(child);
      at = child.end;
    }
    out += emitText(at, el.closeStart);
    if (saved) {
      for (const k of Object.keys(scope)) if (!(k in saved)) delete scope[k];
      Object.assign(scope, saved);
    }
    return out;
  };

  /** Advance the click simulation for an element; returns the `at` to write, if one is needed. */
  const step = (at: Value, size = 1): Value | undefined => {
    if (ctx.notes) return at;
    if (Array.isArray(at)) {
      const [a, b] = at;
      if (typeof a === "number" && typeof b === "number") {
        sim.kadal = Math.max(sim.kadal, b);
        return at;
      }
      // a relative range: Slidev counts it from the relative offset
      const start = typeof a === "string" ? sim.slidev + Number(a) : Number(a);
      const end = typeof b === "string" ? start + Number(b) : Number(b);
      if (typeof a === "string") sim.slidev += Number(a) + (typeof b === "string" ? Number(b) : 0);
      sim.kadal = Math.max(sim.kadal, end);
      return [start, end];
    }
    if (typeof at === "number" || (typeof at === "string" && /^\d+$/.test(at))) {
      const n = Number(at);
      sim.kadal = Math.max(sim.kadal, n + size - 1);
      return n;
    }
    const rel = typeof at === "string" && /^[+-]\d+$/.test(at) ? Number(at) : 1;
    const slidevStart = sim.slidev + rel;
    const kadalStart = sim.kadal + rel;
    sim.slidev += rel + size - 1;
    if (slidevStart === kadalStart || !sim.known) {
      sim.kadal = Math.max(sim.kadal, kadalStart + size - 1);
      return at;
    }
    // The two counts parted (an absolute step came first): write Slidev's step out.
    sim.kadal = Math.max(sim.kadal, slidevStart + size - 1);
    return slidevStart;
  };

  /**
   * A block that takes clicks but cannot be given a step (a code fence's highlights, a magic
   * move, `$$ {…}` maths): it follows Kadal's count, so where that has parted from Slidev's, say so.
   */
  const blockStep = (size: number, line: number) => {
    if (ctx.notes || size <= 0) return;
    const slidevStart = sim.slidev + 1;
    const kadalStart = sim.kadal + 1;
    sim.slidev += size;
    sim.kadal += size;
    if (slidevStart !== kadalStart && sim.known)
      ctx.report({
        severity: "warning",
        line,
        what: `This block's click steps start at click ${kadalStart} in Kadal, ${slidevStart} in Slidev (an absolute v-click came before it).`,
        suggestion: "Give the slide's v-clicks explicit steps, or move the block.",
      });
  };

  /** Slidev's `v-click` value / `<v-click at>` → Kadal's `at`, `hide`, `effect`, class. */
  const clickProps = (
    kind: "click" | "after",
    value: string | true | undefined,
    mods: string[],
    line: number,
    component = false,
  ): string[] | null => {
    const attrs: string[] = [];
    let at: Value | undefined;
    if (value !== undefined && value !== true && value !== "") {
      // component props are strings ("+2", "3"); directive values are expressions ("'+2'", "3")
      const r = component
        ? { kind: "static" as const, value: /^\d+$/.test(value) ? Number(value) : value }
        : evaluate(value, scope);
      if (r.kind !== "static") {
        ctx.report({
          severity: "error",
          line,
          what: `v-click="${value}" is decided while the deck runs; it is placed one click after the last.`,
        });
      } else if (r.value === false) return null;
      else if (r.value !== true && r.value !== null && r.value !== undefined) at = r.value;
    }
    const hide = mods.includes("hide");
    if (kind === "after") {
      // <After> is "+0"; where the counts parted, the step is written out (`#after-at:` → Click).
      const written = step("+0");
      if (typeof written === "number") attrs.push(`#after-at:${written}`);
    } else {
      const written = step(at ?? "+1");
      if (written !== undefined && written !== "+1") at = written;
      else at = undefined;
      if (Array.isArray(at) && hide)
        ctx.report({
          severity: "warning",
          line,
          what: "v-click.hide with a range (hidden between two clicks) has no Kadal form; it hides from the first click on.",
          suggestion: "Use two <Click> blocks, or a <Switch>.",
        });
      if (Array.isArray(at) && hide) at = at[0];
    }
    if (at !== undefined) attrs.push(jsxAttr("at", typeof at === "string" ? at : (at as Value)));
    if (hide) attrs.push("hide");
    const presets = mods.filter((m) => PRESETS.has(m));
    const unknown = mods.filter((m) => !PRESETS.has(m) && m !== "hide");
    for (const u of unknown)
      ctx.report({
        severity: "warning",
        line,
        what: `The v-click modifier .${u} is not one of Slidev's presets; ignored.`,
      });
    const chosen = presets.length ? presets : ctx.clickAnimation;
    if (chosen.length === 1 && NATIVE_EFFECT[chosen[0]!]) {
      if (chosen[0] !== "fade-in") attrs.push(`effect="${NATIVE_EFFECT[chosen[0]!]}"`);
    } else if (chosen.length) {
      ctx.helpers.add("slidevAnim");
      attrs.push(`effect="slidev"`);
      return [...attrs, `#class:${chosen.map((p) => `slidev-anim-${p}`).join(" ")}`];
    }
    return attrs;
  };

  /** Attributes of an element, converted; directives returned for the caller to wrap with. */
  const convertAttrs = (el: El, kadalName: string | null) => {
    const props = kadalName ? KADAL_PROPS.get(kadalName) : undefined;
    const out: string[] = [];
    const classes: string[] = [];
    let style: Record<string, string> = {};
    const directives: Directive[] = [];
    const line = ctx.lineAt(el.start);
    const isHtml = !kadalName;
    for (const a of el.attrs) {
      const d = directiveOf(a.name, a.value);
      if (d && d.name !== "bind") {
        directives.push(d);
        continue;
      }
      if (d?.name === "bind") {
        const arg = d.arg!;
        if (arg === "key" || arg === "ref") continue;
        if (arg === "class" || arg === "style") {
          const r = evaluate(String(a.value), scope);
          if (r.kind !== "static") {
            // tsx: Vue's class/style binding, as JavaScript (`#js:` marks an expression)
            const cls = arg === "class" ? ctx.dynamicClass?.(String(a.value), locals) : null;
            if (cls) {
              classes.push(`#js:${cls.js}`);
              for (const t of cls.tokens) ctx.classes.add(t);
              continue;
            }
            const js = arg === "style" ? ctx.dynamic?.(String(a.value), locals) : null;
            if (js) {
              out.push(`style={${js}}`);
              continue;
            }
            ctx.report({
              severity: "error",
              line,
              what: `:${arg}="${a.value}" changes while the deck runs; dropped.`,
            });
            continue;
          }
          if (arg === "class") classes.push(...classList(r.value));
          else if (r.value && typeof r.value === "object" && !Array.isArray(r.value))
            style = {
              ...style,
              ...Object.fromEntries(
                Object.entries(r.value).map(([k, v]) => [
                  camel(k),
                  STYLE_UNITLESS.has(camel(k)) ? String(v) : scaleCssValue(String(v), ctx.scale),
                ]),
              ),
            };
          else if (typeof r.value === "string")
            style = { ...style, ...styleObject(r.value, ctx.scale) };
          continue;
        }
        directives.push(d);
        continue;
      }
      const name = a.name;
      if (name === "class") {
        classes.push(
          ...expandVariantGroups(String(a.value === true ? "" : a.value))
            .split(/\s+/)
            .filter(Boolean),
        );
        continue;
      }
      if (name === "style") {
        if (typeof a.value === "string") style = { ...style, ...styleObject(a.value, ctx.scale) };
        continue;
      }
      if (name === "ref" || name === "key") continue;
      if (/^on[a-z]+$/i.test(name)) {
        ctx.report({
          severity: "warning",
          line,
          what: `The inline handler ${name}="…" is dropped (scripts in slides do not carry over).`,
        });
        continue;
      }
      // attributify: `text-sm`, `grid="~ cols-2"`, `m="t-4"`, `hover:bg="white op-10"`
      const known = props?.has(camel(name)) || (isHtml && isRealHtmlAttr(name, el.name));
      if (!known) {
        const tokens = attributifyClasses(name, a.value, ctx.scale);
        if (tokens) {
          classes.push(...tokens);
          continue;
        }
      }
      if (!/^[A-Za-z_][\w.:-]*$/.test(name)) {
        ctx.report({
          severity: "warning",
          line,
          what: `The attribute ${name} is not one JSX can carry; dropped.`,
        });
        continue;
      }
      if (isHtml) {
        const react =
          REACT_ATTRS[name.toLowerCase()] ??
          (/^(data|aria)-/.test(name)
            ? name
            : SVG_TAGS.has(el.name) && name.includes("-")
              ? camel(name)
              : name);
        out.push(jsxAttr(react, a.value));
      } else {
        const prop = camel(name);
        const type = props?.get(prop) ?? "";
        out.push(jsxAttr(prop, coerce(a.value, type)));
      }
    }
    // icon classes of UnoCSS (`i-carbon-x`) on an empty element become an icon (see below)
    return { attrs: out, classes, style, directives, line };
  };

  const finishAttrs = (
    attrs: string[],
    classes: string[],
    style: Record<string, string>,
  ): string[] => {
    const out = [...attrs];
    const extra = out.filter((a) => a.startsWith("#class:"));
    const rest = out.filter((a) => !a.startsWith("#class:"));
    const dynamic = classes.filter((c) => c.startsWith("#js:")).map((c) => c.slice(4));
    const own = classes.filter((c) => !c.startsWith("#js:"));
    const all = [...own, ...extra.flatMap((e) => e.slice(7).split(" "))];
    for (const c of own) ctx.classes.add(c);
    const text = [...new Set(all)].join(" ");
    if (dynamic.length)
      rest.push(
        `className={[${[text ? JSON.stringify(text) : null, ...dynamic].filter(Boolean).join(", ")}].filter(Boolean).join(" ")}`,
      );
    else if (all.length) rest.push(jsxAttr("className", text));
    if (Object.keys(style).length) rest.push(`style={${styleJs(style)}}`);
    return rest;
  };

  /** A binding's value as a JSX attribute value, or null when it needs Vue. */
  const bindingValue = (d: Directive, line: number): { js: string } | null => {
    const r = evaluate(String(d.value), scope);
    if (r.kind === "static") return { js: toJs(r.value) };
    const js = ctx.dynamic?.(String(d.value), locals);
    if (js) return { js };
    ctx.report({
      severity: "error",
      line,
      what: `:${d.arg}="${d.value}" needs Vue to run (${r.kind === "runtime" ? `it reads ${r.path}` : r.reason}); dropped.`,
      suggestion: "Write the value in.",
    });
    return null;
  };

  const emitElement = (el: El): string => {
    const line = ctx.lineAt(el.start);
    if (el.unclosed && !el.selfClosing)
      ctx.report({
        severity: "warning",
        line,
        what: `<${el.name}> is never closed; it is closed where its parent ends.`,
      });
    const name = el.name;

    // v-for: unrolled when what it walks is known now
    const vFor = el.attrs.find((a) => a.name === "v-for");
    if (vFor) return unrollFor(el, String(vFor.value), line);

    // <template>: a fragment (its v-if was decided by the parent), or a layout slot at the top
    if (name === "template") {
      const slot = el.attrs
        .map((a) => directiveOf(a.name, a.value))
        .find((x) => x?.name === "slot");
      if (slot && el.parent?.name === "#root") return `\n::${slot.arg}::\n${inner(el)}`;
      return inner(el);
    }

    if (tsx && name === "slot") {
      const slotName = el.attrs.find((a) => a.name === "name")?.value;
      return ctx.slot
        ? ctx.slot(typeof slotName === "string" ? slotName : null)
        : "{props.children}";
    }

    // icons: `<carbon:arrow-right />`, `<mdi-account class="…" />`, `<div class="i-carbon-x" />`
    const icon = iconOf(el);
    if (icon) return emitIcon(el, icon);

    const canonical = BUILTINS[pascal(name.replace(/:/g, "-"))] ?? BUILTINS[name];
    const lower = name.toLowerCase();
    if (HTML_TAGS.has(name) || (HTML_TAGS.has(lower) && !canonical)) return emitHtml(el, line);
    if (canonical === "#drop") {
      ctx.report({
        severity: "info",
        line,
        what: `<${name}> is Slidev's credit line; dropped (a Kadal host adds its own badge).`,
      });
      return "";
    }
    if (canonical === "#gap") {
      const size = Number(el.attrs.find((a) => a.name === "size")?.value ?? 1) || 1;
      const at = step(`+${size}`);
      return `<Click as="span" at=${typeof at === "number" ? `{${at}}` : `"+${size}"`} aria-hidden />`;
    }
    if (canonical) return emitBuiltin(el, canonical, line);
    const comp = pascal(name.replace(/:/g, "-"));
    if (ctx.components.has(comp) || ctx.components.has(name))
      return emitComponent(el, ctx.components.has(name) ? name : comp, line);
    ctx.report({
      severity: "error",
      line,
      what: `<${name}> is not a component the converted deck has.`,
      suggestion: `Add it to src/components.tsx (it was neither in components/ nor in the theme).`,
    });
    const open = body.slice(el.start, el.openEnd);
    if (el.selfClosing) return mdxComment(`slidev: ${open}`);
    return `${mdxComment(`slidev: ${open}`)}${inner(el)}${mdxComment(`slidev: </${name}>`)}`;
  };

  const iconOf = (el: El): string | null => {
    const emptyEl =
      el.selfClosing || (!el.children.length && !body.slice(el.openEnd, el.closeStart).trim());
    if (!emptyEl) return null;
    if (!HTML_TAGS.has(el.name)) {
      const t = iconFromTag(el.name.replace(/^i-/, ""));
      if (t) return t;
    }
    if (/^(div|span|i)$/.test(el.name)) {
      const cls = String(el.attrs.find((a) => a.name === "class")?.value ?? "");
      for (const t of cls.split(/\s+/))
        if (t.startsWith("i-") && iconFromTag(t)) return iconFromTag(t);
    }
    return null;
  };

  const emitIcon = (el: El, icon: string): string => {
    ctx.icons.add(icon);
    const { attrs, classes, style, directives, line } = convertAttrs(
      {
        ...el,
        attrs: el.attrs.filter((a) => !(a.name === "class" && /\bi-/.test(String(a.value)))),
      },
      "Icon",
    );
    const iconClasses = String(el.attrs.find((a) => a.name === "class")?.value ?? "")
      .split(/\s+/)
      .filter((t) => t && !(t.startsWith("i-") && iconFromTag(t)));
    const sized = el.attrs.some((a) => ["size", "width", "height"].includes(a.name));
    const built: Built = {
      tag: "Icon",
      attrs: [
        `name="${icon}"`,
        ...(sized ? [] : ['size="1.2em"']),
        ...finishAttrs(attrs, [...classes, ...iconClasses], style),
      ],
      children: null,
    };
    return wrap(built, directives, line, false);
  };

  const emitHtml = (el: El, line: number): string => {
    const { attrs, classes, style, directives } = convertAttrs(el, null);
    const children = el.selfClosing ? null : inner(el);
    const vHtml = directives.find((d) => d.name === "html" || d.name === "text");
    let kids = children;
    if (vHtml) {
      const r = evaluate(String(vHtml.value), scope);
      if (r.kind === "static") kids = escapeText(String(r.value ?? ""));
      else
        ctx.report({
          severity: "error",
          line,
          what: `v-${vHtml.name}="${vHtml.value}" needs Vue; dropped.`,
        });
    }
    const root = tsx && ctx.rootClass && !rootDone && el.parent === scan.root;
    if (root) rootDone = true;
    const final = finishAttrs(attrs, root ? [...classes, `#js:${ctx.rootClass}`] : classes, style);
    const built: Built = { tag: el.name, attrs: final, children: kids };
    return wrap(built, directives, line, true);
  };

  /**
   * Directives around an element: v-click/v-after (the element becomes <Click as=…>), v-motion
   * (<Motion as=…>), v-mark (a <Mark> inside), v-drag (a <Drag> around), events, v-show, v-bind.
   */
  const wrap = (built: Built, directives: Directive[], line: number, html: boolean): string => {
    let b = built;
    const click = directives.find((d) => d.name === "click" || d.name === "after");
    const motion = directives.find((d) => d.name === "motion");
    const mark = directives.find((d) => d.name === "mark");
    const drag = directives.find((d) => d.name === "drag");
    const binds = directives.filter((d) => d.name === "bind");
    const events = directives.filter((d) => d.name === "on");
    const vBind = directives.find((d) => d.name === "bind" && !d.arg);
    for (const d of directives) {
      if (
        [
          "click",
          "after",
          "motion",
          "mark",
          "drag",
          "bind",
          "on",
          "if",
          "else",
          "else-if",
          "for",
          "html",
          "text",
          "slot",
          "show",
          "once",
          "pre",
          "cloak",
          "memo",
        ].includes(d.name)
      )
        continue;
      ctx.report({
        severity: "warning",
        line,
        what: `The directive v-${d.name} has no Kadal equivalent; dropped.`,
      });
    }
    if (directives.some((d) => d.name === "show")) {
      const d = directives.find((x) => x.name === "show")!;
      const r = evaluate(String(d.value), scope);
      if (r.kind === "static" && !r.value) b = { ...b, attrs: [...b.attrs, `hidden`] };
      else if (r.kind !== "static")
        ctx.report({
          severity: "error",
          line,
          what: `v-show="${d.value}" decides while the deck runs; the element is always shown.`,
        });
    }
    if (vBind) {
      const r = evaluate(String(vBind.value), scope);
      if (r.kind === "static" && r.value && typeof r.value === "object" && !Array.isArray(r.value))
        b = {
          ...b,
          attrs: [
            ...b.attrs,
            ...Object.entries(r.value).map(([k, v]) =>
              jsxAttr(html ? (REACT_ATTRS[k] ?? k) : camel(k), v),
            ),
          ],
        };
      else
        ctx.report({
          severity: "error",
          line,
          what: `v-bind="${vBind.value}" needs Vue; dropped.`,
        });
    }
    // :prop bindings (motion's own are read below)
    const motionKeys =
      /^(initial|enter|leave|visible|visible-once|hovered|focused|tapped|variants|delay|duration|click-\d+(?:-\d+)?)$/;
    for (const d of binds) {
      if (!d.arg) continue;
      if (motion && motionKeys.test(d.arg)) continue;
      const v = bindingValue(d, line);
      if (v)
        b = {
          ...b,
          attrs: [
            ...b.attrs,
            `${html ? (REACT_ATTRS[d.arg.toLowerCase()] ?? d.arg) : camel(d.arg)}={${v.js}}`,
          ],
        };
    }

    // v-mark: a <Mark> inside the element (or the element itself, for a plain <span>)
    if (mark) {
      const m = markAttrs(mark, line);
      if (b.tag === "span" && b.attrs.every((a) => a.startsWith("className=")))
        b = { ...b, tag: "Mark", attrs: [...m, ...b.attrs] };
      else b = { ...b, children: render({ tag: "Mark", attrs: m, children: b.children ?? "" }) };
    }

    // events: Slidev's navigation calls become the SlidevOn helper
    const handlers: string[] = [];
    for (const e of events) {
      const action = navAction(String(e.value));
      const fn = !action ? ctx.handler?.(String(e.value), locals) : null;
      if (e.arg === "click" && action) handlers.push(action);
      else if (fn)
        b = {
          ...b,
          attrs: [...b.attrs, `on${e.arg![0]!.toUpperCase()}${camel(e.arg!.slice(1))}={${fn}}`],
        };
      else
        ctx.report({
          severity: action === null && /openInEditor/.test(String(e.value)) ? "info" : "warning",
          line,
          what: `@${e.arg}="${e.value}" ${/openInEditor/.test(String(e.value)) ? "opens Slidev's editor, which Kadal does not have" : "runs Vue code"}; dropped.`,
        });
    }
    if (handlers.length) {
      ctx.helpers.add("SlidevOn");
      b = { ...b, attrs: [`as="${b.tag}"`, `click="${handlers[0]}"`, ...b.attrs], tag: "SlidevOn" };
    }

    let clickAttrs: string[] | null | undefined;
    if (click) {
      clickAttrs = clickProps(
        click.name === "after" ? "after" : "click",
        click.value === true ? undefined : click.value,
        click.mods,
        line,
      );
      if (clickAttrs === null) {
        // v-click="false": no click at all
        clickAttrs = undefined;
      }
    }

    if (motion) {
      const mAttrs = motionAttrs(binds, line);
      const at = clickAttrs?.find((a) => a.startsWith("at="));
      const asTag = b.tag;
      const canAs = /^(div|span|p|li|h1|h2|h3|img)$/.test(asTag);
      const motionAttrsAll = [...mAttrs, ...(at ? [at] : clickAttrs ? [`at="+1"`] : [])];
      if (clickAttrs?.some((a) => a === "hide"))
        ctx.report({
          severity: "warning",
          line,
          what: "v-click.hide together with v-motion: Kadal's <Motion> has no hide; it shows from its click.",
        });
      if (canAs && !handlers.length)
        b = {
          tag: "Motion",
          attrs: [`as="${asTag}"`, ...motionAttrsAll, ...b.attrs],
          children: b.children,
        };
      else b = { tag: "Motion", attrs: motionAttrsAll, children: render(b) };
      clickAttrs = undefined;
    }

    if (drag) {
      const pos = dragPos(drag.value, line);
      const extra = clickAttrs ? clickAttrs.filter((a) => !a.startsWith("#class:")) : [];
      b = { tag: "Drag", attrs: [...(pos ? [`pos="${pos}"`] : []), ...extra], children: render(b) };
      clickAttrs = undefined;
    }

    if (clickAttrs) {
      const [comp, own] = clickTag(
        click!.name === "after" ? "After" : "Click",
        clickAttrs.filter((a) => !a.startsWith("#class:")),
      );
      const cls = clickAttrs.filter((a) => a.startsWith("#class:")).map((a) => a.slice(7));
      if (html && b.tag !== "SlidevOn" && b.tag !== "Mark") {
        const merged = mergeClass(b.attrs, cls);
        b = { tag: comp, attrs: [`as="${b.tag}"`, ...own, ...merged], children: b.children };
      } else {
        const inline = b.tag === "Mark" || b.tag === "Icon" || b.tag === "span";
        b = {
          tag: comp,
          attrs: [
            ...(inline ? ['as="span"'] : []),
            ...own,
            ...(cls.length ? [jsxAttr("className", cls.join(" "))] : []),
          ],
          children: render(b),
        };
      }
    }
    return render(b);
  };

  const mergeClass = (attrs: string[], extra: string[]): string[] => {
    if (!extra.length) return attrs;
    const i = attrs.findIndex((a) => a.startsWith("className="));
    if (i < 0) return [...attrs, jsxAttr("className", extra.join(" "))];
    const current = /^className=(?:"([^"]*)"|\{"(.*)"\})$/.exec(attrs[i]!);
    const merged = [current?.[1] ?? current?.[2] ?? "", ...extra].filter(Boolean).join(" ");
    return attrs.map((a, k) => (k === i ? jsxAttr("className", merged) : a));
  };

  const markAttrs = (d: Directive, line: number): string[] => {
    const attrs: Record<string, Value> = {};
    for (const m of d.mods) {
      if (MARK_TYPES[m]) attrs.type = MARK_TYPES[m]!;
      else if (markColor(m)) attrs.color = markColor(m)!;
      else if (/^delay-?(\d+)?$/.test(m)) attrs.delay = Number(/\d+/.exec(m)?.[0] ?? 300);
      else if (/^(?:op|opacity)-?(\d+)?$/.test(m))
        attrs.opacity = Number(/\d+/.exec(m)?.[0] ?? 100) / 100;
      else
        ctx.report({
          severity: "warning",
          line,
          what: `The v-mark modifier .${m} is not one Slidev defines; ignored.`,
        });
    }
    if (d.value !== true && d.value !== "") {
      const r = evaluate(String(d.value), scope);
      if (r.kind !== "static")
        ctx.report({
          severity: "error",
          line,
          what: `v-mark="${d.value}" needs Vue; drawn on the next click.`,
        });
      else if (r.value && typeof r.value === "object" && !Array.isArray(r.value)) {
        for (const [k, v] of Object.entries(r.value)) {
          if (k === "class") continue;
          if (k === "type" && typeof v === "string") attrs.type = MARK_TYPES[v] ?? v;
          else if (KADAL_PROPS.get("Mark")?.has(k)) attrs[k] = v;
          else
            ctx.report({
              severity: "info",
              line,
              what: `The v-mark option ${k} is not one Kadal's <Mark> reads; ignored.`,
            });
        }
      } else if (r.value !== true && r.value !== undefined && r.value !== null) attrs.at = r.value;
    }
    const at = step(attrs.at ?? "+1");
    if (at !== undefined && at !== "+1") attrs.at = at as Value;
    else delete attrs.at;
    return Object.entries(attrs).map(([k, v]) => jsxAttr(k, v));
  };

  const motionAttrs = (binds: Directive[], line: number): string[] => {
    const variants: Record<string, Value> = {};
    const clicks: Record<string, Value> = {};
    for (const d of binds) {
      if (!d.arg) continue;
      const key = d.arg;
      if (
        !/^(initial|enter|leave|click-\d+(?:-\d+)?|delay|duration|visible|visible-once|hovered|focused|tapped|variants)$/.test(
          key,
        )
      )
        continue;
      const r = evaluate(String(d.value), scope);
      if (r.kind !== "static") {
        ctx.report({
          severity: "error",
          line,
          what: `:${key}="${d.value}" needs Vue to run; dropped.`,
        });
        continue;
      }
      if (/^(visible|visible-once|hovered|focused|tapped|variants)$/.test(key)) {
        ctx.report({
          severity: "warning",
          line,
          what: `The v-motion variant :${key} has no Kadal equivalent; dropped.`,
        });
        continue;
      }
      if (key.startsWith("click-")) clicks[key] = motionTarget(r.value);
      else variants[key] = key === "delay" || key === "duration" ? r.value : motionTarget(r.value);
    }
    const out: string[] = [];
    // Kadal's <Motion> has defaults for both ends; Slidev has none, so both are always written.
    const enter = (variants.enter as Record<string, Value> | undefined) ?? {};
    if (typeof variants.delay === "number" || typeof variants.duration === "number") {
      const t = { ...(enter.transition as Record<string, Value>) };
      if (typeof variants.delay === "number") t.delay = variants.delay / 1000;
      if (typeof variants.duration === "number") t.duration = variants.duration / 1000;
      enter.transition = t;
    }
    out.push(`initial={${toJs(variants.initial ?? {})}}`, `enter={${toJs(enter)}}`);
    if (variants.leave) out.push(`leave={${toJs(variants.leave)}}`);
    if (Object.keys(clicks).length) out.push(`clicks={${toJs(clicks)}}`);
    return out;
  };

  /** @vueuse/motion's numbers → motion's: ms → s in transitions, px offsets to the stage. */
  const motionTarget = (v: Value): Value => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const out: Record<string, Value> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "transition" && x && typeof x === "object" && !Array.isArray(x)) {
        const t: Record<string, Value> = {};
        for (const [tk, tv] of Object.entries(x))
          t[tk] =
            /^(delay|duration|repeatDelay)$/.test(tk) && typeof tv === "number" ? tv / 1000 : tv;
        out[k] = t;
      } else if (/^(x|y|translateX|translateY)$/.test(k) && typeof x === "number")
        out[k] = Math.round(x * ctx.scale * 100) / 100;
      else out[k] = x;
    }
    return out;
  };

  /** A v-drag position: a frontmatter name stays, numbers are scaled to the stage. */
  const dragPos = (value: string | true, line: number): string | null => {
    if (value === true || value === "") return null;
    const r = evaluate(value, scope);
    if (r.kind === "static" && typeof r.value === "string")
      return ctx.dragNames.has(r.value) || !/,/.test(r.value)
        ? r.value
        : scalePos(r.value, ctx.scale);
    if (r.kind === "static" && Array.isArray(r.value))
      return scalePos(
        r.value.map((x) => (typeof x === "number" && Number.isNaN(x) ? "_" : String(x))).join(","),
        ctx.scale,
      );
    ctx.report({
      severity: "warning",
      line,
      what: `v-drag="${value}" is not a position Kadal can read; the element is placed where it lies.`,
    });
    return null;
  };

  const emitBuiltin = (el: El, kadal: string, line: number): string => {
    // Each Slidev component's own props (values are strings unless bound).
    if (kadal === "Click" || kadal === "After") {
      const own = el.attrs.filter((a) => a.name !== "at" && a.name !== "hide");
      const at = el.attrs.find((a) => a.name === "at" || a.name === ":at");
      const atValue = at?.value;
      const mods = el.attrs.some((a) => a.name === "hide") ? ["hide"] : [];
      const cAttrs =
        clickProps(
          kadal === "After" ? "after" : "click",
          atValue === true ? undefined : atValue,
          mods,
          line,
          at?.name === "at",
        ) ?? [];
      const { attrs, classes, style } = convertAttrs(
        { ...el, attrs: own.filter((a) => a.name !== ":at") },
        kadal,
      );
      const inline = isInline(el);
      const cls = cAttrs
        .filter((a) => a.startsWith("#class:"))
        .map((a) => a.slice(7).split(" "))
        .flat();
      const [tag, own2] = clickTag(
        kadal,
        cAttrs.filter((a) => !a.startsWith("#class:")),
      );
      return render({
        tag,
        attrs: [
          ...(inline ? ['as="span"'] : []),
          ...own2,
          ...finishAttrs(attrs, [...classes, ...cls], style),
        ],
        children: el.selfClosing ? null : inner(el),
      });
    }
    if (kadal === "Clicks") {
      const { attrs, classes, style } = convertAttrs(
        {
          ...el,
          attrs: el.attrs.filter((a) => !["at", "hide", "every", "depth"].includes(a.name)),
        },
        "Clicks",
      );
      const every =
        Number(el.attrs.find((a) => a.name === "every" || a.name === ":every")?.value ?? 1) || 1;
      const depth =
        Number(el.attrs.find((a) => a.name === "depth" || a.name === ":depth")?.value ?? 1) || 1;
      if (el.attrs.some((a) => a.name === "at" || a.name === ":at" || a.name === "hide"))
        ctx.report({
          severity: "warning",
          line,
          what: "<v-clicks at> / <v-clicks hide> have no Kadal form; the items step one click at a time from here.",
        });
      const text = body.slice(el.openEnd, el.closeStart);
      const items = countItems(text, depth);
      if (items === null) sim.known = false;
      else {
        const steps = Math.ceil(items / every);
        for (let k = 0; k < steps; k++) step("+1");
      }
      const extra = [
        ...(every !== 1 ? [`every={${every}}`] : []),
        ...(depth !== 1 ? [`depth={${depth}}`] : []),
      ];
      return render({
        tag: "Clicks",
        attrs: [...extra, ...finishAttrs(attrs, classes, style)],
        children: inner(el),
      });
    }
    if (kadal === "Switch") return emitSwitch(el, line);
    if (kadal === "Drag" || kadal === "DragArrow") {
      const posAttr = el.attrs.find((a) => a.name === "pos");
      const pos =
        typeof posAttr?.value === "string"
          ? ctx.dragNames.has(posAttr.value) || !posAttr.value.includes(",")
            ? posAttr.value
            : scalePos(posAttr.value, ctx.scale, kadal === "DragArrow")
          : null;
      const { attrs, classes, style, directives } = convertAttrs(
        { ...el, attrs: el.attrs.filter((a) => a.name !== "pos") },
        kadal,
      );
      const scaled = kadal === "DragArrow" ? scaleNumberAttrs(attrs, ["width"]) : attrs;
      const built: Built = {
        tag: kadal,
        attrs: [...(pos ? [`pos="${pos}"`] : []), ...finishAttrs(scaled, classes, style)],
        children: el.selfClosing ? null : inner(el),
      };
      return wrap(built, directives, line, false);
    }
    if (kadal === "LightOrDark") {
      const { attrs, classes, style, directives } = convertAttrs({ ...el, attrs: el.attrs }, kadal);
      const passed: Record<string, Value> = {};
      for (const a of el.attrs)
        if (!directiveOf(a.name, a.value)) passed[a.name] = a.value === true ? true : a.value;
      const kids = el.children
        .map((c) => {
          const slot = c.attrs
            .map((a) => directiveOf(a.name, a.value))
            .find((x) => x?.name === "slot");
          if (c.name !== "template" || !slot) return emitElement(c);
          const scopeName = typeof slot.value === "string" ? slot.value.trim() : null;
          return `<div slot="${slot.arg}">${inner(c, scopeName ? { [scopeName]: passed } : undefined)}</div>`;
        })
        .join("\n");
      return wrap(
        {
          tag: kadal,
          attrs: finishAttrs(
            attrs.filter((a) => /^(light|dark)=/.test(a)),
            classes,
            style,
          ),
          children: `\n${kids}\n`,
        },
        directives,
        line,
        false,
      );
    }
    if (kadal === "RenderWhen") {
      const { attrs, classes, style, directives } = convertAttrs(el, kadal);
      let fallback = "";
      const kids: string[] = [];
      let at = el.openEnd;
      for (const c of el.children) {
        kids.push(emitText(at, c.start));
        const slot = c.attrs
          .map((a) => directiveOf(a.name, a.value))
          .find((x) => x?.name === "slot");
        if (c.name === "template" && slot?.arg === "fallback") fallback = inner(c).trim();
        else if (c.name === "template" && slot?.arg === "default") kids.push(inner(c));
        else kids.push(emitElement(c));
        at = c.end;
      }
      kids.push(emitText(at, el.closeStart));
      const fb = fallback ? [`fallback={<>${fallback}</>}`] : [];
      return wrap(
        {
          tag: kadal,
          attrs: [...finishAttrs(attrs, classes, style), ...fb],
          children: kids.join(""),
        },
        directives,
        line,
        false,
      );
    }
    if (kadal === "Video") {
      const { attrs, classes, style, directives } = convertAttrs(el, kadal);
      return wrap(
        {
          tag: "Video",
          attrs: finishAttrs(attrs, classes, style),
          children: el.selfClosing ? null : inner(el),
        },
        directives,
        line,
        false,
      );
    }
    if (kadal === "FitText") {
      const model = el.attrs.find((a) => a.name === "modelValue" || a.name === "model-value");
      const { attrs, classes, style, directives } = convertAttrs(
        {
          ...el,
          attrs: el.attrs.filter(
            (a) => a !== model && a.name !== "multiLine" && a.name !== "multi-line",
          ),
        },
        kadal,
      );
      const children =
        model && typeof model.value === "string"
          ? escapeText(model.value)
          : el.selfClosing
            ? ""
            : inner(el);
      return wrap(
        {
          tag: "FitText",
          attrs: finishAttrs(scaleNumberAttrs(attrs, ["max", "min"]), classes, style),
          children,
        },
        directives,
        line,
        false,
      );
    }
    if (kadal === "Youtube") {
      const id = el.attrs.find((a) => a.name === "id");
      const own = el.attrs.filter(
        (a) => a.name !== "id" && a.name !== "width" && a.name !== "height",
      );
      const { attrs, classes, style, directives } = convertAttrs({ ...el, attrs: own }, kadal);
      const extra: string[] = [];
      if (typeof id?.value === "string") {
        const [vid, query] = id.value.split("?");
        extra.push(`id="${vid}"`);
        const start = /(?:^|&)(?:start|t)=(\d+)/.exec(query ?? "")?.[1];
        if (start) extra.push(`start={${start}}`);
      }
      if (el.attrs.some((a) => a.name === "width" || a.name === "height"))
        ctx.report({
          severity: "info",
          line,
          what: "<Youtube width/height> are dropped: Kadal's player fills its box; size it with a class.",
        });
      return wrap(
        {
          tag: "Youtube",
          attrs: [...extra, ...finishAttrs(attrs, classes, style)],
          children: null,
        },
        directives,
        line,
        false,
      );
    }
    if (kadal === "Tweet") {
      const own = el.attrs.filter((a) => a.name !== "conversation" && a.name !== "cards");
      if (own.length !== el.attrs.length)
        ctx.report({
          severity: "info",
          line,
          what: "<Tweet conversation/cards> are dropped: Kadal's embed shows the post alone.",
        });
      return emitComponent({ ...el, attrs: own }, "Tweet", line);
    }
    if (kadal === "Arrow") {
      const own = el.attrs.filter((a) => a.name !== "arrowSize" && a.name !== "arrow-size");
      const { attrs, classes, style, directives } = convertAttrs({ ...el, attrs: own }, "Arrow");
      return wrap(
        {
          tag: "Arrow",
          attrs: finishAttrs(
            scaleNumberAttrs(attrs, ["x1", "y1", "x2", "y2", "width"]),
            classes,
            style,
          ),
          children: null,
        },
        directives,
        line,
        false,
      );
    }
    return emitComponent(el, kadal, line);
  };

  const emitComponent = (el: El, name: string, line: number): string => {
    const { attrs, classes, style, directives } = convertAttrs(el, name);
    let children: string | null = el.selfClosing ? null : inner(el);
    // named slots on a converted component: `<template #title>` → `<div slot="title">` (src/slidev.tsx)
    if (
      !el.selfClosing &&
      el.children.some(
        (c) =>
          c.name === "template" &&
          c.attrs.some((a) => a.name.startsWith("#") || a.name.startsWith("v-slot")),
      )
    ) {
      let at = el.openEnd;
      const parts: string[] = [];
      for (const c of el.children) {
        parts.push(emitText(at, c.start));
        const slot = c.attrs
          .map((a) => directiveOf(a.name, a.value))
          .find((x) => x?.name === "slot");
        parts.push(
          c.name === "template" && slot && slot.arg !== "default"
            ? `<div slot="${slot.arg}">${inner(c)}</div>`
            : c.name === "template"
              ? inner(c)
              : emitElement(c),
        );
        at = c.end;
      }
      parts.push(emitText(at, el.closeStart));
      children = parts.join("");
    }
    return wrap(
      { tag: name, attrs: finishAttrs(attrs, classes, style), children },
      directives,
      line,
      false,
    );
  };

  /** `<v-switch>` with `<template #1>`, `#2-4`, `#default` slots → `<Switch>` with `<Case at>`. */
  const emitSwitch = (el: El, line: number): string => {
    const { attrs, classes, style, directives } = convertAttrs(
      {
        ...el,
        attrs: el.attrs.filter(
          (a) => !["tag", "childTag", "child-tag", "transition", "unmount"].includes(a.name),
        ),
      },
      "Switch",
    );
    const extra: string[] = [];
    for (const a of el.attrs) {
      if (a.name === "tag") extra.push(`as="${a.value}"`);
      if (a.name === "childTag" || a.name === "child-tag") extra.push(`childAs="${a.value}"`);
      if (a.name === "unmount") extra.push("unmount");
      if (a.name === "transition" && typeof a.value === "string")
        extra.push(`transition="${a.value}"`);
    }
    const cases: string[] = [];
    let last = 0;
    for (const c of el.children) {
      const slot = c.attrs.map((a) => directiveOf(a.name, a.value)).find((x) => x?.name === "slot");
      if (c.name !== "template" || !slot) {
        cases.push(`<Case>${emitElement(c)}</Case>`);
        continue;
      }
      const range = /^(\d+)(?:-(\d+))?$/.exec(slot.arg ?? "");
      if (!range) {
        ctx.report({
          severity: "warning",
          line: ctx.lineAt(c.start),
          what: `The v-switch slot #${slot.arg} is not a click number; it is the next case.`,
        });
        cases.push(`<Case>${inner(c)}</Case>`);
        continue;
      }
      last = Math.max(last, Number(range[2] ?? range[1]));
      cases.push(
        `<Case at=${range[2] ? `"${range[1]}-${range[2]}"` : `{${range[1]}}`}>${inner(c)}</Case>`,
      );
    }
    for (let k = 0; k < last; k++) step("+1");
    return wrap(
      {
        tag: "Switch",
        attrs: [...extra, ...finishAttrs(attrs, classes, style)],
        children: `\n${cases.join("\n")}\n`,
      },
      directives,
      line,
      false,
    );
  };

  const unrollFor = (el: El, spec: string, line: number): string => {
    const m =
      /^\s*(?:\(\s*([\w$]+)\s*(?:,\s*([\w$]+))?\s*\)|([\w$]+))\s+(?:in|of)\s+([\s\S]+)$/.exec(spec);
    const fallback = () => {
      ctx.report({
        severity: "error",
        line,
        what: `v-for="${spec}" walks something only Vue knows; the element is shown once.`,
        suggestion: "Write the items out, or make it a component.",
      });
      return emitElement({ ...el, attrs: el.attrs.filter((a) => a.name !== "v-for") });
    };
    if (!m) return fallback();
    const item = m[1] ?? m[3]!;
    const index = m[2];
    const r = evaluate(m[4]!.trim(), scope);
    const listJs = r.kind === "static" ? null : ctx.dynamic?.(m[4]!.trim(), locals);
    if (listJs) {
      const stripped: El = {
        ...el,
        attrs: el.attrs.filter((a) => a.name !== "v-for" && a.name !== ":key"),
      };
      const added = [item, index ?? "index"].filter((x) => !locals.has(x));
      for (const x of added) locals.add(x);
      const body =
        el.name === "template"
          ? `<Fragment key={${index ?? "index"}}>${inner(stripped)}</Fragment>`
          : emitElement(stripped).replace(/^<([\w.]+)/, `<$1 key={${index ?? "index"}}`);
      for (const x of added) locals.delete(x);
      return `{Array.from(${/^\d+$/.test(listJs) ? `{ length: ${listJs} }, (_, i) => i + 1` : listJs}).map((${item}, ${index ?? "index"}) => (${body}))}`;
    }
    if (r.kind !== "static") return fallback();
    const list: Value[] =
      typeof r.value === "number"
        ? Array.from({ length: r.value }, (_, i) => i + 1)
        : Array.isArray(r.value)
          ? r.value
          : r.value && typeof r.value === "object"
            ? Object.values(r.value)
            : [];
    const stripped: El = {
      ...el,
      attrs: el.attrs.filter((a) => a.name !== "v-for" && a.name !== ":key"),
    };
    return list
      .map((v, i) => {
        const saved = { ...scope };
        scope[item] = v;
        if (index) scope[index] = i;
        const out = el.name === "template" ? inner(stripped) : emitElement(stripped);
        for (const k of Object.keys(scope)) if (!(k in saved)) delete scope[k];
        Object.assign(scope, saved);
        return out;
      })
      .join("\n");
  };

  const isInline = (el: El): boolean => {
    const lineStart = body.lastIndexOf("\n", el.start - 1) + 1;
    const before = body.slice(lineStart, el.start);
    const afterEnd = body.indexOf("\n", el.end);
    const after = body.slice(el.end, afterEnd === -1 ? body.length : afterEnd);
    return /\S/.test(before) || /\S/.test(after);
  };

  const navAction = (value: string): string | null => {
    const m = /^\s*\$(?:slidev\.)?nav\.(\w+)\s*(?:\(\s*([^)]*)\s*\))?\s*;?\s*$/.exec(value);
    if (!m) return null;
    const action = NAV_ACTIONS[m[1]!];
    if (!action) return null;
    if (action === "go") return /^\d+$/.test(m[2] ?? "") ? `go:${m[2]}` : null;
    return action;
  };

  const out = inner(scan.root);
  return out;
}

/**
 * `<After>` with the step written out (where Slidev's count and Kadal's parted) is a `<Click at>`;
 * an `<After>` never carries `at` of its own.
 */
function clickTag(comp: "Click" | "After", attrs: string[]): ["Click" | "After", string[]] {
  const written = attrs.find((a) => a.startsWith("#after-at:"));
  if (comp === "After" && written)
    return [
      "Click",
      [`at={${written.slice(10)}}`, ...attrs.filter((a) => a !== written && !a.startsWith("at="))],
    ];
  return [
    comp,
    attrs.filter((a) => !a.startsWith("#after-at:") && !(comp === "After" && a.startsWith("at="))),
  ];
}

/** Positions on Slidev's canvas → Kadal's stage (`_` and names kept). */
export function scalePos(pos: string, scale: number, arrow = false): string {
  return pos
    .split(",")
    .map((p, i) => {
      const t = p.trim();
      if (!/^-?\d+(\.\d+)?$/.test(t)) return t;
      // the fifth number of a box is its rotation (degrees), never scaled
      if (!arrow && i === 4) return t;
      return String(Math.round(Number(t) * scale));
    })
    .join(",");
}

/** Numeric props given as strings or numbers, multiplied by the canvas scale. */
function scaleNumberAttrsWith(attrs: string[], names: string[], scale: number): string[] {
  return attrs.map((a) => {
    const m = /^([\w-]+)=(?:"(-?[\d.]+)"|\{(-?[\d.]+)\})$/.exec(a);
    if (!m || !names.includes(m[1]!)) return a;
    const n = Number(m[2] ?? m[3]);
    return `${m[1]}={${Math.round(n * scale * 100) / 100}}`;
  });
}

const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "text",
  "tspan",
  "defs",
  "use",
  "symbol",
  "marker",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "filter",
  "foreignObject",
  "image",
]);

const HTML_ATTRS = new Set(
  (
    "id title alt src href target rel type name value width height lang dir hidden draggable tabindex " +
    "role colspan rowspan headers scope for form action method placeholder disabled checked selected " +
    "multiple required readonly min max step pattern size maxlength controls autoplay loop muted poster " +
    "preload playsinline allow allowfullscreen frameborder loading decoding sizes srcset media download " +
    "cite datetime open start reversed span label kind srclang default async defer crossorigin integrity " +
    "referrerpolicy sandbox srcdoc usemap ismap coords shape align valign bgcolor border cellpadding " +
    "cellspacing color face nowrap slot contenteditable spellcheck accesskey translate inert popover " +
    "viewBox fill stroke stroke-width stroke-linecap stroke-linejoin d cx cy r rx ry x y x1 y1 x2 y2 points " +
    "transform opacity xmlns preserveAspectRatio offset stop-color stop-opacity fill-opacity stroke-opacity " +
    "fill-rule clip-rule font-size font-family text-anchor dominant-baseline gradientUnits"
  ).split(" "),
);

/**
 * Is this a real attribute of the element (so `border="1"` on a table, `color` on a font, `width`
 * on an img stay attributes rather than reading as attributify utilities)? `border` on an `img`
 * reads as a utility, as UnoCSS reads it (`border="rounded"` in the Slidev starter).
 */
function isRealHtmlAttr(name: string, tag: string): boolean {
  if (/^(data|aria)-/.test(name)) return true;
  if (name === "border" && tag !== "table") return false;
  if (name === "color" && tag !== "font") return false;
  return HTML_ATTRS.has(name);
}

/** A Vue `:class` value → class tokens: a string, an array, or `{ cls: true }`. */
function classList(v: Value): string[] {
  if (typeof v === "string") return expandVariantGroups(v).split(/\s+/).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(classList);
  if (v && typeof v === "object")
    return Object.entries(v)
      .filter(([, on]) => !!on)
      .map(([k]) => k);
  return [];
}

/** A string attribute for a prop of `type`: numbers and booleans as such. */
function coerce(value: string | true, type: string): Value {
  if (value === true) return true;
  // a long id (`<Tweet id="1390115482657726468">`) stays a string where the prop takes one
  if (/\bnumber\b/.test(type) && !/\bstring\b/.test(type) && /^-?\d+(\.\d+)?$/.test(value.trim()))
    return Number(value);
  if (/\bboolean\b/.test(type) && (value === "true" || value === "false" || value === ""))
    return value !== "false";
  return value;
}

/** How many list items a `<v-clicks>` body steps through, or null when it cannot tell. */
function countItems(text: string, depth: number): number | null {
  const lines = text.split("\n").filter((l) => /^\s*([-*+]|\d+[.)])\s+/.test(l));
  if (!lines.length) return /<\w/.test(text) ? null : 0;
  const indents = [...new Set(lines.map((l) => /^\s*/.exec(l)![0].length))].sort((a, b) => a - b);
  const allowed = new Set(indents.slice(0, depth));
  return lines.filter((l) => allowed.has(/^\s*/.exec(l)![0].length)).length;
}
