import { THEME_PACKAGES } from "../catalog/reference.ts";
import { GENERATED } from "../catalog/generated.ts";
import type { Reporter } from "./report.ts";
import { scalePos } from "./markup.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SLIDEV'S HEADMATTER AND FRONTMATTER, IN KADAL'S KEYS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Most keys are the same word in both (title, info, author, fonts, themeConfig, download,
 * lineNumbers, duration, timer, seoMeta, notesAutoRuby, defaults, layout, class, clicks, hide,
 * routeAlias, zoom…). The rest map, move somewhere else, or are reported:
 *
 *   theme: seriph              → theme: seriph + @kadal/theme-seriph in package.json (the ported
 *                                themes: default→classic, seriph, apple-basic→crisp, bricks,
 *                                shibainu); any other theme → minimal, reported by name
 *   colorSchema                → colorScheme
 *   aspectRatio / canvasWidth  → the stage's height at 1920 wide, and the scale every length and
 *                                position in the deck is multiplied by
 *   drawings.persist: true     → drawings.persist: "files" (Kadal's `true` is browser storage)
 *   transition                 → planned deck-wide in slidev.ts (Slidev's transition is the way
 *                                OUT of a slide, Kadal's the way IN)
 *   exportFilename, export     → flags on package.json's export script
 *   favicon, htmlAttrs         → index.html
 *   clickAnimation, layoutClass, dragPos → used by the converter (dragPos positions scaled)
 *   highlighter, css, routerMode, monaco*, record, remote, pwa… → Kadal does these its own way
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ThemeChoice {
  /** What `theme:` says in the converted deck. */
  kadal: string;
  /** The npm package that carries it, or null for a built-in. */
  package: string | null;
  /** The Slidev theme it came from. */
  slidev: string;
  /** Layouts and components the Kadal theme adds. */
  layouts: string[];
  components: string[];
}

/** Slidev's theme name (`seriph`, `@slidev/theme-seriph`, `slidev-theme-seriph`) → Kadal's. */
export function mapTheme(raw: unknown, report: Reporter): ThemeChoice {
  const name = typeof raw === "string" && raw.trim() ? raw.trim() : "default";
  const short = name.replace(/^@slidev\/theme-/, "").replace(/^slidev-theme-/, "");
  const port = THEME_PACKAGES.find((t) => t.slidev === short);
  if (port)
    return {
      kadal: port.name,
      package: port.package,
      slidev: name,
      layouts: port.layouts,
      components: port.components,
    };
  if (short === "none")
    return { kadal: "none", package: null, slidev: name, layouts: [], components: [] };
  report({
    severity: "warning",
    what: /^[./]/.test(name)
      ? `The local theme ${name} is Vue code; the deck uses Kadal's minimal theme instead.`
      : `The Slidev theme "${name}" has no Kadal port; the deck uses Kadal's minimal theme instead.`,
    suggestion:
      "Pick a Kadal theme (`kadal-deck info themes`), or make one with `kadal-deck new --theme`.",
  });
  return { kadal: "minimal", package: null, slidev: name, layouts: [], components: [] };
}

/** Slidev's addons → what Kadal has instead. */
const ADDONS: Record<string, string> = {
  qrcode: "Kadal draws QR codes with the built-in <Qr value> component.",
  excalidraw: "Kadal draws Excalidraw diagrams with the built-in <Sketch> component.",
  "python-runner": "Kadal runs Python in ```py {monaco-run} blocks (Pyodide) out of the box.",
  "fancy-arrow": "Kadal's <Arrow> and <DragArrow> draw arrows.",
  rabbit: "Kadal's progress bar shows where the talk is.",
  naive: "Kadal has no Naive UI components; write them in src/components.tsx.",
};

export interface Canvas {
  width: number;
  height: number;
  /** Kadal stage ÷ Slidev canvas: what every length is multiplied by. */
  scale: number;
}

function parseRatio(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v;
  if (typeof v !== "string") return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(v);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(v);
  return n > 0 ? n : null;
}

export function canvasOf(head: Record<string, unknown>): Canvas {
  const ratio = parseRatio(head.aspectRatio) ?? 16 / 9;
  const canvasWidth =
    typeof head.canvasWidth === "number" && head.canvasWidth > 0 ? head.canvasWidth : 980;
  return { width: 1920, height: Math.round(1920 / ratio), scale: 1920 / canvasWidth };
}

export interface DeckSettings {
  /** Kadal headmatter keys (deck-wide). */
  deck: Record<string, unknown>;
  theme: ThemeChoice;
  canvas: Canvas;
  /** Flags for `kadal-deck export` in the generated package.json. */
  exportArgs: string[];
  favicon: string | null;
  htmlLang: string | null;
  /** Slidev's default click presets (`clickAnimation: fade right`). */
  clickAnimation: string[];
  /** The deck's default transition, Slidev's name. */
  transition: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Kadal's deck keys, from the catalog: what passes through untouched when Slidev spells it the same. */
const DECK_KEYS = new Set(GENERATED.deckConfig.map((f) => f.name));

/** Headmatter keys Slidev has and Kadal does its own way: dropped, with a line when it matters. */
const DROPPED: Record<string, (v: unknown) => string | null> = {
  highlighter: (v) =>
    v === "shiki" ? null : `highlighter: ${v} — Kadal always highlights with Shiki.`,
  css: (v) =>
    v === "unocss"
      ? null
      : `css: ${v} — Kadal's deck uses plain CSS (and Tailwind in the starter).`,
  routerMode: () => null,
  twoslash: (v) =>
    v === false ? "twoslash: false — Kadal runs TwoSlash only on fences marked `twoslash`." : null,
  codeCopy: (v) =>
    v === false ? "codeCopy: false has no Kadal setting; the copy button stays." : null,
  magicMoveCopy: () => null,
  remoteAssets: (v) =>
    v
      ? "remoteAssets — Kadal loads remote images from their hosts; download them into public/ to ship them."
      : null,
  record: () => null,
  remote: (v) =>
    v
      ? "remote — Kadal's phone remote pairs from the presenter view (a room, `kadal-deck dev --host`, or a static build with `remote: { relay }` and `kadal-deck relay`)."
      : null,
  presenter: (v) =>
    v === false
      ? "presenter: false has no Kadal setting; the presenter view stays at /presenter."
      : null,
  browserExporter: () => null,
  editor: () => null,
  mcp: () => null,
  pwa: (v) => (v ? "pwa has no Kadal setting." : null),
  monaco: (v) =>
    v === false
      ? "monaco: false has no Kadal setting; {monaco} blocks load the editor lazily."
      : null,
  monacoRunAdditionalDeps: () => null,
  monacoRunUseStrict: () => null,
  preloadImages: () => null,
  shiki: () => "shiki — set Shiki options in vite.config.ts: deck({ shiki: { … } }).",
  titleTemplate: (v) =>
    v === "%s - Slidev" ? null : `titleTemplate: ${v} — Kadal's page title is the deck's title.`,
};

export function mapHeadmatter(head: Record<string, unknown>, report: Reporter): DeckSettings {
  const src = { ...(isObject(head.config) ? head.config : {}), ...head };
  delete src.config;
  const deck: Record<string, unknown> = {};
  const theme = mapTheme(src.theme, report);
  const canvas = canvasOf(src);
  const exportArgs: string[] = [];
  let favicon: string | null = null;
  let htmlLang: string | null = null;
  let clickAnimation: string[] = [];
  let transition: string | null = null;
  // Slidev's default theme is `default`, so a deck that names none still gets its port
  deck.theme = theme.kadal;
  for (const [key, value] of Object.entries(src)) {
    switch (key) {
      case "theme":
        deck.theme = theme.kadal;
        break;
      case "colorSchema":
        if (value === "light" || value === "dark" || value === "auto") deck.colorScheme = value;
        break;
      case "aspectRatio":
      case "canvasWidth":
        if (canvas.height !== 1080) {
          deck.width = canvas.width;
          deck.height = canvas.height;
        }
        break;
      case "drawings":
        if (isObject(value)) {
          const d: Record<string, unknown> = {};
          if ("enabled" in value) d.enabled = value.enabled;
          if ("persist" in value) d.persist = value.persist === true ? "files" : value.persist;
          if ("presenterOnly" in value) d.presenterOnly = value.presenterOnly;
          if ("syncAll" in value) d.syncAll = value.syncAll;
          deck.drawings = d;
        }
        break;
      case "info":
        if (typeof value === "string") deck.info = value;
        break;
      // Comark (MDC before it was renamed) is read natively: compiler/remark-comark.ts.
      case "comark":
      case "mdc":
        if (value === true) deck.comark = true;
        break;
      case "addons":
        for (const a of Array.isArray(value) ? value : []) {
          const short = String(a)
            .replace(/^slidev-addon-/, "")
            .replace(/^@[^/]+\/slidev-addon-/, "");
          report({
            severity: ADDONS[short] ? "info" : "warning",
            what: `The Slidev addon ${a} is Vue code and is not carried over. ${ADDONS[short] ?? ""}`.trim(),
            ...(ADDONS[short]
              ? {}
              : {
                  suggestion:
                    "Look for a Kadal addon (`kadal-deck info themes`) or write its components in src/components.tsx.",
                }),
          });
        }
        break;
      case "exportFilename":
        if (typeof value === "string" && value) exportArgs.push("--output", value);
        break;
      case "export":
        if (isObject(value)) {
          if (typeof value.format === "string")
            exportArgs.push("--format", value.format === "pptx" ? "pptx" : value.format);
          if (value.dark === true) exportArgs.push("--dark");
          if (value.withClicks === false) exportArgs.push("--no-with-clicks");
          if (value.withClicks === true) exportArgs.push("--with-clicks");
          if (value.withToc === false) exportArgs.push("--no-with-toc");
          if (typeof value.timeout === "number")
            exportArgs.push("--timeout", String(value.timeout));
          if (typeof value.wait === "number") exportArgs.push("--wait", String(value.wait));
        }
        break;
      case "favicon":
        if (typeof value === "string") favicon = value;
        break;
      case "htmlAttrs":
        if (isObject(value)) {
          if (typeof value.lang === "string") htmlLang = value.lang;
          if (value.dir === "rtl") deck.rtl = true;
          const rest = Object.keys(value).filter((k) => k !== "lang" && k !== "dir");
          if (rest.length)
            report({
              severity: "info",
              what: `htmlAttrs ${rest.join(", ")} — set them on <html> in index.html.`,
            });
        }
        break;
      case "clickAnimation":
        clickAnimation = String(value ?? "")
          .split(/[\s.]+/)
          .filter(Boolean);
        break;
      case "transition":
        transition = transitionName(value);
        break;
      case "wakeLock":
        deck.wakeLock = value !== false;
        break;
      case "contextMenu":
        if (value !== null && value !== undefined) deck.contextMenu = value;
        break;
      case "defaults":
        if (isObject(value)) deck.defaults = value;
        break;
      case "fonts":
      case "title":
      case "author":
      case "download":
      case "lineNumbers":
      case "selectable":
      case "themeConfig":
      case "plantUmlServer":
      case "seoMeta":
      case "notesAutoRuby":
      case "duration":
      case "timer":
      case "magicMoveDuration":
        deck[key] = value;
        break;
      // Monaco's types: Slidev's `local` is the deck's installed packages, which Kadal's `auto`
      // uses first (then the CDN, where the build has none); `ata`/`cdn` and `none` are the same.
      case "monacoTypesSource":
        deck.monacoTypes =
          value === "cdn" || value === "ata" ? "cdn" : value === "none" ? "none" : "auto";
        break;
      case "monacoTypesAdditionalPackages":
        if (Array.isArray(value)) deck.monacoPackages = value;
        break;
      case "monacoTypesIgnorePackages":
        if (Array.isArray(value)) deck.monacoTypesIgnore = value;
        break;
      default:
        if (key in DROPPED) {
          const why = DROPPED[key]!(value);
          if (why) report({ severity: "info", what: why });
        } else if (DECK_KEYS.has(key)) deck[key] = value;
      // anything else is a slide key (layout, class, background…) or the deck's own data: the
      // caller keeps it on the first slide
    }
  }
  return { deck, theme, canvas, exportArgs, favicon, htmlLang, clickAnimation, transition };
}

/** Headmatter keys `mapHeadmatter` consumes (the rest are the first slide's). */
export const HEAD_ONLY = new Set([
  "theme",
  "colorSchema",
  "aspectRatio",
  "canvasWidth",
  "drawings",
  "info",
  "addons",
  "exportFilename",
  "export",
  "favicon",
  "htmlAttrs",
  "clickAnimation",
  "transition",
  "wakeLock",
  "contextMenu",
  "defaults",
  "fonts",
  "title",
  "author",
  "download",
  "lineNumbers",
  "selectable",
  "themeConfig",
  "plantUmlServer",
  "seoMeta",
  "notesAutoRuby",
  "duration",
  "timer",
  "magicMoveDuration",
  "config",
  // translated above (comark, monacoTypes, monacoPackages, monacoTypesIgnore): not copied as well
  "mdc",
  "monacoTypesSource",
  "monacoTypesAdditionalPackages",
  "monacoTypesIgnorePackages",
  ...Object.keys(DROPPED),
  ...GENERATED.deckConfig.map((f) => f.name),
]);

/** `slide-left`, `{ name: 'fade' }` → the transition's name. */
export function transitionName(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (isObject(v) && typeof v.name === "string") return v.name;
  return null;
}

export interface SlideSettings {
  frontmatter: Record<string, unknown>;
  /** Slidev's `layoutClass`: classes for the layout's own element (written as slide CSS). */
  layoutClass: string | null;
  transition: string | null;
  clickAnimation: string[] | null;
  dragNames: Set<string>;
}

export interface SlideMapContext {
  report: Reporter;
  scale: number;
  /** Layouts the converted deck has besides Kadal's: its theme's and its converted ones. */
  layouts: Set<string>;
  /** `src:` paths, rewritten: `./pages/a.md` → `./pages/a.mdx`. */
  rewriteSrc: (src: string) => string;
}

export function mapSlideFrontmatter(
  fm: Record<string, unknown>,
  ctx: SlideMapContext,
): SlideSettings {
  const out: Record<string, unknown> = {};
  let layoutClass: string | null = null;
  let transition: string | null = null;
  let clickAnimation: string[] | null = null;
  const dragNames = new Set<string>();
  for (const [key, value] of Object.entries(fm)) {
    switch (key) {
      case "layout": {
        const name = String(value);
        if (GENERATED.layouts.includes(name) || ctx.layouts.has(name)) out.layout = name;
        else {
          ctx.report({
            severity: "warning",
            what: `The layout "${name}" is neither Kadal's nor the theme's; the slide uses the default layout.`,
            suggestion: "Add it as `layout:" + name + "` in src/components.tsx.",
          });
        }
        break;
      }
      case "layoutClass":
        layoutClass = String(value ?? "") || null;
        break;
      case "transition":
        transition = transitionName(value);
        break;
      case "clickAnimation":
        clickAnimation = String(value ?? "")
          .split(/[\s.]+/)
          .filter(Boolean);
        break;
      case "dragPos":
        if (isObject(value)) {
          const scaled: Record<string, string> = {};
          for (const [n, p] of Object.entries(value)) {
            dragNames.add(n);
            scaled[n] = scalePos(String(p), ctx.scale);
          }
          out.dragPos = scaled;
        }
        break;
      case "src":
        out.src = ctx.rewriteSrc(String(value));
        break;
      case "name":
        if (!("title" in fm)) out.title = value;
        break;
      case "preload":
        if (value === false) out.preload = false;
        break;
      default:
        // the slide's own data (`foo: bar`): kept, for layouts and components that read it
        out[key] = value;
    }
  }
  return { frontmatter: out, layoutClass, transition, clickAnimation, dragNames };
}

/* ── transitions ─────────────────────────────────────────────────────────── */

/**
 * Slidev's built-in transitions, as the keyframes Kadal's stage plays for the slide arriving and
 * the one leaving (core/transitions.ts; `deck-*` are base.css's, `slidev-*` are written into the
 * deck's src/slidev.css).
 */
const HALVES: Record<string, { in: string; out: string }> = {
  "slide-left": { in: "deck-slide-in-right", out: "deck-slide-out-left" },
  "slide-right": { in: "deck-slide-in-left", out: "deck-slide-out-right" },
  "slide-up": { in: "deck-slide-in-bottom", out: "deck-slide-out-top" },
  "slide-down": { in: "deck-slide-in-top", out: "deck-slide-out-bottom" },
  fade: { in: "deck-fade-in", out: "deck-fade-out" },
  "fade-out": { in: "slidev-fade-out-in", out: "slidev-fade-out-out" },
  none: { in: "none", out: "none" },
};
const REVERSE: Record<string, string> = {
  "slide-left": "slide-right",
  "slide-right": "slide-left",
  "slide-up": "slide-down",
  "slide-down": "slide-up",
};
/** A deck that uses one of these everywhere needs no definitions: Kadal's own is the same. */
const SAME: Record<string, string> = {
  "slide-left": "slide",
  fade: "fade",
  none: "none",
  "view-transition": "view-transition",
};

/** `slide-left | slide-right` → the forward and backward halves' names. */
function directions(t: string): { fwd: string; back: string } {
  if (t.includes("|")) {
    const [f, b] = t.split("|").map((x) => x.trim());
    return { fwd: f || "none", back: b || "none" };
  }
  return { fwd: t, back: REVERSE[t] ?? t };
}

export interface TransitionPlan {
  /** The headmatter's `transition`, and `transitions` definitions. */
  deck: string | null;
  definitions: Record<string, { in: string; out: string; back: { in: string; out: string } }>;
  /** Per slide (index into the list given): its own `transition`, when it differs from `deck`. */
  perSlide: Array<string | null>;
  /** True when the slidev-fade-out keyframes are needed. */
  fadeOut: boolean;
}

/**
 * Slidev plays a slide's `transition` on the way OUT of it (forward) and on the way back INTO it;
 * Kadal plays a slide's on the way in (its arriving half) and on the way out (its leaving half).
 * So the transition between slides N and N+1 — Slidev's slide N's — becomes, for each Kadal slide,
 * a named definition of four halves: forward in from the slide before's, forward out from its own,
 * and the backward pair the other way round.
 */
export function planTransitions(
  slidevTransitions: Array<string | null>,
  deckDefault: string | null,
  report: Reporter,
): TransitionPlan {
  const known = (t: string) => {
    const d = directions(t);
    return [d.fwd, d.back].every((x) => x in HALVES);
  };
  const resolved = slidevTransitions.map((t, i) => {
    const name = t ?? deckDefault ?? "none";
    if (name === "view-transition" || known(name)) return name;
    report({
      severity: "warning",
      slide: i + 1,
      what: `The transition "${name}" is Slidev CSS (a Vue <Transition>); the slide fades instead.`,
      suggestion: "Define it with `transitions:` in the headmatter (core/transitions.ts).",
    });
    return "fade";
  });
  const fadeOut = resolved.some((t) => t.includes("fade-out"));
  const unique = new Set(resolved);
  if (unique.size <= 1) {
    const only = [...unique][0] ?? "none";
    if (SAME[only])
      return {
        deck: SAME[only]!,
        definitions: {},
        perSlide: resolved.map(() => null),
        fadeOut: false,
      };
  }
  if (resolved.includes("view-transition")) {
    report({
      severity: "info",
      what: "view-transition mixed with other transitions: those slides use the browser's view transition both ways.",
    });
  }
  const definitions: TransitionPlan["definitions"] = {};
  const names = resolved.map((cur, i) => {
    if (cur === "view-transition") return "view-transition";
    const prev = i > 0 ? resolved[i - 1]! : cur;
    const a = prev === "view-transition" ? "fade" : prev;
    const name =
      a === cur
        ? `slidev-${cur.replace(/\s*\|\s*/g, "--")}`
        : `slidev-${a.replace(/\s*\|\s*/g, "--")}-then-${cur.replace(/\s*\|\s*/g, "--")}`;
    if (!definitions[name]) {
      const da = directions(a);
      const db = directions(cur);
      definitions[name] = {
        in: HALVES[da.fwd]!.in,
        out: HALVES[db.fwd]!.out,
        back: { in: HALVES[db.back]!.in, out: HALVES[da.back]!.out },
      };
    }
    return name;
  });
  // the most common name is the deck's, the others are per slide
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const deck = [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  return { deck, definitions, perSlide: names.map((n) => (n === deck ? null : n)), fadeOut };
}
