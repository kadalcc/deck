import type { ComponentType } from "react";

import type { Frontmatter } from "../compiler/split.ts";
import { parseDuration, parseTimerMode } from "./timer.ts";
import type { DrawingSource } from "../draw/source.ts";
import {
  DEFAULT_GLOSSARY,
  type GlossaryEntry,
  type GlossaryOptions,
  glossaryOptions,
} from "../glossary/model.ts";
import type { TransitionDefinition } from "./transitions.ts";
import type { ManifestPackages } from "../theming/contract.ts";
import type { FontsInput } from "../theming/fonts.ts";
import { isPremiumName, premiumBase } from "./premium.ts";

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
  /** The step's highlight frames, serialised (`*|2|4,5`); null lights every line. */
  highlight: string | null;
  /**
   * The keyed tokens, their colours as Shiki's CSS variables for every theme the deck can show
   * (compiler/code-themes.ts). Before 0.4.1 a `{ light, dark }` pair of token sets.
   */
  tokens: unknown;
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
  /**
   * Set only by a deck's editing kit (runtime/shell.tsx `kitManifest`): the component `<Deck>`
   * renders instead of itself — the shell that compiles the slides from an editor's text.
   */
  kit?: { Shell: unknown };
  /** The deck's `glossary.yaml`, parsed at build time; absent in a deck without one. */
  glossary?: GlossaryEntry[];
  /**
   * Every slide's `<style>` blocks as one stylesheet, each scoped to its slide
   * (`.deck-slide[data-index="N"]`) unless written `<style global>`; `<Deck>` renders it once.
   * Absent or "" when no slide has one (compiler/slide-style.ts).
   */
  styles?: string;
  /**
   * The Shiki themes the deck's code is highlighted with: its own pair and the further ones its
   * theme menu needs, by variable key (compiler/code-themes.ts). The stylesheet above already
   * recolours static code; Monaco editors read this to follow the theme on show. Absent in
   * manifests built before 0.4.1.
   */
  codeThemes?: import("../compiler/code-themes.ts").CodeThemes;
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

  /**
   * Monaco for `{monaco…}` blocks: a lazy import of the deck's `virtual:deck/monaco`, which the
   * Vite plugin generates only when some slide has one. Null or absent elsewhere; a page that
   * compiles decks in the browser registers its own (`registerMonacoLoader`). See monaco/loader.ts.
   */
  monaco?: (() => Promise<import("../monaco/loader.ts").MonacoHost>) | null;

  /**
   * The deck's `setup/code-runners.ts`, when it has one: runners for `{monaco-run}` blocks,
   * loaded before the first run. See monaco/runners.ts.
   */
  codeRunners?: (() => Promise<unknown>) | null;

  /**
   * The dev server's notes endpoint (`kadal-deck dev` only), through which the presenter, the
   * overview and the notes pages save speaker notes into deck.mdx. Null or absent in a build,
   * where those views are read-only (unless `<Deck notesEditor>` supplies a save path).
   */
  notesApi?: string | null;
  /**
   * The dev server's drag endpoint (`kadal-deck dev` only): where `<Drag>` and `<DragArrow>` save
   * a position after a double-click edit (vite/drag-dev.ts). Null or absent elsewhere, where
   * they are static.
   */
  dragApi?: string | null;
  /** Served by `kadal-deck dev` (true) rather than built (false or absent). */
  dev?: boolean;

  /**
   * The deck's saved drawings, `drawings/*.svg` (src/draw/source.ts): read from the dev server,
   * bundled into a build, or taken from the runtime compiler's files. Null or absent without any.
   */
  drawings?: DrawingSource | null;

  /**
   * The dev server's slide-source endpoint (`kadal-deck dev` only, vite/source-dev.ts): the side
   * editor (react/SideEditor.tsx) loads and saves a slide's whole source through it.
   */
  sourceApi?: string | null;
  /** The side editor's CodeMirror module, a lazy import under `kadal-deck dev`; null in a build. */
  sideEditor?: (() => Promise<import("./side-editor.ts").SideEditorModule>) | null;
}

/**
 * A line to a phone-remote relay: the dev server's (Vite's HMR socket, event "kadal:remote"), or
 * a `kadal-deck relay` over a WebSocket (remote/socket.ts).
 */
export interface DevRelay {
  send(message: unknown): void;
  on(listener: (message: unknown) => void): () => void;
  /** Hears the connection to the dev server come back (true) or drop (false). */
  onStatus(listener: (open: boolean) => void): () => void;
}

