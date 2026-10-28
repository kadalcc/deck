import YAML from "yaml";

import { mdxComment, styleObject } from "./markup.ts";
import { createReport, type ImportReportItem, type Reporter, sortReport } from "./report.ts";
import { type El, VOID_ELEMENTS, parseOpenTag, scanSlide } from "./tags.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REVEAL.JS → KADAL DECK, AS A PURE FUNCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const { mdx, files, report, info } = convertReveal(indexHtml, { file: "index.html", readFile });
 *
 * `html` is a reveal.js page. Its `.reveal .slides` sections become slides (a section of sections
 * is a vertical stack: `----` in deck.mdx), and the HTML in them becomes Markdown wherever it is
 * plain enough to be retyped in place, JSX where it carries attributes Markdown cannot hold:
 *
 *   class="fragment fade-up" data-fragment-index="2"   <Click effect="fade-up" at={2}>
 *   a list whose every item is a fragment              <Clicks> around the Markdown list
 *   data-background-color / -image / -video / -gradient / -iframe (+ size, position, opacity…)
 *                                                      background* frontmatter
 *   data-transition, data-auto-animate, data-autoslide, data-state, id, class
 *                                                      the frontmatter keys of the same names
 *   <aside class="notes">, data-notes                  <Notes>
 *   <pre><code class="language-js" data-line-numbers="1|2-3">
 *                                                      ```js {1|2-3}{lines:true}
 *   data-markdown (inline or an external file)         its Markdown, split on the section's
 *                                                      separators, with `<!-- .slide: -->` and
 *                                                      `<!-- .element: -->` read
 *   Reveal.initialize({ … })                           its literal options, as headmatter
 *
 * Kadal took reveal.js's names for its options, so most keys carry over as they are. Nothing in
 * the page is run: scripts are reported, not executed. Local images and media the slides name are
 * listed in `info.assets` (copied into public/ by the CLI) and pointed at as `/path`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface RevealImportOptions {
  /** The page's path in the project (for the report). Default index.html. */
  file?: string;
  /** Read a project file as text (`slides.md`, `css/custom.css`); null when it is not there. */
  readFile?: (path: string) => string | null;
  /** Whether a project file exists (images and media); without it every local path is assumed to. */
  exists?: (path: string) => boolean;
}

export interface RevealImportInfo {
  title: string | null;
  /** The reveal.js theme the page links (`black`), and the Kadal theme and scheme chosen. */
  theme: { reveal: string | null; kadal: string; colorScheme: "light" | "dark" | null };
  /** Kadal's stage, and the factor inline lengths were scaled by from reveal's. */
  canvas: { width: number; height: number; scale: number };
  /** Local files to copy: from (project-relative) → to (deck-relative, under public/). */
  assets: Array<{ from: string; to: string }>;
  /** Stylesheets for src/styles.css to import, relative to src/. */
  styleImports: string[];
  titles: string[];
  slides: number;
  cleanSlides: number;
}

export interface RevealImport {
  mdx: string;
  files: Record<string, string>;
  report: ImportReportItem[];
  info: RevealImportInfo;
}

const KADAL_WIDTH = 1920;
const KADAL_HEIGHT = 1080;

/** Reveal's fragment styles that Kadal has under the same name (reference: click effects). */
const EFFECTS = new Set([
  "fade-in",
  "fade-out",
  "fade-up",
  "fade-down",
  "fade-left",
  "fade-right",
  "fade-in-then-out",
  "fade-in-then-semi-out",
  "current-visible",
  "grow",
  "shrink",
  "strike",
  "semi-fade-out",
  "highlight-red",
  "highlight-green",
  "highlight-blue",
  "highlight-current-red",
  "highlight-current-green",
  "highlight-current-blue",
]);

/** reveal.js's own themes, by the scheme their background sets. */
const DARK_THEMES = new Set([
  "black",
  "night",
  "league",
  "blood",
  "moon",
  "dracula",
  "black-contrast",
]);
const LIGHT_THEMES = new Set([
  "white",
  "beige",
  "simple",
  "serif",
  "sky",
  "solarized",
  "white-contrast",
]);

/** Reveal.initialize options Kadal reads under the same name (core/model.ts). */
const SAME_OPTIONS = new Set([
  "controls",
  "controlsTutorial",
  "controlsLayout",
  "controlsBackArrows",
  "progress",
  "slideNumber",
  "showSlideNumber",
  "hash",
  "hashOneBasedIndex",
  "history",
  "keyboard",
  "overview",
  "center",
  "touch",
  "loop",
  "rtl",
  "navigationMode",
  "shuffle",
  "fragments",
  "fragmentInURL",
  "embedded",
  "help",
  "pause",
  "showNotes",
  "autoPlayMedia",
  "autoAnimate",
  "autoAnimateEasing",
  "autoAnimateDuration",
  "autoAnimateUnmatched",
  "autoSlide",
  "autoSlideStoppable",
  "defaultTiming",
  "totalTime",
  "mouseWheel",
  "previewLinks",
  "transition",
  "transitionSpeed",
  "backgroundTransition",
  "viewDistance",
  "mobileViewDistance",
  "hideInactiveCursor",
  "hideCursorTime",
  "margin",
  "minScale",
  "maxScale",
  "view",
  "scrollProgress",
  "scrollSnap",
  "scrollActivationWidth",
  "pdfSeparateFragments",
  "pdfMaxPagesPerSlide",
  "jumpToSlide",
  "preloadIframes",
  "respondToHashChanges",
  "keyboardCondition",
  "autoAnimateStyles",
  "scrollLayout",
  "parallaxBackgroundImage",
  "parallaxBackgroundSize",
  "parallaxBackgroundHorizontal",
  "parallaxBackgroundVertical",
  "disableLayout",
  "postMessage",
  "postMessageEvents",
  "focusBodyOnPageVisibilityChange",
]);

/** Options that only change how reveal.js itself runs, dropped without a report line. */
const QUIET_OPTIONS = new Set([
  "plugins",
  "dependencies",
  "markdown",
  "highlight",
  "math",
  "katex",
  "notes",
  "search",
  "zoom",
  "menu",
  "chalkboard",
  "multiplex",
]);

/** JSX spellings of the HTML attributes slides use. */
const JSX_ATTR: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  colspan: "colSpan",
  rowspan: "rowSpan",
  autoplay: "autoPlay",
  frameborder: "frameBorder",
  allowfullscreen: "allowFullScreen",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
  playsinline: "playsInline",
  readonly: "readOnly",
  maxlength: "maxLength",
  contenteditable: "contentEditable",
  referrerpolicy: "referrerPolicy",
  "xlink:href": "xlinkHref",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  "font-size": "fontSize",
  "text-anchor": "textAnchor",
  viewbox: "viewBox",
};

const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rarr: "→",
  larr: "←",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  rArr: "⇒",
  times: "×",
  divide: "÷",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  le: "≤",
  ge: "≥",
  ne: "≠",
  laquo: "«",
  raquo: "»",
  euro: "€",
  pound: "£",
  check: "✓",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const posix = {
  join: (...parts: string[]) => {
    const out: string[] = [];
    for (const seg of parts.join("/").split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") {
        if (!out.length) return null;
        out.pop();
      } else out.push(seg);
    }
    return out.join("/");
  },
  dirname: (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""),
};

type Frontmatter = Record<string, unknown>;

interface Slide {
  fm: Frontmatter;
  body: string;
  notes: string[];
  vertical: boolean;
  /** Where in the source it starts (1-based line), for the report. */
  line: number;
}

/** Text, an element, or the raw text of a protected stretch (`<script>`, `<style>`, a comment). */
type Node = { t: "text"; s: string } | { t: "el"; el: El };

export function convertReveal(html: string, options: RevealImportOptions = {}): RevealImport {
  const file = options.file ?? "index.html";
  const read = options.readFile ?? (() => null);
  const exists = options.exists ?? (() => true);
  const base = posix.dirname(file);
  const { items, reporter } = createReport({ file });
  const deckReport = reporter({ slide: null, line: null });

  // <textarea data-template> holds Markdown, which must not be scanned as tags
  const templates: string[] = [];
  const doc = html.replace(
    /(<textarea\b[^>]*>)([\s\S]*?)(<\/textarea\s*>)/gi,
    (_, open: string, inner: string, close: string) => {
      templates.push(inner);
      return `${open}\uE002T${templates.length - 1}\uE002${close}`;
    },
  );
  const lineOf = (at: number) => doc.slice(0, at).split("\n").length;
  const { root } = scanSlide(doc, true);

  const all: El[] = [];
  const walk = (el: El) => {
    for (const c of el.children) {
      all.push(c);
      walk(c);
    }
  };
  walk(root);
  const attrOf = (el: El, name: string): string | true | undefined =>
    el.attrs.find((a) => a.name.toLowerCase() === name)?.value;
  const str = (el: El, name: string): string | undefined => {
    const v = attrOf(el, name);
    return typeof v === "string" ? decodeEntities(v) : v === true ? "" : undefined;
  };
  const classesOf = (el: El) => (str(el, "class") ?? "").split(/\s+/).filter(Boolean);
  const raw = (el: El) => doc.slice(el.openEnd, el.closeStart);

  // ── the page: title, theme, stylesheets, Reveal.initialize ──────────────────────────────
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(doc);
  const title = titleM ? decodeEntities(titleM[1]!).trim() || null : null;
  const themeM = /(?:^|\/)theme\/([\w-]+)\.css/.exec(
    all
      .filter((e) => e.name.toLowerCase() === "link")
      .map((e) => str(e, "href") ?? "")
      .join("\n"),
  );
  const revealTheme = themeM ? themeM[1]! : null;
  const colorScheme: "light" | "dark" | null = revealTheme
    ? DARK_THEMES.has(revealTheme)
      ? "dark"
      : LIGHT_THEMES.has(revealTheme)
        ? "light"
        : null
    : null;
  if (revealTheme && !colorScheme)
    deckReport({
      severity: "warning",
      what: `The reveal.js theme "${revealTheme}" is not one of reveal's own; the deck uses Kadal's minimal theme.`,
      suggestion: "Pick a Kadal theme (kadal-deck info themes) or restyle it in src/styles.css.",
    });
  else if (revealTheme)
    deckReport({
      severity: "info",
      what: `reveal.js's ${revealTheme} theme becomes Kadal's minimal theme in its ${colorScheme} scheme.`,
    });

  const head: Frontmatter = {};
  if (title) head.title = title;
  head.theme = "minimal";
  // reveal.css alone (no theme) is black on white
  head.colorScheme = colorScheme ?? "light";

  let width = 960;
  let height = 700;
  const config = revealConfig(doc);
  if (config.found) {
    for (const [k, v] of Object.entries(config.values)) {
      if (k === "width" && typeof v === "number") width = v;
      else if (k === "height" && typeof v === "number") height = v;
      else if (SAME_OPTIONS.has(k)) head[k] = v;
      else if (!QUIET_OPTIONS.has(k))
        deckReport({
          severity: "info",
          what: `Reveal.initialize's \`${k}\` has no Kadal option of that name and is dropped.`,
        });
    }
    for (const k of config.skipped)
      if (!QUIET_OPTIONS.has(k))
        deckReport({
          severity: "info",
          what: `Reveal.initialize's \`${k}\` is not a plain value and is dropped.`,
        });
  }
  const scale = Math.round((KADAL_WIDTH / width) * 1000) / 1000;
  if (width !== KADAL_WIDTH || height !== KADAL_HEIGHT)
    deckReport({
      severity: "info",
      what: `reveal.js laid the slides out at ${width}×${height}; Kadal's stage is ${KADAL_WIDTH}×${KADAL_HEIGHT}, and inline lengths are scaled ×${scale}.`,
    });

  // stylesheets: the page's own <style> blocks, and linked CSS that is not reveal.js's
  const files: Record<string, string> = {};
  const styleImports: string[] = [];
  const pageCss: string[] = [];
  // every <style> in the page, the slides' own too: reveal.js applies them all page-wide
  for (const m of doc.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi))
    if (m[1]!.trim()) pageCss.push(m[1]!.trim());
  for (const link of all.filter((e) => e.name.toLowerCase() === "link")) {
    const href = str(link, "href");
    if (!href || !/stylesheet/i.test(str(link, "rel") ?? "") || /^(https?:)?\/\//.test(href))
      continue;
    if (/(^|\/)(reveal|reset)(\.min)?\.css$|(^|\/)(dist|plugin|lib)\/|theme\//.test(href)) continue;
    const from = posix.join(base, href.split(/[?#]/)[0]!);
    const css = from ? read(from) : null;
    if (css === null) {
      deckReport({
        severity: "warning",
        what: `The stylesheet ${href} was not found, so it is not carried over.`,
      });
      continue;
    }
    const name = `src/reveal/${from!.split("/").pop()}`;
    files[name] = css;
    styleImports.push(name.slice("src/".length).replace(/^/, "./"));
  }
  if (pageCss.length) {
    files["src/reveal.css"] = `${pageCss.join("\n\n")}\n`;
    styleImports.unshift("./reveal.css");
  }
  if (styleImports.length)
    deckReport({
      severity: "warning",
      what: `The page's own CSS is carried into ${styleImports.map((s) => `src/${s.slice(2)}`).join(", ")}; selectors written for reveal.js's markup (.reveal .slides section …) do not match Kadal's.`,
      suggestion: "Point them at the classes the slides use, or drop the reveal.js-specific rules.",
    });
  for (const m of doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/text\/template/i.test(m[1]!)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]!)?.[1];
    if (
      src &&
      /(^|\/)(reveal|plugin|dist|lib)[/.]|highlight|markdown|notes|math|zoom|search/i.test(src)
    )
      continue;
    if (!src && /\.initialize\s*\(|new\s+Reveal/.test(m[2]!)) continue;
    if (!src && !m[2]!.trim()) continue;
    deckReport({
      severity: "warning",
      line: lineOf(m.index!),
      what: `A script (${src ?? "inline"}) is not carried over: nothing in the page is run.`,
      suggestion: "Move what it does into a component in src/components.tsx.",
    });
  }

  // ── assets: local paths are copied into public/ and named from the deck's root ──────────
  const assets = new Map<string, string>();
  const asset = (url: string, rep: Reporter): string => {
    if (!url || /^([a-z][\w+.-]*:|\/\/|#)/i.test(url)) return url;
    const [path, rest] = [url.replace(/[?#].*$/, ""), url.slice(url.replace(/[?#].*$/, "").length)];
    const from = posix.join(path.startsWith("/") ? "" : base, decodeURI(path));
    if (!from) {
      rep({
        severity: "warning",
        what: `${url} points outside the reveal.js project and is kept as written.`,
      });
      return url;
    }
    if (!exists(from)) {
      rep({
        severity: "warning",
        what: `${url} is not in the reveal.js project; the slide names it as written.`,
      });
      return url;
    }
    assets.set(from, `public/${from}`);
    return `/${from}${rest}`;
  };

  // ── the slides ─────────────────────────────────────────────────────────────────────────
  const container =
    all.find((e) => classesOf(e).includes("slides") && hasAncestorClass(e, "reveal", classesOf)) ??
    all.find((e) => classesOf(e).includes("slides"));
  const isSection = (e: El) => e.name.toLowerCase() === "section";
  const topSections = container
    ? container.children.filter(isSection)
    : all.filter((e) => isSection(e) && !hasAncestor(e, isSection));
  if (!topSections.length)
    deckReport({
      severity: "error",
      what: "No reveal.js slides were found: the page has no <section> inside .reveal .slides.",
    });

  const slides: Slide[] = [];
  // reporters per slide number are made once the slide's number is known
  const slideReport = (n: number, line: number) => reporter({ slide: n, line });

  const emit = (sec: El, vertical: boolean) => {
    if (attrOf(sec, "data-markdown") !== undefined) {
      for (const piece of markdownSection(sec, vertical)) slides.push(piece);
      return;
    }
    const n = slides.length + 1;
    const rep = slideReport(n, lineOf(sec.start));
    const fm = sectionFrontmatter(
      sec.attrs.map((a) => ({
        name: a.name,
        value: typeof a.value === "string" ? decodeEntities(a.value) : a.value,
      })),
      rep,
    );
    const notes: string[] = [];
    const ctx: Ctx = { rep, notes, steps: fragmentSteps(sec), clicksLists: true };
    const body = blocks(childNodes(sec), ctx);
    const dataNotes = str(sec, "data-notes");
    if (dataNotes) notes.unshift(dataNotes);
    slides.push({ fm, body, notes, vertical, line: lineOf(sec.start) });
  };

  for (const sec of topSections) {
    const inner = sec.children.filter(isSection);
    if (inner.length) {
      const own = sec.attrs.filter((a) => !/^(class|id)$/i.test(a.name));
      if (own.length)
        slideReport(
          slides.length + 1,
          lineOf(sec.start),
        )({
          severity: "info",
          what: `The vertical stack's own attributes (${own.map((a) => a.name).join(", ")}) are not carried over; each slide in it keeps its own.`,
        });
      inner.forEach((s, i) => emit(s, i > 0));
    } else emit(sec, false);
  }

  // ── slide attributes → frontmatter ────────────────────────────────────────────────────────
  function sectionFrontmatter(
    attrs: Array<{ name: string; value: string | true }>,
    rep: Reporter,
  ): Frontmatter {
    const fm: Frontmatter = {};
    const get = (n: string) => attrs.find((a) => a.name.toLowerCase() === n)?.value;
    const s = (n: string) => {
      const v = get(n);
      return v === true ? "" : v;
    };
    const has = (n: string) => get(n) !== undefined;
    const known = new Set<string>();
    const take = (n: string) => {
      known.add(n);
      return s(n);
    };
    const id = take("id");
    if (id) fm.id = id;
    const cls = (take("class") ?? "")
      .split(/\s+/)
      .filter((c) => c && !["stack", "present", "past", "future"].includes(c));
    if (cls.length) fm.class = cls.join(" ");

    const bg = take("data-background");
    if (bg) {
      const short = backgroundShorthand(bg);
      for (const k of ["backgroundImage", "backgroundVideo"] as const)
        if (typeof short[k] === "string") short[k] = asset(short[k] as string, rep);
      Object.assign(fm, short);
    }
    const color = take("data-background-color");
    if (color) fm.backgroundColor = color;
    const gradient = take("data-background-gradient");
    if (gradient) fm.backgroundGradient = gradient;
    const image = take("data-background-image");
    if (image) fm.backgroundImage = asset(image, rep);
    const video = take("data-background-video");
    if (video) {
      fm.backgroundVideo = video
        .split(",")
        .map((v) => asset(v.trim(), rep))
        .join(",");
      if (video.includes(","))
        rep({
          severity: "warning",
          what: "The background video lists several sources; Kadal plays one, so keep the one every browser plays.",
        });
      // reveal plays a background video once and with sound unless told otherwise
      fm.backgroundVideoLoop = has("data-background-video-loop");
      fm.backgroundVideoMuted = has("data-background-video-muted");
    }
    known.add("data-background-video-loop");
    known.add("data-background-video-muted");
    const iframe = take("data-background-iframe");
    if (iframe) fm.backgroundIframe = iframe;
    if (has("data-background-interactive")) fm.backgroundInteractive = true;
    known.add("data-background-interactive");
    for (const [attr, key] of [
      ["data-background-size", "backgroundSize"],
      ["data-background-position", "backgroundPosition"],
      ["data-background-repeat", "backgroundRepeat"],
    ] as const) {
      const v = take(attr);
      if (v) fm[key] = v;
    }
    const opacity = take("data-background-opacity");
    if (opacity && Number.isFinite(Number(opacity))) fm.backgroundOpacity = Number(opacity);
    const bgTransition = take("data-background-transition");
    if (bgTransition) fm.backgroundTransition = bgTransition;
    const transition = take("data-transition");
    if (transition) fm.transition = transition;
    const speed = take("data-transition-speed");
    if (speed) fm.transitionSpeed = speed;
    if (has("data-auto-animate")) fm.autoAnimate = true;
    known.add("data-auto-animate");
    const aaId = take("data-auto-animate-id");
    if (aaId) fm.autoAnimateId = aaId;
    if (has("data-auto-animate-restart")) fm.autoAnimateRestart = true;
    known.add("data-auto-animate-restart");
    for (const k of [
      "data-auto-animate-easing",
      "data-auto-animate-duration",
      "data-auto-animate-unmatched",
      "data-auto-animate-delay",
    ])
      if (has(k)) {
        known.add(k);
        rep({
          severity: "info",
          what: `${k} is deck-wide in Kadal (autoAnimate${k.slice("data-auto-animate-".length).replace(/^./, (c) => c.toUpperCase())} in the headmatter); this slide's value is dropped.`,
        });
      }
    const autoslide = take("data-autoslide");
    if (autoslide && Number.isFinite(Number(autoslide))) fm.autoSlide = Number(autoslide);
    const state = take("data-state");
    if (state) fm.state = state;
    const visibility = take("data-visibility");
    if (visibility === "hidden" || visibility === "uncounted") fm.visibility = visibility;
    const timing = take("data-timing");
    if (timing && Number.isFinite(Number(timing))) fm.timing = Number(timing);
    for (const k of [
      "data-notes",
      "data-markdown",
      "data-separator",
      "data-separator-vertical",
      "data-separator-notes",
      "data-charset",
      "data-element-attributes",
      "data-attributes",
    ])
      known.add(k);

    // reveal flips the text colour on a dark background; Kadal does it with a slide colour scheme
    const flat = typeof fm.backgroundColor === "string" ? fm.backgroundColor : null;
    const lum = flat ? luminance(flat) : null;
    if (lum !== null) {
      const dark = lum < 0.4;
      if (dark && colorScheme !== "dark") fm.colorScheme = "dark";
      if (!dark && colorScheme === "dark") fm.colorScheme = "light";
    }

    for (const a of attrs) {
      const n = a.name.toLowerCase();
      if (known.has(n)) continue;
      if (n === "style")
        rep({
          severity: "warning",
          what: `The slide's style="${a.value}" is not carried over (a slide has no style of its own in Kadal).`,
          suggestion: "Give the slide a class and style it in src/styles.css.",
        });
      else
        rep({
          severity: "info",
          what: `The slide attribute ${a.name} has no Kadal equivalent and is dropped.`,
        });
    }
    return fm;
  }

  // ── fragments: the step each one shows at ───────────────────────────────────────────────
  /** Absolute steps, only when some fragment names its index; otherwise document order rules. */
  function fragmentSteps(sec: El): Map<El, number> | null {
    const frags: El[] = [];
    const visit = (el: El) => {
      for (const c of el.children) {
        if (isSection(c)) continue;
        if (classesOf(c).includes("fragment")) frags.push(c);
        visit(c);
      }
    };
    visit(sec);
    if (!frags.some((f) => attrOf(f, "data-fragment-index") !== undefined)) return null;
    // reveal.js's sortFragments: indexed groups in index order, then the rest in document order
    const indexed = new Map<number, El[]>();
    const rest: El[] = [];
    for (const f of frags) {
      const i = Number(str(f, "data-fragment-index"));
      if (attrOf(f, "data-fragment-index") !== undefined && Number.isFinite(i)) {
        if (!indexed.has(i)) indexed.set(i, []);
        indexed.get(i)!.push(f);
      } else rest.push(f);
    }
    const out = new Map<El, number>();
    let step = 0;
    for (const i of [...indexed.keys()].sort((a, b) => a - b)) {
      step++;
      for (const f of indexed.get(i)!) out.set(f, step);
    }
    for (const f of rest) out.set(f, ++step);
    return out;
  }

  // ── HTML → Markdown / JSX ──────────────────────────────────────────────────────────────
  interface Ctx {
    rep: Reporter;
    notes: string[];
    steps: Map<El, number> | null;
    clicksLists: boolean;
  }

  function childNodes(el: El): Node[] {
    const out: Node[] = [];
    let at = el.openEnd;
    const text = (s: string) => {
      if (s) out.push({ t: "text", s });
    };
    for (const c of el.children) {
      if (c.start > at) text(doc.slice(at, c.start));
      out.push({ t: "el", el: c });
      at = Math.max(at, c.end);
    }
    if (el.closeStart > at) text(doc.slice(at, el.closeStart));
    return out;
  }

  /** What a fragment's class list says: its effect, its other classes, and its step. */
  function fragmentOf(el: El, ctx: Ctx) {
    const cls = classesOf(el);
    if (!cls.includes("fragment")) return null;
    const effects = cls.filter((c) => EFFECTS.has(c));
    const other = cls.filter((c) => c !== "fragment" && !EFFECTS.has(c));
    for (const c of other)
      if (/^(fade|highlight|grow|shrink|strike|zoom|custom)/.test(c))
        ctx.rep({
          severity: "warning",
          what: `The fragment style "${c}" has no Kadal click effect; it is kept as a class on the <Click>.`,
          suggestion:
            "Pick one of Kadal's click effects (kadal-deck info clickEffects), or define the class in CSS.",
        });
    if (effects.length > 1)
      ctx.rep({
        severity: "warning",
        what: `A fragment combines ${effects.join(" and ")}; Kadal's <Click> takes one effect, so it uses ${effects[0]}.`,
      });
    const props: string[] = [];
    const step = ctx.steps?.get(el);
    if (step !== undefined) props.push(`at={${step}}`);
    if (effects[0] && effects[0] !== "fade-in") props.push(`effect="${effects[0]}"`);
    if (other.length) props.push(`className="${other.join(" ")}"`);
    return { props, effect: effects[0] ?? null, other };
  }

  /** The element's attributes as JSX, without the ones its conversion has used up. */
  function jsxAttrs(el: El, ctx: Ctx, drop: string[] = []): string {
    const out: string[] = [];
    for (const a of el.attrs) {
      const n = a.name.toLowerCase();
      if (drop.includes(n)) continue;
      if (n.startsWith("on")) {
        ctx.rep({
          severity: "warning",
          what: `The ${a.name} handler on <${el.name}> is dropped: nothing in the page is run.`,
        });
        continue;
      }
      const value = a.value === true ? true : decodeEntities(a.value);
      if (n === "style" && typeof value === "string") {
        const obj = styleObject(value, scale);
        if (Object.keys(obj).length) out.push(`style={${JSON.stringify(obj)}}`);
        continue;
      }
      if (n === "class" && typeof value === "string") {
        const cls = value.split(/\s+/).filter((c) => c && c !== "fragment" && !EFFECTS.has(c));
        if (cls.length) out.push(`className="${cls.join(" ")}"`);
        continue;
      }
      if (n === "data-fragment-index") continue;
      let name = JSX_ATTR[n] ?? a.name;
      let v = value;
      if (n === "data-src" && attrOf(el, "src") === undefined) name = "src";
      if (n === "data-autoplay") name = "autoPlay";
      if (
        (name === "src" || name === "poster" || (n === "href" && el.name.toLowerCase() !== "a")) &&
        typeof v === "string"
      )
        v = asset(v, ctx.rep);
      if (name === "autoPlay") v = true;
      if (v === true) out.push(name);
      else out.push(/["\\{}\n]/.test(v) ? `${name}={${JSON.stringify(v)}}` : `${name}="${v}"`);
    }
    return out.length ? ` ${out.join(" ")}` : "";
  }

  /** An element is "plain" when Markdown can say everything its attributes say. */
  function plain(el: El): boolean {
    const name = el.name.toLowerCase();
    const allowed: Record<string, string[]> = {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "data-src"],
      ol: ["start"],
      code: [],
    };
    const ok = new Set([...(allowed[name] ?? []), "class", "data-fragment-index"]);
    return el.attrs.every((a) => {
      const n = a.name.toLowerCase();
      if (!ok.has(n)) return false;
      if (n === "class") return classesOf(el).every((c) => c === "fragment" || EFFECTS.has(c));
      return true;
    });
  }

  function isBlock(node: Node): boolean {
    if (node.t !== "el") return false;
    const n = node.el.name.toLowerCase();
    if (n === "img") return false;
    return !INLINE.has(n);
  }

  /** A run of block-level nodes as Markdown blocks. */
  function blocks(nodes: Node[], ctx: Ctx): string {
    const out: string[] = [];
    let run: Node[] = [];
    const flush = () => {
      const text = inline(run, ctx).trim();
      if (text) out.push(text);
      run = [];
    };
    for (const node of nodes) {
      if (isBlock(node)) {
        flush();
        const b = block((node as { el: El }).el, ctx);
        if (b) out.push(b);
      } else run.push(node);
    }
    flush();
    return out.join("\n\n");
  }

  function wrapClick(frag: { props: string[] }, inner: string, inlineEl = false): string {
    const props = frag.props.length ? ` ${frag.props.join(" ")}` : "";
    return inlineEl
      ? `<Click as="span"${props}>${inner}</Click>`
      : `<Click${props}>\n\n${inner}\n\n</Click>`;
  }

  function block(el: El, ctx: Ctx): string {
    const name = el.name.toLowerCase();
    if (name === "aside" && classesOf(el).includes("notes")) {
      ctx.notes.push(blocks(childNodes(el), { ...ctx, notes: [], steps: null }));
      return "";
    }
    if (name === "script" || name === "style" || name === "link" || name === "meta") return "";
    if (name === "section") {
      ctx.rep({
        severity: "warning",
        what: "A section nested two deep is flattened into its slide (reveal.js stacks go one level deep).",
      });
      return blocks(childNodes(el), ctx);
    }
    const frag = fragmentOf(el, ctx);
    const md = blockMarkdown(el, ctx, !!frag);
    if (!frag) return md;
    return wrapClick(frag, md);
  }

  function blockMarkdown(el: El, ctx: Ctx, fragment: boolean): string {
    const name = el.name.toLowerCase();
    const isPlain = plain(el);
    const h = /^h([1-6])$/.exec(name);
    if (h && isPlain) return `${"#".repeat(Number(h[1]))} ${inline(childNodes(el), ctx).trim()}`;
    if (name === "p" && isPlain) return inline(childNodes(el), ctx).trim();
    if ((name === "ul" || name === "ol") && isPlain) return list(el, ctx, fragment);
    if (name === "pre") return codeBlock(el, ctx);
    if (name === "blockquote" && isPlain)
      return blocks(childNodes(el), ctx)
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
    if (name === "hr") return "<hr />";
    if (name === "table" && isPlain) {
      const t = table(el, ctx);
      if (t) return t;
    }
    return jsx(el, ctx);
  }

  /** The element kept as JSX, its children converted. */
  function jsx(el: El, ctx: Ctx, drop: string[] = []): string {
    const name = el.name.toLowerCase();
    const attrs = jsxAttrs(el, ctx, drop);
    const isVoid = VOID_ELEMENTS.has(name) || el.selfClosing;
    if (isVoid) return `<${name}${attrs} />`;
    if (name === "svg" || name === "math") {
      // vector art and MathML: kept as written, attributes respelt for JSX
      return `<${name}${attrs}>${svgInner(raw(el))}</${name}>`;
    }
    const nodes = childNodes(el);
    if (!nodes.some(isBlock)) {
      const inner = inline(nodes, ctx).trim();
      return `<${name}${attrs}>${inner}</${name}>`;
    }
    // children that are all JSX sit on lines of their own (a table's rows); Markdown needs the
    // blank lines around it to be read as Markdown inside JSX
    const onlyElements = nodes.every((n) => n.t === "el" || !n.s.trim());
    const parts = onlyElements
      ? nodes
          .filter((n): n is { t: "el"; el: El } => n.t === "el")
          .map((n) => block(n.el, ctx))
          .filter(Boolean)
      : [blocks(nodes, ctx)];
    const tight = onlyElements && parts.every((p) => p.startsWith("<") && !p.startsWith("<Click"));
    return tight
      ? `<${name}${attrs}>\n${parts.join("\n")}\n</${name}>`
      : `<${name}${attrs}>\n\n${parts.join("\n\n")}\n\n</${name}>`;
  }

  function svgInner(text: string): string {
    return text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(
        /<([A-Za-z][\w:-]*)((?:\s+[^>]*?)?)(\/?)>/g,
        (_, tag: string, attrs: string, slash: string) => {
          const fixed = attrs.replace(
            /([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
            (_m, n: string, eq: string, v: string) => {
              const lower = n.toLowerCase();
              if (lower === "style") {
                const obj = styleObject(v.slice(1, -1), 1);
                return `style={${JSON.stringify(obj)}}`;
              }
              const jn =
                JSX_ATTR[lower] ??
                (n.includes("-") && !/^(data|aria)-/.test(lower)
                  ? n.replace(/-(\w)/g, (__, c: string) => c.toUpperCase())
                  : n);
              return `${jn}${eq}${v}`;
            },
          );
          return `<${tag}${fixed}${slash}>`;
        },
      )
      .replace(/[{}]/g, (c) => `{"${c}"}`)
      .trim();
  }

  function list(el: El, ctx: Ctx, wrapped: boolean): string {
    const ordered = el.name.toLowerCase() === "ol";
    let n = Number(str(el, "start")) || 1;
    const items = el.children.filter((c) => c.name.toLowerCase() === "li");
    const fr = items.map((li) => fragmentOf(li, { ...ctx, rep: () => {} }));
    // every item a plain fragment, steps in document order: one <Clicks> around the list
    const clicks =
      !wrapped &&
      ctx.clicksLists &&
      items.length > 1 &&
      !ctx.steps &&
      fr.every((f) => f && !f.other.length && f.effect === fr[0]!.effect);
    const lines: string[] = [];
    for (const li of items) {
      const marker = ordered ? `${n++}.` : "-";
      const pad = " ".repeat(marker.length + 1);
      const nodes = childNodes(li);
      const parts: string[] = [];
      let run: Node[] = [];
      const flush = () => {
        const t = inline(run, ctx).trim();
        if (t) parts.push(t);
        run = [];
      };
      for (const node of nodes) {
        if (
          node.t === "el" &&
          ["ul", "ol"].includes(node.el.name.toLowerCase()) &&
          plain(node.el)
        ) {
          flush();
          parts.push(list(node.el, ctx, false));
        } else if (isBlock(node)) {
          flush();
          parts.push(block((node as { el: El }).el, ctx));
        } else run.push(node);
      }
      flush();
      const frag = clicks ? null : fragmentOf(li, ctx);
      if (frag && parts.length) parts[0] = wrapClick(frag, parts[0]!, true);
      if (!plain(li))
        ctx.rep({
          severity: "warning",
          what: `A list item's attributes (${li.attrs.map((a) => a.name).join(", ")}) are not carried over.`,
        });
      const text = parts.join("\n").split("\n");
      lines.push(`${marker} ${text[0] ?? ""}`, ...text.slice(1).map((l) => (l ? pad + l : l)));
    }
    const md = lines.join("\n");
    if (!clicks) return md;
    const effect = fr[0]!.effect && fr[0]!.effect !== "fade-in" ? ` effect="${fr[0]!.effect}"` : "";
    return `<Clicks${effect}>\n\n${md}\n\n</Clicks>`;
  }

  function codeBlock(pre: El, ctx: Ctx): string {
    const code = pre.children.find((c) => c.name.toLowerCase() === "code");
    const el = code ?? pre;
    const cls = classesOf(el);
    const lang =
      cls.map((c) => /^(?:language|lang)-(.+)$/.exec(c)?.[1]).find(Boolean) ??
      cls.find((c) => !["hljs", "fragment", "data-trim"].includes(c) && !EFFECTS.has(c)) ??
      "";
    const template = el.children.find(
      (c) => c.name.toLowerCase() === "script" && /text\/template/i.test(str(c, "type") ?? ""),
    );
    let text: string;
    const inner = raw(el);
    const tmpl = /<script[^>]*text\/template[^>]*>([\s\S]*?)<\/script\s*>/i.exec(inner);
    if (template || tmpl) text = (tmpl?.[1] ?? "").replace(/<\\\/script>/g, "</script>");
    else text = decodeEntities(inner.replace(/<[^>]+>/g, ""));
    text = dedent(text.replace(/^\s*\n/, "").replace(/\n\s*$/, ""));
    const meta: string[] = [];
    const ln = attrOf(el, "data-line-numbers");
    const opts: string[] = [];
    if (ln !== undefined) {
      const spec = typeof ln === "string" ? ln.trim() : "";
      if (spec) meta.push(`{${spec}}`);
      opts.push("lines:true");
      const start = str(el, "data-ln-start-from");
      if (start && /^\d+$/.test(start)) opts.push(`startLine:${start}`);
    }
    if (opts.length) meta.push(`{${opts.join(",")}}`);
    const fence = "`".repeat(
      Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)),
    );
    for (const a of el.attrs) {
      const n = a.name.toLowerCase();
      if (
        ["class", "data-line-numbers", "data-ln-start-from", "data-trim", "data-noescape"].includes(
          n,
        )
      )
        continue;
      ctx.rep({ severity: "info", what: `The code block's ${a.name} is not carried over.` });
    }
    if (fragmentOf(el, ctx))
      ctx.rep({
        severity: "warning",
        what: "A fragment on a <code> is dropped; the block shows from the start.",
      });
    return `${fence}${lang}${meta.length ? ` ${meta.join("")}` : ""}\n${text}\n${fence}`;
  }

  function table(el: El, ctx: Ctx): string | null {
    const rows: El[] = [];
    const visit = (e: El) => {
      for (const c of e.children) {
        const n = c.name.toLowerCase();
        if (n === "tr") rows.push(c);
        else if (["thead", "tbody", "tfoot"].includes(n)) visit(c);
      }
    };
    visit(el);
    if (!rows.length) return null;
    const cells = rows.map((r) => r.children.filter((c) => /^t[hd]$/i.test(c.name)));
    const width = Math.max(...cells.map((c) => c.length));
    for (const row of cells)
      for (const c of row) {
        if (c.attrs.some((a) => !/^(align|style)$/i.test(a.name))) return null;
        if (childNodes(c).some(isBlock)) return null;
      }
    const align = (c: El | undefined) => {
      const a = (
        str(c ?? el, "align") ??
        /text-align\s*:\s*(\w+)/.exec(str(c ?? el, "style") ?? "")?.[1] ??
        ""
      ).toLowerCase();
      return a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---";
    };
    const line = (row: El[]) =>
      `| ${Array.from({ length: width }, (_, i) => (row[i] ? inline(childNodes(row[i]!), ctx).trim().replace(/\|/g, "\\|") : "")).join(" | ")} |`;
    const out = [
      line(cells[0]!),
      `| ${Array.from({ length: width }, (_, i) => align(cells[0]![i])).join(" | ")} |`,
    ];
    for (const row of cells.slice(1)) out.push(line(row));
    return out.join("\n");
  }

  /** Inline nodes as one line of Markdown. */
  function inline(nodes: Node[], ctx: Ctx): string {
    let out = "";
    for (const node of nodes) {
      if (node.t === "text") {
        out += inlineText(node.s, ctx);
        continue;
      }
      const el = node.el;
      const name = el.name.toLowerCase();
      if (name === "aside" && classesOf(el).includes("notes")) {
        block(el, ctx);
        continue;
      }
      if (name === "script" || name === "style") continue;
      const frag = fragmentOf(el, ctx);
      let md: string;
      const isPlain = plain(el);
      const kids = () => inline(childNodes(el), ctx).trim();
      if (isBlock(node)) {
        out += block(el, ctx).replace(/\n+/g, " ");
        continue;
      } else if (name === "br") md = "<br />";
      else if ((name === "strong" || name === "b") && isPlain) md = wrapInline("**", kids());
      else if ((name === "em" || name === "i") && isPlain) md = wrapInline("_", kids());
      else if ((name === "del" || name === "s") && isPlain) md = wrapInline("~~", kids());
      else if (name === "code" && isPlain) {
        const text = decodeEntities(raw(el).replace(/<[^>]+>/g, ""));
        const ticks = "`".repeat(
          Math.max(1, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)),
        );
        md = ticks.length > 1 || text.startsWith("`") ? `${ticks} ${text} ${ticks}` : `\`${text}\``;
      } else if (name === "a" && isPlain && str(el, "href")) {
        const href = str(el, "href")!;
        const t = str(el, "title");
        md = `[${kids()}](${/[\s()]/.test(href) ? `<${href}>` : href}${t ? ` "${t.replace(/"/g, '\\"')}"` : ""})`;
      } else if (name === "img" && isPlain) {
        const src = asset(str(el, "src") ?? str(el, "data-src") ?? "", ctx.rep);
        md = `![${escapeMd(str(el, "alt") ?? "")}](${/[\s()]/.test(src) ? `<${src}>` : src})`;
      } else if (
        name === "span" &&
        frag &&
        el.attrs.every((a) => /^(class|data-fragment-index)$/i.test(a.name))
      )
        md = kids();
      else md = jsx(el, ctx, frag ? ["class"] : []);
      out += frag ? wrapClick(frag, md, true) : md;
    }
    return out.replace(/[ \t]*\n[ \t]*/g, " ").replace(/ {2,}/g, " ");
  }

  function inlineText(text: string, ctx: Ctx): string {
    const t = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
    // reveal's maths plugin: \( … \) inline and \[ … \] display become Kadal's $ … $ and $$ … $$
    let out = "";
    let at = 0;
    for (const m of t.matchAll(/\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g)) {
      out += escapeMd(decodeEntities(t.slice(at, m.index!)).replace(/\s+/g, " "));
      const tex = decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim();
      out += m[1] !== undefined ? `$${tex}$` : `$$${tex}$$`;
      at = m.index! + m[0].length;
    }
    void ctx;
    return out + escapeMd(decodeEntities(t.slice(at)).replace(/\s+/g, " "));
  }

  // ── data-markdown sections ─────────────────────────────────────────────────────────────
  function markdownSection(sec: El, inStack: boolean): Slide[] {
    const line = lineOf(sec.start);
    const external = str(sec, "data-markdown");
    let text: string | null = null;
    let separator: string | null = str(sec, "data-separator") ?? null;
    const vertical = str(sec, "data-separator-vertical") ?? null;
    const notesSep = str(sec, "data-separator-notes") ?? "^\\s*notes?:";
    const rep0 = slideReport(slides.length + 1, line);
    if (external) {
      const path = posix.join(base, external);
      text = path ? read(path) : null;
      if (text === null) {
        rep0({
          severity: "error",
          what: `The Markdown file ${external} was not found; the slide is left empty.`,
        });
        text = "";
      }
      separator ??= "\\r?\\n---\\r?\\n";
    } else {
      const ta = /\uE002T(\d+)\uE002/.exec(raw(sec));
      const tmpl = /<script[^>]*text\/template[^>]*>([\s\S]*?)<\/script\s*>/i.exec(raw(sec));
      text = ta ? templates[Number(ta[1])]! : tmpl ? tmpl[1]! : decodeEntities(raw(sec));
      text = text.replace(/<\\\/script>/g, "</script>");
      text = dedent(text.replace(/^\n/, ""));
    }
    const sectionFm = sectionFrontmatter(
      sec.attrs.map((a) => ({
        name: a.name,
        value: typeof a.value === "string" ? decodeEntities(a.value) : a.value,
      })),
      rep0,
    );
    // reveal.js's slidify: one regex for both separators, the horizontal one tested per match
    const pieces: Array<{ text: string; vertical: boolean }> = [];
    if (separator || vertical) {
      const re = new RegExp([separator, vertical].filter(Boolean).join("|"), "mg");
      const horizontal = separator ? new RegExp(separator) : null;
      let last = 0;
      let nextVertical = false;
      for (const m of text.matchAll(re)) {
        if (m[0] === "") continue;
        pieces.push({ text: text.slice(last, m.index), vertical: nextVertical });
        nextVertical = !(horizontal && horizontal.test(m[0]));
        last = m.index! + m[0].length;
      }
      pieces.push({ text: text.slice(last), vertical: nextVertical });
    } else pieces.push({ text, vertical: false });

    return pieces.map((p, i) => {
      const n = slides.length + 1 + i;
      const rep = slideReport(n, line);
      const [content, ...noteParts] = p.text.split(new RegExp(notesSep, "mgi"));
      const { body, fm } = convertMarkdown(content ?? "", rep);
      return {
        fm: i === 0 ? { ...sectionFm, ...fm } : fm,
        body,
        notes: noteParts.length ? [noteParts.join("\n").trim()] : [],
        vertical: i === 0 ? inStack : p.vertical || inStack,
        line,
      };
    });
  }

  /** Reveal-flavoured Markdown → Kadal's: `.slide`/`.element` comments read, code meta respelt. */
  function convertMarkdown(md: string, rep: Reporter): { body: string; fm: Frontmatter } {
    let fm: Frontmatter = {};
    let text = md.replace(/<!--\s*\.slide:\s*([\s\S]*?)-->/g, (_, attrs: string) => {
      const tag = parseOpenTag(`<x ${attrs.trim()}>`, 0);
      if (tag)
        fm = {
          ...fm,
          ...sectionFrontmatter(
            tag.attrs.map((a) => ({
              name: a.name,
              value: typeof a.value === "string" ? decodeEntities(a.value) : a.value,
            })),
            rep,
          ),
        };
      return "";
    });
    // fences: ```js [1|2-3] (reveal) → ```js {1|2-3}{lines:true} (Kadal; [x] is a title here)
    text = text.replace(
      /^(\s*)(`{3,}|~{3,})([\w+#-]*)[ \t]*\[([^\]\n]*)\][ \t]*$/gm,
      (_, ind: string, f: string, lang: string, spec: string) => {
        const m = /^\s*(\d+)\s*:\s*(.*)$/.exec(spec);
        const steps = (m ? m[2]! : spec).trim();
        const opts = ["lines:true", ...(m ? [`startLine:${m[1]}`] : [])];
        return `${ind}${f}${lang} ${steps ? `{${steps}}` : ""}{${opts.join(",")}}`;
      },
    );
    // `.element` comments: on a line after its content, or alone on the line after it
    const lines = text.split("\n");
    const stepsOf: Array<{ line: number; index: number | null }> = [];
    const ELEMENT = /[ \t]*<!--\s*\.element:\s*([\s\S]*?)-->[ \t]*$/;
    const marks: Array<{ line: number; attrs: Array<{ name: string; value: string | true }> }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = ELEMENT.exec(lines[i]!);
      if (!m) continue;
      lines[i] = lines[i]!.slice(0, m.index);
      let target = i;
      if (!lines[i]!.trim()) {
        target = i - 1;
        while (target >= 0 && !lines[target]!.trim()) target--;
      }
      const tag = parseOpenTag(`<x ${m[1]!.trim()}>`, 0);
      if (target < 0 || !tag) continue;
      marks.push({
        line: target,
        attrs: tag.attrs.map((a) => ({
          name: a.name,
          value: typeof a.value === "string" ? decodeEntities(a.value) : a.value,
        })),
      });
    }
    for (const m of marks) {
      const idx = m.attrs.find((a) => a.name === "data-fragment-index")?.value;
      stepsOf.push({
        line: m.line,
        index: typeof idx === "string" && Number.isFinite(Number(idx)) ? Number(idx) : null,
      });
    }
    const explicit = stepsOf.some((s) => s.index !== null);
    const stepAt = new Map<number, number>();
    if (explicit) {
      const idx = [...new Set(stepsOf.filter((s) => s.index !== null).map((s) => s.index!))].sort(
        (a, b) => a - b,
      );
      for (const s of stepsOf) if (s.index !== null) stepAt.set(s.line, idx.indexOf(s.index) + 1);
      let next = idx.length;
      for (const s of stepsOf) if (s.index === null) stepAt.set(s.line, ++next);
    }
    for (const m of marks) {
      const cls = String(m.attrs.find((a) => a.name === "class")?.value ?? "")
        .split(/\s+/)
        .filter(Boolean);
      const isFrag = cls.includes("fragment");
      const effect = cls.find((c) => EFFECTS.has(c));
      const other = cls.filter((c) => c !== "fragment" && !EFFECTS.has(c));
      const rest = m.attrs.filter((a) => !["class", "data-fragment-index"].includes(a.name));
      if (rest.length)
        rep({
          severity: "warning",
          what: `An .element comment's ${rest.map((a) => a.name).join(", ")} is not carried over.`,
        });
      const lineText = lines[m.line]!;
      const prefix = /^(\s*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]*)?)/.exec(
        lineText,
      )![1]!;
      const content = lineText.slice(prefix.length).trimEnd();
      if (!content) continue;
      if (isFrag) {
        const props = [
          ...(stepAt.has(m.line) ? [`at={${stepAt.get(m.line)}}`] : []),
          ...(effect && effect !== "fade-in" ? [`effect="${effect}"`] : []),
          ...(other.length ? [`className="${other.join(" ")}"`] : []),
        ];
        lines[m.line] =
          `${prefix}<Click as="span"${props.length ? ` ${props.join(" ")}` : ""}>${content}</Click>`;
      } else if (other.length)
        lines[m.line] = `${prefix}<span className="${other.join(" ")}">${content}</span>`;
    }
    text = lines.join("\n");
    return { body: mdxSafe(dedent(text).trim(), rep), fm };
  }

  /** Markdown with raw HTML in it, made MDX-safe: braces escaped, tags respelt for JSX. */
  function mdxSafe(text: string, rep: Reporter): string {
    const scan = scanSlide(text);
    const tags: Array<{ start: number; end: number; text: string }> = [];
    const visit = (el: El) => {
      for (const c of el.children) {
        const t = parseOpenTag(text, c.start);
        if (t && !/^[a-z]/.test(c.name))
          tags.push({ start: c.start, end: t.end, text: text.slice(c.start, t.end) });
        else if (t) {
          const attrs = t.attrs
            .filter((a) => {
              if (/^on/i.test(a.name)) {
                rep({
                  severity: "warning",
                  what: `The ${a.name} handler on <${c.name}> is dropped: nothing in the page is run.`,
                });
                return false;
              }
              return true;
            })
            .map((a) => {
              const n = a.name.toLowerCase();
              if (a.value === true) return JSX_ATTR[n] ?? a.name;
              const v = decodeEntities(a.value);
              if (n === "style") return `style={${JSON.stringify(styleObject(v, scale))}}`;
              const name = JSX_ATTR[n] ?? a.name;
              const value = name === "src" || name === "poster" ? asset(v, rep) : v;
              return /["\\{}\n]/.test(value)
                ? `${name}={${JSON.stringify(value)}}`
                : `${name}="${value}"`;
            });
          const selfClose = t.selfClosing || VOID_ELEMENTS.has(c.name);
          tags.push({
            start: c.start,
            end: t.end,
            text: `<${c.name}${attrs.length ? ` ${attrs.join(" ")}` : ""}${selfClose ? " /" : ""}>`,
          });
        }
        visit(c);
      }
    };
    visit(scan.root);
    const keep = [
      ...scan.spans.map((s) => ({ start: s.start, end: s.end, text: text.slice(s.start, s.end) })),
      ...tags,
    ].sort((a, b) => a.start - b.start);
    let out = "";
    let at = 0;
    for (const k of keep) {
      if (k.start < at) continue;
      out += text.slice(at, k.start).replace(/[{}]/g, (c) => `\\${c}`);
      out += k.text;
      at = k.end;
    }
    return out + text.slice(at).replace(/[{}]/g, (c) => `\\${c}`);
  }

  // ── assemble ───────────────────────────────────────────────────────────────────────────
  const titles = slides.map((s) => {
    if (typeof s.fm.title === "string") return s.fm.title;
    const m = /^#{1,6}[ \t]+(.+)$/m.exec(s.body) ?? /<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/.exec(s.body);
    return m
      ? m[1]!
          .replace(/<[^>]+>/g, "")
          .replace(/[*_`\\]/g, "")
          .trim()
      : "";
  });
  if (!slides.length)
    slides.push({ fm: {}, body: "# Imported deck", notes: [], vertical: false, line: 1 });
  const out = slides.map((s, i) => {
    let fm = s.fm;
    if (i === 0) {
      // the headmatter is also the first slide's frontmatter: on a clash the deck's value wins
      for (const k of Object.keys(s.fm))
        if (k in head && head[k] !== s.fm[k])
          slideReport(
            1,
            s.line,
          )({
            // the way into the first slide is never seen
            severity: /transition/i.test(k) ? "info" : "warning",
            what: `The first slide's ${k} (${JSON.stringify(s.fm[k])}) is also the deck's headmatter key; the deck's ${JSON.stringify(head[k])} is kept.`,
            suggestion:
              "Give the first slide its own look with a class, or move it after a title slide.",
          });
      fm = { ...s.fm, ...head };
    }
    const yaml = Object.keys(fm).length ? YAML.stringify(fm, { lineWidth: 0 }).trimEnd() : "";
    const sep =
      i === 0
        ? yaml
          ? `---\n${yaml}\n---`
          : ""
        : s.vertical
          ? yaml
            ? `----\n${yaml}\n---`
            : "----"
          : yaml
            ? `---\n${yaml}\n---`
            : "---";
    const notes = s.notes
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => `<Notes>\n\n${mdxSafe(n, () => {})}\n\n</Notes>`);
    const body = [s.body.trim() || mdxComment("reveal: an empty slide"), ...notes].join("\n\n");
    return `${sep}${sep ? "\n\n" : ""}${body}`.trimEnd();
  });
  const mdx = `${out.join("\n\n")}\n`;

  const report = sortReport(items);
  const noisy = new Set(
    report.filter((r) => r.slide !== null && r.severity !== "info").map((r) => r.slide),
  );
  return {
    mdx,
    files,
    report,
    info: {
      title,
      theme: { reveal: revealTheme, kadal: "minimal", colorScheme },
      canvas: { width: KADAL_WIDTH, height: KADAL_HEIGHT, scale },
      assets: [...assets]
        .map(([from, to]) => ({ from, to }))
        .sort((a, b) => a.from.localeCompare(b.from)),
      styleImports,
      titles,
      slides: slides.length,
      cleanSlides: slides.length - noisy.size,
    },
  };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function hasAncestor(el: El, test: (e: El) => boolean): boolean {
  for (let p = el.parent; p; p = p.parent) if (test(p)) return true;
  return false;
}

function hasAncestorClass(el: El, cls: string, classesOf: (e: El) => string[]): boolean {
  return hasAncestor(el, (p) => p.name !== "#root" && classesOf(p).includes(cls));
}

/** Common leading whitespace removed (the way reveal.js reads an indented template). */
export function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const n = indents.length ? Math.min(...indents) : 0;
  return n ? lines.map((l) => l.slice(Math.min(n, /^[ \t]*/.exec(l)![0].length))).join("\n") : text;
}

/** Text as Markdown that reads as that text (and MDX that reads no expressions or tags). */
function escapeMd(text: string): string {
  return text
    .replace(/[\\`*[\]{}<>$|]/g, (c) => `\\${c}`)
    .replace(/(^|[^\w])_|_(?=[^\w]|$)/g, (m) => m.replace("_", "\\_"))
    .replace(/^(\s*)([#+-]|\d+\.)(?=\s)/, "$1\\$2");
}

function wrapInline(mark: string, inner: string): string {
  if (!inner) return "";
  // `** bold**` is not bold: the marks hug the text, and the spaces move outside
  const lead = /^\s*/.exec(inner)![0];
  const trail = /\s*$/.exec(inner)![0];
  return `${lead}${mark}${inner.trim()}${mark}${trail}`;
}

/** data-background="…": a colour, a gradient, a video or an image, as reveal.js guesses. */
function backgroundShorthand(v: string): Frontmatter {
  if (/gradient\(/.test(v)) return { backgroundGradient: v };
  if (/^(#|rgba?\(|hsla?\(|[a-z]+$)/i.test(v.trim())) return { backgroundColor: v };
  if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(v)) return { backgroundVideo: v };
  return { backgroundImage: v };
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  navy: "#000080",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  teal: "#008080",
  maroon: "#800000",
  pink: "#ffc0cb",
  aquamarine: "#7fffd4",
  indigo: "#4b0082",
  darkblue: "#00008b",
  darkgreen: "#006400",
  darkred: "#8b0000",
  lightblue: "#add8e6",
  lightgray: "#d3d3d3",
  silver: "#c0c0c0",
  gold: "#ffd700",
  coral: "#ff7f50",
  tomato: "#ff6347",
};

/** Relative luminance (0–1) of a CSS colour, or null when it is not a plain one. */
export function luminance(color: string): number | null {
  let c = color.trim().toLowerCase();
  c = NAMED[c] ?? c;
  let rgb: number[] | null = null;
  const hex = /^#([0-9a-f]{3,8})$/.exec(c);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4)
      h = h
        .slice(0, 3)
        .split("")
        .map((x) => x + x)
        .join("");
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (fn) rgb = [fn[1], fn[2], fn[3]].map(Number);
  if (!rgb || rgb.some((x) => !Number.isFinite(x))) return null;
  const [r, g, b] = rgb.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The literal options of `Reveal.initialize({ … })` (or `new Reveal({ … })`): booleans, numbers
 * and strings, by key. Anything else (plugins, functions) is named in `skipped`. The page's
 * script is read as text; nothing is evaluated.
 */
export function revealConfig(html: string): {
  found: boolean;
  values: Record<string, unknown>;
  skipped: string[];
} {
  const m = /(?:\b[\w$]+\s*\.\s*initialize|new\s+Reveal)\s*\(\s*\{/.exec(html);
  if (!m) return { found: false, values: {}, skipped: [] };
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  let quote: string | null = null;
  for (; i < html.length && depth > 0; i++) {
    const ch = html[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "/" && html[i + 1] === "/") {
      const nl = html.indexOf("\n", i);
      i = nl < 0 ? html.length : nl;
    } else if ("{[(".includes(ch)) depth++;
    else if ("}])".includes(ch)) depth--;
  }
  // the body without its comments (a comment's comma must not split an option)
  let body = "";
  {
    const text = html.slice(start, i - 1);
    let q: string | null = null;
    for (let j = 0; j < text.length; j++) {
      const ch = text[j]!;
      if (q) {
        body += ch;
        if (ch === "\\") body += text[++j] ?? "";
        else if (ch === q) q = null;
      } else if (ch === "/" && text[j + 1] === "/") {
        const nl = text.indexOf("\n", j);
        j = nl < 0 ? text.length : nl - 1;
      } else if (ch === "/" && text[j + 1] === "*") {
        const end = text.indexOf("*/", j + 2);
        j = end < 0 ? text.length : end + 1;
      } else {
        if (ch === '"' || ch === "'" || ch === "`") q = ch;
        body += ch;
      }
    }
  }
  // split the top level on commas
  const parts: string[] = [];
  let d = 0;
  let q: string | null = null;
  let from = 0;
  for (let j = 0; j < body.length; j++) {
    const ch = body[j]!;
    if (q) {
      if (ch === "\\") j++;
      else if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") q = ch;
    else if ("{[(".includes(ch)) d++;
    else if ("}])".includes(ch)) d--;
    else if (ch === "," && d === 0) {
      parts.push(body.slice(from, j));
      from = j + 1;
    }
  }
  parts.push(body.slice(from));
  const values: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const kv = /^['"]?([A-Za-z_$][\w$]*)['"]?\s*:\s*([\s\S]+)$/.exec(p);
    if (!kv) continue;
    const [, key, v] = kv as unknown as [string, string, string];
    const value = v.trim();
    if (value === "true" || value === "false") values[key] = value === "true";
    else if (/^-?\d+(\.\d+)?$/.test(value)) values[key] = Number(value);
    else if (/^(['"])[^'"]*\1$/.test(value)) values[key] = value.slice(1, -1);
    else if (value === "null") values[key] = null;
    else skipped.push(key);
  }
  return { found: true, values, skipped };
}
