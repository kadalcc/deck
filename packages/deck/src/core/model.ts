import type { ComponentType } from "react";

import type { Frontmatter } from "../compiler/split.ts";
import {
  DEFAULT_GLOSSARY,
  type GlossaryEntry,
  type GlossaryOptions,
  glossaryOptions,
} from "../glossary/model.ts";
import type { TransitionDefinition } from "./transitions.ts";
import type { ManifestPackages } from "../theming/contract.ts";
import type { FontsInput } from "../theming/fonts.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck is a row of columns. Each column is a vertical stack whose first slide is the one you
 * reach by moving right; the others sit beneath it (reveal.js's vertical slides). Every slide has a
 * flat index in authored order too, which is what the progress bar, the table of contents and the
 * scroll view use. Nothing here touches the DOM.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SlideModule {
  default: ComponentType<Record<string, unknown>>;
}

export interface MagicMoveStepData {
  lang: string;
  lines: boolean;
  highlight: string | null;
  tokens: { light: unknown; dark: unknown };
}

export interface MagicMoveData {
  options: Record<string, string>;
  title: string | null;
  steps: MagicMoveStepData[];
}

/** One entry of the manifest the Vite plugin emits. */
export interface SlideMeta {
  index: number;
  h: number;
  v: number;
  id: string;
  title: string | null;
  level: number;
  frontmatter: Frontmatter;
  hasNotes: boolean;
  /** The slide's words as plain text: for search, the outline, and agents. */
  text?: string;
  /**
   * The speaker notes as plain text, `[click]` markers kept, so the narrator and an agent can read
   * them without rendering; null without notes. Absent in manifests built before 0.3.
   */
  notesText?: string | null;
  source: { file: string; line: number };
  load: () => Promise<SlideModule>;
  loadNotes: (() => Promise<SlideModule>) | null;
  loadMagic: (() => Promise<{ default: MagicMoveData[] }>) | null;
}

export interface DeckManifest {
  headmatter: Frontmatter;
  slides: SlideMeta[];
  /** The deck's `glossary.yaml`, parsed at build time; absent in a deck without one. */
  glossary?: GlossaryEntry[];
  /**
   * Every slide's `<style>` blocks as one stylesheet, each scoped to its slide
   * (`.deck-slide[data-index="N"]`) unless written `<style global>`; `<Deck>` renders it once.
   * Absent or "" when no slide has one (compiler/slide-style.ts).
   */
  styles?: string;
  /**
   * The in-browser Kokoro voice, when the deck has `kokoro-js` installed: a lazy import of the
   * module that starts its Web Worker. Null (or absent) without it — the narrator then uses the
   * browser's own voice and baked clips. The Vite plugin decides, so a deck without the package
   * builds without it.
   */
  kokoro?: (() => Promise<{ createWorker: () => Worker }>) | null;

  /**
   * The dev server's message channel for the phone remote (`kadal-deck dev` only: null or absent
   * in a build). See src/remote/relay.ts.
   */
  relay?: DevRelay | null;

  /**
   * The deck's theme, the themes its menu offers, its addons and its own layer files, resolved
   * (theming/contract.ts): by the Vite plugin from the deck's folder, or by the runtime compiler
   * from the packages its page bundled. Absent in manifests built before 0.4: the headmatter's
   * `theme` then names a stylesheet main.tsx imported, as it always did.
   */
  packages?: ManifestPackages;
}

/** A line to the dev server: Vite's HMR socket, event "kadal:remote". */
export interface DevRelay {
  send(message: unknown): void;
  on(listener: (message: unknown) => void): () => void;
  /** Hears the connection to the dev server come back (true) or drop (false). */
  onStatus(listener: (open: boolean) => void): () => void;
}

/** `narration`: the autoplay rehearsal — notes read aloud, the deck turning its own pages. */
export interface NarrationConfig {
  /** The narration bar and the R key. "auto" (the default): on when any slide has notes. */
  enabled: boolean | "auto";
  /**
   * Which voice: "auto" = a baked clip when `kadal-deck narrate` made one, else Kokoro once it has
   * downloaded (it starts downloading at the first play, never on load), else the browser's own.
   */
  engine: "auto" | "kokoro" | "browser" | "baked" | "silent";
  /** Kokoro voice id (baked clips are keyed by it too). */
  voice: string;
  /** Speaking speed, 0.5–3. */
  rate: number;
  /** Milliseconds of quiet between one step and the next. */
  gap: number;
  /** A slide with nothing to say: "estimate" (time to read it), "skip", or milliseconds. */
  silent: "estimate" | "skip" | number;
  /** The Kokoro model on the Hugging Face Hub. */
  model: string;
  /** Kokoro weights' precision; "auto" = fp32 on WebGPU, q8 on WebAssembly. */
  dtype: "auto" | "fp32" | "fp16" | "q8" | "q4" | "q4f16";
}

export const DEFAULT_NARRATION: NarrationConfig = {
  enabled: "auto",
  engine: "auto",
  voice: "af_heart",
  rate: 1,
  gap: 600,
  silent: "estimate",
  model: "onnx-community/Kokoro-82M-v1.0-ONNX",
  dtype: "auto",
};

export type Transition =
  | "none"
  | "fade"
  | "slide"
  | "convex"
  | "concave"
  | "zoom"
  | "view-transition";
export type TransitionSpeed = "default" | "fast" | "slow";
export type SlideNumberFormat = "h.v" | "h/v" | "c" | "c/t";
export type NavigationMode = "default" | "linear" | "grid";
export type ColorScheme = "auto" | "light" | "dark";

/** Every option, with the same names reveal.js and Slidev use wherever the idea is the same. */
export interface DeckConfig {
  title: string;
  author: string;
  info: string;
  /** The authored size; the stage scales uniformly to fit any viewport. */
  width: number;
  height: number;
  /**
   * Fraction of the viewport left empty around the stage. 0 by default: a 16:9 window shows the
   * slide edge to edge, any other shape gets bars on two sides — the content never reflows.
   */
  margin: number;
  minScale: number;
  maxScale: number;
  /** Vertically centre each slide's content. */
  center: boolean;
  controls: boolean | "speaker";
  controlsLayout: "bottom-right" | "edges";
  controlsTutorial: boolean;
  controlsBackArrows: "faded" | "hidden" | "visible";
  progress: boolean;
  slideNumber: boolean | SlideNumberFormat;
  showSlideNumber: "all" | "print" | "speaker";
  hash: boolean;
  hashOneBasedIndex: boolean;
  history: boolean;
  keyboard: boolean;
  overview: boolean;
  touch: boolean;
  loop: boolean;
  rtl: boolean;
  navigationMode: NavigationMode;
  shuffle: boolean;
  fragments: boolean;
  fragmentInURL: boolean;
  embedded: boolean;
  help: boolean;
  pause: boolean;
  showNotes: boolean | "separate-page";
  autoPlayMedia: boolean | null;
  autoAnimate: boolean;
  autoAnimateEasing: string;
  autoAnimateDuration: number;
  autoAnimateUnmatched: boolean;
  /** Milliseconds between automatic steps; 0 disables. */
  autoSlide: number;
  autoSlideStoppable: boolean;
  /** Seconds per slide for the pacing timer, or null. */
  defaultTiming: number | null;
  /** Total seconds for the pacing timer, or null. */
  totalTime: number | null;
  mouseWheel: boolean;
  previewLinks: boolean;
  transition: Transition;
  transitionSpeed: TransitionSpeed;
  backgroundTransition: Transition;
  viewDistance: number;
  mobileViewDistance: number;
  hideInactiveCursor: boolean;
  hideCursorTime: number;
  view: "slide" | "scroll";
  scrollProgress: "auto" | boolean;
  scrollSnap: "mandatory" | "proximity" | false;
  /**
   * Viewport width under which the scroll view switches on by itself; 0 (the default) never does
   * — a phone gets the same stage, letterboxed, and `?view=scroll` stays an explicit choice.
   */
  scrollActivationWidth: number;
  theme: string;
  /**
   * The themes the theme menu offers, besides `theme`: built-ins, packages or folders, resolved
   * like `theme` (the Vite plugin imports their CSS), or classes main.tsx's CSS defines.
   */
  themes: string[];
  colorScheme: ColorScheme;
  pdfSeparateFragments: boolean;
  pdfMaxPagesPerSlide: number;
  jumpToSlide: boolean;
  search: boolean;
  zoom: boolean;
  wakeLock: boolean;
  selectable: boolean;
  lineNumbers: boolean;
  /** Scale a slide whose content overflows so it fits (measured after render). */
  autoFit: boolean;
  magicMoveDuration: number;
  /**
   * Live room: the backend base (same origin `/api` on the host), or null for an offline deck.
   * `verify` is a host page that checks a viewer (Turnstile) and sends them back with a pass —
   * how a host that serves decks sandboxed keeps the check, since Turnstile can't run in an
   * opaque origin. Set by the host (`window.__KADAL_DECK__.verify`), never by a deck.
   */
  live: {
    api: string | null;
    room: string | null;
    turnstile: string | null;
    verify?: string | null;
  };
  drawings: { enabled: boolean; persist: boolean; presenterOnly: boolean; syncAll: boolean };
  // Described in catalog/reference.ts (DECK_KEY_DOCS), where the long form fits.
  narration: NarrationConfig;
  /**
   * Term cards. The runtime reads `delay` and `sync`; the rest steers the compiler, which sees
   * the headmatter only — set those there. `glossary: false` or a path are shorthands.
   */
  glossary: GlossaryOptions;
  reactions: boolean;
  qa: boolean;
  polls: boolean;
  /** Show every slide's notes to anyone on the audience page (after the talk, for instance). */
  audienceNotes: boolean;
  /** The deck's slug on the host, from the Vite base — decks/<slug>. */
  slug: string;
  /** Show the "Made with Kadal Deck" link in the corner (set by the host, see `withHostOverride`). */
  badge: boolean;
  /**
   * Frame the first and last slides with the host's ads (set by the host, see `withHostOverride`
   * and core/ads.ts). Only the play view shows them.
   */
  ads: boolean;
  /**
   * A Download button beside the theme menu. `true` offers the PDF that `kadal-deck build
   * --download` puts beside the deck (`deck.pdf`), or the browser exporter (/export) when there
   * is none; a URL links that file instead. A host may switch it off, or on, for the decks it
   * serves (`window.__KADAL_DECK__.download`). See core/download.ts.
   */
  download: boolean | string;
  /**
   * Web fonts: Google Fonts families as written (`["Inter:wght@400;600"]`), or Slidev's object —
   * `{ sans, heading, serif, mono, weights, italic, provider: google|bunny|none, local, fallbacks }`
   * — which also points the theme's font tokens at them (theming/fonts.ts).
   */
  fonts: FontsInput;
  seoMeta: Record<string, string>;
  /**
   * Frontmatter every slide gets unless it sets the key itself (Slidev's `defaults`), e.g.
   * `{ layout: center, transition: fade }`. A theme's defaults sit beneath it.
   */
  defaults: Frontmatter;
  /** The PlantUML server ```plantuml fences render with: `<server>/svg/<encoded source>`. */
  plantUmlServer: string;
  /** Words in the speaker notes and their reading, shown as ruby: `{ 日本語: "ni hon go" }`. */
  notesAutoRuby: Record<string, string>;
  /** KaTeX options for every formula, e.g. `{ macros: { "\\RR": "\\mathbb{R}" } }`. */
  katex: { macros?: Record<string, string>; [option: string]: unknown };
  /** Mermaid configuration for every diagram (theme, themeVariables, look, flowchart…). */
  mermaid: Record<string, unknown>;
  /**
   * Named custom transitions: `{ flip: { in: "flip-in", out: "flip-out", back: {…} } }`, the
   * keyframes defined in the theme's CSS or a `<style global>` (core/transitions.ts).
   */
  transitions: Record<string, TransitionDefinition>;
  /** Addon packages: `@kadal/addon-<name>`, `kadal-addon-<name>`, a package name or a folder. */
  addons: string[];
  /**
   * The theme's knobs: each key becomes a `--theme-<kebab-key>` custom property on the deck root
   * (`primary: "#0f766e"` → `--theme-primary`), over the theme's own defaults.
   */
  themeConfig: Record<string, unknown>;
  /** Where the global and slide layers draw besides the deck, print and export. */
  layers: { presenter: boolean; overview: boolean };
}

export const DEFAULT_CONFIG: DeckConfig = {
  title: "Untitled deck",
  author: "",
  info: "",
  width: 1920,
  height: 1080,
  margin: 0,
  minScale: 0.2,
  maxScale: 2,
  center: true,
  controls: true,
  controlsLayout: "bottom-right",
  controlsTutorial: true,
  controlsBackArrows: "faded",
  progress: true,
  slideNumber: false,
  showSlideNumber: "all",
  hash: true,
  hashOneBasedIndex: false,
  history: false,
  keyboard: true,
  overview: true,
  touch: true,
  loop: false,
  rtl: false,
  navigationMode: "default",
  shuffle: false,
  fragments: true,
  fragmentInURL: true,
  embedded: false,
  help: true,
  pause: true,
  showNotes: false,
  autoPlayMedia: null,
  autoAnimate: true,
  autoAnimateEasing: "ease",
  autoAnimateDuration: 1,
  autoAnimateUnmatched: true,
  autoSlide: 0,
  autoSlideStoppable: true,
  defaultTiming: null,
  totalTime: null,
  mouseWheel: false,
  previewLinks: false,
  transition: "slide",
  transitionSpeed: "default",
  backgroundTransition: "fade",
  viewDistance: 3,
  mobileViewDistance: 2,
  hideInactiveCursor: true,
  hideCursorTime: 5000,
  view: "slide",
  scrollProgress: "auto",
  scrollSnap: "mandatory",
  scrollActivationWidth: 0,
  theme: "minimal",
  themes: ["minimal", "rla", "stack"],
  colorScheme: "auto",
  pdfSeparateFragments: true,
  pdfMaxPagesPerSlide: 1,
  jumpToSlide: true,
  search: true,
  zoom: true,
  wakeLock: true,
  selectable: true,
  lineNumbers: false,
  autoFit: true,
  magicMoveDuration: 800,
  live: { api: "/api", room: null, turnstile: null },
  drawings: { enabled: true, persist: true, presenterOnly: false, syncAll: true },
  narration: DEFAULT_NARRATION,
  glossary: DEFAULT_GLOSSARY,
  reactions: true,
  qa: true,
  polls: true,
  audienceNotes: false,
  slug: "",
  badge: false,
  ads: false,
  download: false,
  fonts: [],
  seoMeta: {},
  defaults: {},
  plantUmlServer: "https://www.plantuml.com/plantuml",
  notesAutoRuby: {},
  katex: {},
  mermaid: {},
  transitions: {},
  addons: [],
  themeConfig: {},
  layers: { presenter: true, overview: false },
};

/** Headmatter and deck.config.ts both layer over the defaults; nested objects merge one level. */
/** What a deck.config.ts or headmatter may set: any option, with the nested groups partial too. */
export type DeckConfigInput = Partial<
  Omit<DeckConfig, "live" | "drawings" | "seoMeta" | "glossary" | "narration" | "layers">
> & {
  layers?: Partial<DeckConfig["layers"]>;
  glossary?: Partial<GlossaryOptions> | string | false;
  live?: Partial<DeckConfig["live"]>;
  drawings?: Partial<DeckConfig["drawings"]>;
  narration?: Partial<NarrationConfig> | boolean;
  seoMeta?: Partial<DeckConfig["seoMeta"]>;
};

export function resolveConfig(
  ...layers: Array<DeckConfigInput | Frontmatter | undefined>
): DeckConfig {
  const out: DeckConfig = {
    ...DEFAULT_CONFIG,
    live: { ...DEFAULT_CONFIG.live },
    drawings: { ...DEFAULT_CONFIG.drawings },
    narration: { ...DEFAULT_CONFIG.narration },
    layers: { ...DEFAULT_CONFIG.layers },
    themeConfig: {},
  };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      if (key === "glossary") out.glossary = glossaryOptions(value, out.glossary);
      // `narration: false` (or true) in the headmatter is the switch alone.
      else if (key === "narration" && typeof value === "boolean")
        out.narration = { ...out.narration, enabled: value };
      else if (
        (key === "live" ||
          key === "drawings" ||
          key === "seoMeta" ||
          key === "narration" ||
          key === "transitions" ||
          key === "mermaid" ||
          key === "layers" ||
          key === "themeConfig") &&
        value &&
        typeof value === "object"
      ) {
        (out as unknown as Record<string, unknown>)[key] = {
          ...(out as unknown as Record<string, Record<string, unknown>>)[key],
          ...(value as Record<string, unknown>),
        };
      } else (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  // Slidev's aspectRatio + canvasWidth spelling.
  const fm = Object.assign({}, ...layers.filter(Boolean)) as Frontmatter;
  if (typeof fm.aspectRatio === "number" && typeof fm.canvasWidth === "number") {
    out.width = fm.canvasWidth;
    out.height = Math.round(fm.canvasWidth / fm.aspectRatio);
  }
  return out;
}

/** Per-slide options read from frontmatter, normalised. */
export interface SlideOptions {
  layout: string;
  className: string;
  hidden: boolean;
  uncounted: boolean;
  hideInToc: boolean;
  transition: string | null;
  transitionSpeed: TransitionSpeed | null;
  backgroundTransition: Transition | null;
  autoAnimate: boolean;
  autoAnimateId: string | null;
  autoAnimateRestart: boolean;
  autoSlide: number | null;
  clicks: number | null;
  clicksStart: number;
  preload: boolean;
  timing: number | null;
  state: string[];
  /** Force dark or light tokens on this slide (a dark background under a light theme). */
  colorScheme: "dark" | "light" | null;
  zoom: number;
  background: SlideBackground | null;
}

export interface SlideBackground {
  color: string | null;
  gradient: string | null;
  image: string | null;
  size: string;
  position: string;
  repeat: string;
  opacity: number;
  video: string | null;
  videoLoop: boolean;
  videoMuted: boolean;
  iframe: string | null;
  iframeInteractive: boolean;
  /**
   * A soft wash of one colour over the layer — a diagonal gradient from the colour to a paler
   * tint of it, with a little more light in one corner — under a component background or on
   * its own (`fill:` / `tint:` in frontmatter). `color` is the flat fill reveal.js has.
   */
  tint: string | null;
  /** A registered component background, by name, with its props. */
  component: string | null;
  props: Record<string, unknown>;
  /**
   * The slide's own `colorScheme`, when it forces one. The layer then paints that scheme's
   * `--deck-bg` under everything else, so a dark slide in a light deck is dark behind a
   * translucent background too — not light text on the deck's white page.
   */
  scheme: "dark" | "light" | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
}

const COLOR = /^(#|rgb|hsl|oklch|oklab|lab|lch|transparent|[a-z]+$)/i;
const GRADIENT = /gradient\(/i;

/** `background: "#fff"`, `background: "/img.png"`, `background: { image, size }`, `background: { component: "aurora", … }`. */
export function resolveBackground(fm: Frontmatter): SlideBackground | null {
  const raw = fm.background ?? fm.backgroundColor ?? fm.backgroundImage;
  const base: SlideBackground = {
    color: null,
    gradient: null,
    image: null,
    size: "cover",
    position: "center",
    repeat: "no-repeat",
    opacity: 1,
    video: null,
    videoLoop: false,
    videoMuted: true,
    iframe: null,
    iframeInteractive: false,
    tint: null,
    component: null,
    props: {},
    scheme: null,
  };
  let any = false;
  const apply = (obj: Record<string, unknown>) => {
    // With a component, `color` belongs to the component (its stroke); the layer's own wash is
    // `fill` (or `tint`). Without one, `color` is the flat background colour, as in reveal.js.
    if (str(obj.fill) || str(obj.tint)) {
      base.tint = str(obj.fill) ?? str(obj.tint);
      any = true;
    } else if (str(obj.color) && !str(obj.component)) {
      base.color = str(obj.color);
      any = true;
    }
    if (str(obj.gradient)) {
      base.gradient = str(obj.gradient);
      any = true;
    }
    if (str(obj.image)) {
      base.image = str(obj.image);
      any = true;
    }
    if (str(obj.size)) base.size = str(obj.size)!;
    if (str(obj.position)) base.position = str(obj.position)!;
    if (str(obj.repeat)) base.repeat = str(obj.repeat)!;
    if (num(obj.opacity) !== null) base.opacity = num(obj.opacity)!;
    if (str(obj.video)) {
      base.video = str(obj.video);
      any = true;
    }
    base.videoLoop = bool(obj.videoLoop ?? obj.loop, base.videoLoop);
    base.videoMuted = bool(obj.videoMuted ?? obj.muted, base.videoMuted);
    if (str(obj.iframe)) {
      base.iframe = str(obj.iframe);
      any = true;
    }
    base.iframeInteractive = bool(obj.interactive, base.iframeInteractive);
    if (str(obj.component)) {
      base.component = str(obj.component);
      any = true;
      const { component: _c, fill: _f, tint: _t, ...props } = obj;
      base.props = props;
    }
  };
  if (typeof raw === "string") {
    const s = raw.trim();
    if (GRADIENT.test(s)) base.gradient = s;
    else if (/\.(mp4|webm|mov|ogv)(\?|$)/i.test(s)) base.video = s;
    else if (
      /^(https?:)?\/\/|\/|\.\/|\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(s) &&
      !COLOR.test(s)
    )
      base.image = s;
    else if (/^[a-z][\w-]*$/i.test(s) && !isCssColorKeyword(s)) base.component = s;
    else base.color = s;
    any = true;
  } else if (raw && typeof raw === "object") apply(raw as Record<string, unknown>);
  // reveal.js's individual keys, as frontmatter.
  apply({
    color: fm.backgroundColor,
    gradient: fm.backgroundGradient,
    image: fm.backgroundImage,
    size: fm.backgroundSize,
    position: fm.backgroundPosition,
    repeat: fm.backgroundRepeat,
    opacity: fm.backgroundOpacity,
    video: fm.backgroundVideo,
    videoLoop: fm.backgroundVideoLoop,
    videoMuted: fm.backgroundVideoMuted,
    iframe: fm.backgroundIframe,
    interactive: fm.backgroundInteractive,
  });
  return any ? base : null;
}

const CSS_COLORS = new Set([
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "silver",
  "gold",
  "navy",
  "teal",
  "aqua",
  "lime",
  "maroon",
  "olive",
  "fuchsia",
  "coral",
  "salmon",
  "crimson",
  "indigo",
  "violet",
  "cyan",
  "magenta",
  "aquamarine",
  "transparent",
  "currentcolor",
  "beige",
  "ivory",
  "khaki",
  "lavender",
  "linen",
  "mint",
  "peach",
  "plum",
  "tan",
  "tomato",
  "turquoise",
  "wheat",
  "azure",
  "brown",
  "chocolate",
  "darkblue",
  "darkgreen",
  "darkred",
  "lightblue",
  "lightgreen",
  "orchid",
  "sienna",
  "slategray",
  "snow",
  "steelblue",
]);
function isCssColorKeyword(s: string): boolean {
  return CSS_COLORS.has(s.toLowerCase());
}

export function resolveSlideOptions(
  fm: Frontmatter,
  config: DeckConfig,
  isFirst: boolean,
): SlideOptions {
  const state = fm.state;
  const visibility = str(fm.visibility);
  const transition = str(fm.transition);
  const transitionSpeed = str(fm.transitionSpeed) as TransitionSpeed | null;
  const colorScheme =
    fm.colorScheme === "dark" || fm.colorScheme === "light" ? fm.colorScheme : null;
  return {
    layout: str(fm.layout) ?? (isFirst ? "cover" : "default"),
    className: Array.isArray(fm.class) ? fm.class.join(" ") : (str(fm.class) ?? ""),
    hidden: bool(fm.hide, false) || bool(fm.disabled, false) || visibility === "hidden",
    uncounted: visibility === "uncounted",
    hideInToc: bool(fm.hideInToc, false),
    transition,
    transitionSpeed,
    backgroundTransition: str(fm.backgroundTransition) as Transition | null,
    autoAnimate:
      fm.autoAnimate === true || (typeof fm.autoAnimate === "object" && fm.autoAnimate !== null),
    autoAnimateId:
      str(fm.autoAnimateId) ??
      (typeof fm.autoAnimate === "object" && fm.autoAnimate
        ? (str((fm.autoAnimate as Frontmatter).id) ?? null)
        : null),
    autoAnimateRestart: bool(fm.autoAnimateRestart, false),
    autoSlide: num(fm.autoslide ?? fm.autoSlide),
    clicks: num(fm.clicks),
    clicksStart: num(fm.clicksStart) ?? 0,
    preload: bool(fm.preload, true),
    timing: num(fm.timing) ?? config.defaultTiming,
    state: Array.isArray(state) ? state.map(String) : str(state) ? [str(state)!] : [],
    colorScheme,
    zoom: num(fm.zoom) ?? 1,
    background: colorScheme
      ? {
          ...(resolveBackground(fm) ?? resolveBackground({ background: "transparent" })!),
          scheme: colorScheme,
        }
      : resolveBackground(fm),
  };
}

/** The slides grouped into columns, with hidden slides dropped. */
export interface Column {
  h: number;
  slides: SlideMeta[];
}

export function columnsOf(slides: SlideMeta[], config: DeckConfig): Column[] {
  const visible = slides.filter(
    (s) => !resolveSlideOptions(s.frontmatter, config, s.index === 0).hidden,
  );
  const byH = new Map<number, SlideMeta[]>();
  for (const s of visible) {
    const list = byH.get(s.h) ?? [];
    list.push(s);
    byH.set(s.h, list);
  }
  return [...byH.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list], i) => ({ h: i, slides: list.sort((a, b) => a.v - b.v) }));
}

/** Address a slide by column and row in the visible tree. */
export function slideAt(columns: Column[], h: number, v: number): SlideMeta | null {
  return columns[h]?.slides[v] ?? null;
}

/** The flat position of a visible slide among visible slides (for numbering and progress). */
export function flatIndex(columns: Column[], h: number, v: number): number {
  let n = 0;
  for (let i = 0; i < h; i++) n += columns[i]?.slides.length ?? 0;
  return n + v;
}

export function totalSlides(columns: Column[]): number {
  return columns.reduce((n, c) => n + c.slides.length, 0);
}

/** Column and row of the visible slide with this flat index. */
export function fromFlat(columns: Column[], flat: number): { h: number; v: number } {
  let left = Math.max(0, flat);
  for (let h = 0; h < columns.length; h++) {
    const len = columns[h]!.slides.length;
    if (left < len) return { h, v: left };
    left -= len;
  }
  const h = Math.max(0, columns.length - 1);
  return { h, v: Math.max(0, (columns[h]?.slides.length ?? 1) - 1) };
}

/** Find a slide by its id (frontmatter `id`, `routeAlias`, or the generated `sN`). */
export function findById(columns: Column[], id: string): { h: number; v: number } | null {
  for (const c of columns) {
    for (let v = 0; v < c.slides.length; v++) {
      const s = c.slides[v]!;
      if (s.id === id || s.frontmatter.routeAlias === id) return { h: c.h, v };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The host override. A deck is built once and may be served anywhere; the host that serves it
// knows which room it belongs to. It says so with one global set before the bundle runs:
//
//   <script>window.__KADAL_DECK__ = {"room":"d…","api":"/api","badge":true}</script>
//
// and it wins over whatever the build said. Applied once, in `Deck`, so every consumer of
// `config.live` (the room, presenter login, stats, beacons, share links, exports) agrees.

/** What a host may say about a deck it serves. */
export interface HostOverride {
  room?: string;
  api?: string;
  badge?: boolean;
  /** Frame the first and last slides with the host's ads (core/ads.ts). */
  ads?: boolean;
  /** The host's viewer-verification page (a same-site path), see `DeckConfig.live.verify`. */
  verify?: string;
  /**
   * The Download button: `false` hides it whatever the deck says (a free plan), `true` allows
   * the deck's own, a URL (https, or a same-site path) points a deck's button at the host's copy.
   */
  download?: boolean | string;
}

/** The global a host sets, validated: anything malformed is ignored rather than trusted. */
export function readHostOverride(scope: unknown = globalThis): HostOverride | null {
  const raw = (scope as { __KADAL_DECK__?: unknown } | null)?.__KADAL_DECK__;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: HostOverride = {};
  if (typeof o.room === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(o.room)) out.room = o.room;
  if (typeof o.api === "string" && o.api.length > 0) out.api = o.api;
  if (typeof o.badge === "boolean") out.badge = o.badge;
  if (typeof o.ads === "boolean") out.ads = o.ads;
  if (typeof o.verify === "string" && /^\/(?!\/)[\w./-]*$/.test(o.verify)) out.verify = o.verify;
  if (typeof o.download === "boolean") out.download = o.download;
  else if (typeof o.download === "string" && /^(https:\/\/|\/(?!\/))\S+$/.test(o.download))
    out.download = o.download;
  return out;
}

/** The config with the host's word laid over it. Returns the same object when there is none. */
export function withHostOverride(config: DeckConfig, override: HostOverride | null): DeckConfig {
  if (
    !override ||
    (!override.room &&
      !override.api &&
      !override.verify &&
      override.badge === undefined &&
      override.ads === undefined &&
      override.download === undefined)
  )
    return config;
  return {
    ...config,
    live: {
      ...config.live,
      ...(override.room ? { room: override.room } : {}),
      ...(override.api ? { api: override.api } : {}),
      ...(override.verify ? { verify: override.verify } : {}),
    },
    ...(override.badge !== undefined ? { badge: override.badge } : {}),
    ...(override.ads !== undefined ? { ads: override.ads } : {}),
    // `false` hides the button; a URL points it at the host's copy; `true` (allowed) lets the
    // deck's own choice stand, so a deck that never asked for a button doesn't get one.
    ...(override.download === false
      ? { download: false }
      : typeof override.download === "string" && config.download !== false
        ? { download: override.download }
        : {}),
  };
}

/**
 * The id every host call is keyed by — the room, presenter login, stats, beacons, share links and
 * exports. A published deck's is the room the host assigned; a self-hosted one's is its slug.
 */
export function roomIdOf(config: Pick<DeckConfig, "live" | "slug">): string {
  return config.live.room || config.slug || "deck";
}

/**
 * A slide's `transition`, split into its way in and its way out.
 *
 * `slide` is both. reveal.js's `zoom-in fade-out` names each half; a half left unnamed (`zoom-in`
 * alone) takes `fallback`, which is the deck's transition. Unknown words are kept as written — the
 * stylesheet simply has no animation for them.
 */
export function splitTransition(
  spec: string | null | undefined,
  fallback: string,
): { in: string; out: string } {
  const words = (spec ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { in: fallback, out: fallback };
  let into: string | null = null;
  let out: string | null = null;
  let both: string | null = null;
  for (const w of words) {
    const m = /^(.+)-(in|out)$/.exec(w);
    if (m && m[2] === "in") into = m[1]!;
    else if (m && m[2] === "out") out = m[1]!;
    else both = w;
  }
  return { in: into ?? both ?? fallback, out: out ?? both ?? fallback };
}