/**
 * `drawings`: the pen, the shapes and where strokes are kept (src/draw/). Slidev's keys, plus
 * `persist: "files"` and `perClick`.
 */
export interface DrawingsConfig {
  /** The pen and its toolbar; `"dev"`: only on the dev server. */
  enabled: boolean | "dev";
  /**
   * Where pinned strokes are kept. `true` (the default): this browser's storage. `"files"`:
   * `drawings/<slide>.svg` beside deck.mdx, written by the dev server, bundled into a build and
   * so into the hosted copy and every export (browser storage where files cannot be written).
   * `false`: nowhere — a reload starts clean. Files in `drawings/` are shown whatever this says.
   */
  persist: boolean | "files";
  /** Only the presenter draws; the audience sees. */
  presenterOnly: boolean;
  /** Every window that draws is synced, not only the presenter's. */
  syncAll: boolean;
  /**
   * Strokes belong to the click step they were drawn on, and show from that step on (in the
   * print view too, a page per step). Off: a slide has one drawing, whatever its step.
   */
  perClick: boolean;
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
/** Where the slide-number function is called: the slide's position, 0-based like the hash. */
export interface SlideNumberContext {
  h: number;
  v: number;
  click: number;
  /** The slide's place in the whole deck, 0-based, and how many slides there are. */
  index: number;
  total: number;
  id: string | null;
}
/**
 * reveal.js's custom slide number, from deck.config.ts only: one string, or three (`[h, ".", v]`)
 * that are drawn with the separator between them.
 */
export type SlideNumberFunction = (slide: SlideNumberContext) => string | string[];
/** reveal.js's `keyboardCondition` as a function (deck.config.ts only): true lets the key through. */
export type KeyboardConditionFunction = (event: KeyboardEvent) => boolean;
/** One pair auto-animate morphs, as reveal.js's `autoAnimateMatcher` returns them. */
export interface AutoAnimatePair {
  from: HTMLElement;
  to: HTMLElement;
}
/** reveal.js's `autoAnimateMatcher` (deck.config.ts only): which elements of two slides pair up. */
export type AutoAnimateMatcher = (from: HTMLElement, to: HTMLElement) => AutoAnimatePair[];
/** The CSS properties auto-animate morphs: reveal.js's list. */
export const AUTO_ANIMATE_STYLES = [
  "opacity",
  "color",
  "background-color",
  "padding",
  "font-size",
  "line-height",
  "letter-spacing",
  "border-width",
  "border-color",
  "border-radius",
  "outline",
  "outline-offset",
];
export type NavigationMode = "default" | "linear" | "grid";
export type ColorScheme = "auto" | "light" | "dark";

/** Every option, with the same names reveal.js and Slidev use wherever the idea is the same. */
export interface DeckConfig {
  title: string;
  author: string;
  info: string;
  /** When the talk is given, as YYYY-MM-DD. The deck doesn't show it; listings sort by it. */
  date: string;
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
  disableLayout: boolean;
  /** Vertically centre each slide's content. */
  center: boolean;
  controls: boolean | "speaker";
  controlsLayout: "bottom-right" | "edges";
  controlsTutorial: boolean;
  controlsBackArrows: "faded" | "hidden" | "visible";
  progress: boolean;
  slideNumber: boolean | SlideNumberFormat | SlideNumberFunction;
  showSlideNumber: "all" | "print" | "speaker";
  hash: boolean;
  hashOneBasedIndex: boolean;
  history: boolean;
  respondToHashChanges: boolean;
  keyboard: boolean;
  keyboardCondition: "focused" | KeyboardConditionFunction | null;
  focusBodyOnPageVisibilityChange: boolean;
  overview: boolean;
  touch: boolean;
  loop: boolean;
  rtl: boolean;
  navigationMode: NavigationMode;
  shuffle: boolean;
  fragments: boolean;
  fragmentInURL: boolean;
  embedded: boolean;
  postMessage: boolean;
  postMessageEvents: boolean;
  help: boolean;
  pause: boolean;
  showNotes: boolean | "separate-page";
  autoPlayMedia: boolean | null;
  preloadIframes: boolean | null;
  autoAnimate: boolean;
  autoAnimateEasing: string;
  autoAnimateDuration: number;
  autoAnimateUnmatched: boolean;
  autoAnimateStyles: string[];
  autoAnimateMatcher: AutoAnimateMatcher | null;
  /**
   * Milliseconds between automatic steps; 0: only the slides that set their own, false: none,
   * not even those.
   */
  autoSlide: number | false;
  autoSlideStoppable: boolean;
  autoSlideMethod: string;
  /** Seconds per slide for the pacing timer, or null. */
  defaultTiming: number | null;
  /** Total seconds for the pacing timer, or null. */
  totalTime: number | null;
  mouseWheel: boolean;
  previewLinks: boolean;
  transition: Transition;
  transitionSpeed: TransitionSpeed;
  backgroundTransition: Transition;
  parallaxBackgroundImage: string;
  parallaxBackgroundSize: string;
  parallaxBackgroundHorizontal: number | null;
  parallaxBackgroundVertical: number | null;
  viewDistance: number;
  mobileViewDistance: number;
  hideInactiveCursor: boolean;
  hideCursorTime: number;
  view: "slide" | "scroll";
  scrollLayout: "full" | "compact";
  scrollProgress: "auto" | boolean;
  scrollSnap: "mandatory" | "proximity" | false;
  /**
   * Viewport width under which the scroll view switches on by itself; 0 (the default) never does
   * — a phone gets the same stage, letterboxed, and `?view=scroll` stays an explicit choice.
   */
  scrollActivationWidth: number;
  theme: string;
  /**
   * The themes the deck ships besides `theme`, first in its theme menu and in this order:
   * built-ins, packages or folders, resolved like `theme` (the Vite plugin imports their CSS), or
   * classes main.tsx's CSS defines. The menu then offers every first-party theme not listed
   * (seventeen in all), each loaded only when picked; a list orders the menu, it does not narrow it.
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
   * Where `{monaco}` editors get the types of the packages they import (monaco/types.ts):
   * "auto" (the deck's installed ones in a build, else the CDN), "local", "cdn" or "none".
   */
  monacoTypes: "auto" | "local" | "cdn" | "none";
  /**
   * Packages the editors know: their types are acquired up front, and `{monaco-run}` imports
   * them at these versions. A list (`["zod", "lodash-es@4"]`) or a map (`{ zod: "^3.23" }`).
   */
  monacoPackages: string[] | Record<string, string>;
  /** Packages never to fetch types for. */
  monacoTypesIgnore: string[];
  /**
   * Where `{monaco-run}` resolves a bare import (`import { z } from "zod"`): a CDN base
   * (`https://esm.sh`, the default) or a template with `{name}`, `{version}` and `{path}`;
   * false keeps bare imports an error.
   */
  monacoRunImports: string | false;
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
  /**
   * The phone remote without a room or a dev server: `relay` is the WebSocket address of a
   * `kadal-deck relay` (`wss://…`), where a build's presenter view and phone page meet — a deck on
   * GitHub Pages, Netlify, S3 or any static host. `?relay=wss://…` on the presenter view's
   * address does the same for that tab. Null (the default): no relay. A deck with a room pairs
   * through the room; `kadal-deck dev` through the dev server.
   */
  remote: { relay: string | null };
  drawings: DrawingsConfig;
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
   * Web fonts: Google Fonts families as written (`["Inter:wght@400;600"]`), or an object —
   * `{ sans, heading, serif, mono, weights, italic, provider: google|bunny|none, local, fallbacks }`
   * — which also points the theme's font tokens at them (theming/fonts.ts).
   */
  fonts: FontsInput;
  /**
   * The link preview and search tags (core/head.ts), by unhead's names: `ogImage`
   * (`auto` photographs slide 1 into og-image.png at build; a path or URL uses that), `ogUrl`,
   * `ogTitle`, `ogDescription`, `twitterCard`, `twitterSite`, `canonical`, `themeColor`, and any
   * other key as a meta tag of its own. Written into the built index.html.
   */
  seoMeta: Record<string, string>;
  /** The page's language: `<html lang>` and og:locale. Empty leaves index.html's. */
  lang: string;
  /** The tab icon: a file in public/ (`/logo.svg`) or a URL. The PWA's icon, when it is local. */
  favicon: string;
  /**
   * `kadal-deck build` makes the deck an installable web app that presents offline: a web
   * manifest, icons, and a service worker that precaches the build (vite/pwa.ts). Never in dev;
   * `kadal-deck publish` leaves it out unless `--pwa`. An object sets { name, shortName,
   * themeColor, backgroundColor, display }.
   */
  pwa: boolean | Record<string, string>;
  /**
   * At build, download the remote images, media, fonts (Google Fonts' CSS and its files) and CSS
   * `url()`s the deck names into dist/remote-assets/ and point the deck at the copies, so it
   * presents with no network (vite/remote-assets.ts). Cached in .kadal-deck/cache.
   */
  bundleRemoteAssets: boolean;
  /**
   * Frontmatter every slide gets unless it sets the key itself, e.g.
   * `{ layout: center, transition: fade }`. A theme's defaults sit beneath it.
   */
  defaults: Frontmatter;
  /** The PlantUML server ```plantuml fences render with: `<server>/svg/<encoded source>`. */
  plantUmlServer: string;
  /**
   * Comark (formerly MDC) syntax in the slides: `:badge[New]{tone="good"}`, `[text]{.class}`,
   * `::callout{type="warn"}` … `::` blocks with `#slot` sections (compiler/remark-comark.ts).
   */
  comark: boolean;
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
  /**
   * Media credits (credits/model.ts): `true` collects every attributed GIF, sticker, meme, emoji
   * set, icon set and credited image the slides use, puts a "Credits" slide before the last slide
   * (`slide: "end"`: after it), and a small link to it in the corner of every other slide
   * (`footer: false`: none). `title` names the slide and the link. Once compiled, the value is the
   * collected credits (`ResolvedCredits`) that `<Credits />` draws.
   */
  credits: boolean | { slide?: "before-last" | "end" | false; footer?: boolean; title?: string };
  /**
   * The presenter's timer: "stopwatch" counts up, "countdown" counts down from `duration`.
   * Both pause, resume and reset, show a progress bar when the talk has a length, and
   * go into overtime past it; the pacing badge (ahead/behind) works with either.
   */
  timer: "stopwatch" | "countdown";
  /**
   * How long the talk is, in seconds once read: `30min`, `1h`, `1h30m`, `90s`, `25:00`, or a number
   * of minutes. The countdown runs from it and the progress bar fills to it;
   * pacing spreads it over the slides when there is no `totalTime`. Null: the planned length is
   * `totalTime`, else the slides' `timing` added up, else (for a countdown) thirty minutes.
   */
  duration: number | null;
  /**
   * The right-click menu on the slides: true (always), false (never), "dev" (only under
   * `kadal-deck dev`) or "build" (only in a built deck). Shift + right-click always gives the
   * browser's own menu.
   */
  contextMenu: boolean | "dev" | "build";
}

export const DEFAULT_CONFIG: DeckConfig = {
  title: "Untitled deck",
  author: "",
  info: "",
  date: "",
  width: 1920,
  height: 1080,
  margin: 0,
  minScale: 0.2,
  maxScale: 2,
  disableLayout: false,
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
  respondToHashChanges: true,
  keyboard: true,
  keyboardCondition: null,
  focusBodyOnPageVisibilityChange: true,
  overview: true,
  touch: true,
  loop: false,
  rtl: false,
  navigationMode: "default",
  shuffle: false,
  fragments: true,
  fragmentInURL: true,
  embedded: false,
  postMessage: true,
  postMessageEvents: false,
  help: true,
  pause: true,
  showNotes: false,
  autoPlayMedia: null,
  preloadIframes: null,
  autoAnimate: true,
  autoAnimateEasing: "ease",
  autoAnimateDuration: 1,
  autoAnimateUnmatched: true,
  autoAnimateStyles: AUTO_ANIMATE_STYLES,
  autoAnimateMatcher: null,
  autoSlide: 0,
  autoSlideStoppable: true,
  autoSlideMethod: "next",
  defaultTiming: null,
  totalTime: null,
  mouseWheel: false,
  previewLinks: false,
  transition: "slide",
  transitionSpeed: "default",
  backgroundTransition: "fade",
  parallaxBackgroundImage: "",
  parallaxBackgroundSize: "",
  parallaxBackgroundHorizontal: null,
  parallaxBackgroundVertical: null,
  viewDistance: 3,
  mobileViewDistance: 2,
  hideInactiveCursor: true,
  hideCursorTime: 5000,
  view: "slide",
  scrollLayout: "compact",
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
  monacoTypes: "auto",
  monacoPackages: [],
  monacoTypesIgnore: [],
  monacoRunImports: "https://esm.sh",
  live: { api: "/api", room: null, turnstile: null },
  remote: { relay: null },
  drawings: { enabled: true, persist: true, presenterOnly: false, syncAll: true, perClick: false },
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
  lang: "",
  favicon: "",
  pwa: false,
  bundleRemoteAssets: false,
  defaults: {},
  plantUmlServer: "https://www.plantuml.com/plantuml",
  comark: false,
  notesAutoRuby: {},
  katex: {},
  mermaid: {},
  transitions: {},
  addons: [],
  themeConfig: {},
  layers: { presenter: true, overview: false },
  credits: false,
  timer: "stopwatch",
  duration: null,
  contextMenu: true,
};

/** Headmatter and deck.config.ts both layer over the defaults; nested objects merge one level. */
/** What a deck.config.ts or headmatter may set: any option, with the nested groups partial too. */
export type DeckConfigInput = Partial<
  Omit<DeckConfig, "live" | "remote" | "drawings" | "seoMeta" | "glossary" | "narration" | "layers">
> & {
  layers?: Partial<DeckConfig["layers"]>;
  remote?: Partial<DeckConfig["remote"]>;
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
    remote: { ...DEFAULT_CONFIG.remote },
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
          key === "remote" ||
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
  // Slidev's timer keys: `duration: 30min`, `timer: countdown` (core/timer.ts).
  out.duration = parseDuration(out.duration);
  out.timer = parseTimerMode(out.timer);
  if (!["dev", "build"].includes(out.contextMenu as string))
    out.contextMenu = out.contextMenu !== false;
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
  /** This slide's auto-animate easing, duration (seconds) and unmatched fade; null: the deck's. */
  autoAnimateEasing: string | null;
  autoAnimateDuration: number | null;
  autoAnimateUnmatched: boolean | null;
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
  /**
   * Whether the author gave this slide a background of its own (`background:` and friends), as
   * opposed to the transparent one a forced `colorScheme` adds. The slide wears `has-background`
   * for it, and a theme's decorative backdrop (a cover fill, a sun, a block image) steps aside.
   */
  ownBackground: boolean;
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
    // A background video loops unless told not to (`loop: false`, `backgroundVideoLoop: false`).
    videoLoop: true,
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
    // A host's library item (core/premium.ts): a component by name, before the image test below
    // reads its slash as a path.
    if (isPremiumName(s)) base.component = s;
    else if (GRADIENT.test(s)) base.gradient = s;
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
  const own = resolveBackground(fm);
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
    autoAnimateEasing: str(fm.autoAnimateEasing),
    autoAnimateDuration: num(fm.autoAnimateDuration),
    autoAnimateUnmatched:
      typeof fm.autoAnimateUnmatched === "boolean" ? fm.autoAnimateUnmatched : null,
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
          ...(own ?? resolveBackground({ background: "transparent" })!),
          scheme: colorScheme,
        }
      : own,
    ownBackground: own !== null,
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
  /**
   * Where the host quick-edits this deck (an http(s) URL): the presenter view's Edit button and
   * `present.edit` open it with `?slide=h.v` (presenter/EditButton.tsx). Absent: no Edit button.
   */
  edit?: string;
  /**
   * Where the host serves its premium library (`pro/` backgrounds and layouts, core/premium.ts):
   * an http(s) URL or a same-site path, under which `catalog.json` and the item modules sit.
   * Absent: `pro/` names fall back to the theme's own, and nothing is fetched.
   */
  premium?: string;
  /**
   * Where `<Emoji>` finds its image sets (components/media.tsx): an https URL or a same-site path
   * (`/emoji`). Without one, `https://decks.kadal.cc/emoji`, so a deck works anywhere.
   */
  emoji?: string;
  /**
   * Where the presenter's "Report a bug", "Request a feature" and "Send feedback" go (an http(s)
   * URL, or a same-site path): each is a JSON POST with the presenter's ticket, answered `{ id }`
   * (presenter/Feedback.tsx has the body). Absent: the presenter view shows none of the three.
   */
  feedback?: string;
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
  if (typeof o.edit === "string" && /^https?:\/\/[^\s/]+\S*$/.test(o.edit)) {
    try {
      const u = new URL(o.edit);
      if (u.protocol === "https:" || u.protocol === "http:") out.edit = u.toString();
    } catch {
      /* not a URL: ignored */
    }
  }
  const premium = premiumBase(o.premium);
  if (premium) out.premium = premium;
  if (typeof o.emoji === "string" && /^(https?:\/\/[^\s"'<>]+|\/(?!\/)[\w./-]*)$/.test(o.emoji))
    out.emoji = o.emoji.replace(/\/+$/, "");
  // An http(s) URL with a host, or a same-site path ("//elsewhere" is neither).
  if (
    typeof o.feedback === "string" &&
    /^(https?:\/\/[^\s"'<>/]+[^\s"'<>]*|\/(?!\/)[^\s"'<>]*)$/.test(o.feedback)
  )
    out.feedback = o.feedback;
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
