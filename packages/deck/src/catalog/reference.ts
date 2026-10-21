import type {
  BackgroundFamily,
  CliCommand,
  CodeMetaOption,
  LayoutInfo,
  LiveFeature,
  NamedInfo,
  QueryParamInfo,
  RouteInfo,
  ThemeInfo,
  ValueShape,
} from "./types.ts";

/**
 * The hand-written half of the catalog: prose the source does not carry. Every list here is
 * checked against the engine by catalog.test.ts, so a name can't be added on one side only.
 */

export const LAYOUT_META: Record<string, Omit<LayoutInfo, "name">> = {
  default: {
    summary:
      "Content from the top left, the theme's padding around it. The default for every slide but the first.",
    keys: [],
    slots: [],
    example: "---\nlayout: default\n---\n\n## A heading\n\nBody text.",
  },
  center: {
    summary: "Everything centred on both axes.",
    keys: [],
    slots: [],
    example: "---\nlayout: center\n---\n\n# Thank you",
  },
  cover: {
    summary: "The title slide: large title, subtitle and author. The first slide's default.",
    keys: [],
    slots: [],
    example: "---\ntitle: My talk\nlayout: cover\n---\n\n# My talk\n\nA subtitle · Your name",
  },
  intro: {
    summary: "An introduction: who you are and what the talk covers.",
    keys: [],
    slots: [],
    example: "---\nlayout: intro\n---\n\n# Hi, I'm Ana\n\nI build maps.",
  },
  section: {
    summary: "A section divider: one big heading that starts a part of the talk.",
    keys: [],
    slots: [],
    example: "---\nlayout: section\n---\n\n# Part two: the results",
  },
  end: {
    summary: "The closing slide.",
    keys: [],
    slots: [],
    example: "---\nlayout: end\n---\n\n# Thanks!",
  },
  fact: {
    summary: "One number or fact, very large, with a line of context.",
    keys: [],
    slots: [],
    example: "---\nlayout: fact\n---\n\n# 93%\n\nof the cells were covered",
  },
  quote: {
    summary: "A quotation, set large, with its source.",
    keys: [],
    slots: [],
    example:
      "---\nlayout: quote\n---\n\n> Simplicity is prerequisite for reliability.\n\n— Edsger Dijkstra",
  },
  statement: {
    summary: "One statement, centred and large.",
    keys: [],
    slots: [],
    example: "---\nlayout: statement\n---\n\n# Ship small, ship often.",
  },
  full: {
    summary: "Content edge to edge, no padding — for a full-bleed image, map or diagram.",
    keys: [],
    slots: [],
    example: "---\nlayout: full\n---\n\n![](/map.png)",
  },
  none: {
    summary: "No wrapper at all: the slide's MDX is the slide.",
    keys: [],
    slots: [],
    example: '---\nlayout: none\n---\n\n<div className="my-own-grid">…</div>',
  },
  "two-cols": {
    summary: "Two columns: everything before `::right::` on the left, the rest on the right.",
    keys: [],
    slots: ["default", "right"],
    example:
      "---\nlayout: two-cols\n---\n\n## Before\n\nThe old way.\n\n::right::\n\n## After\n\nThe new way.",
  },
  image: {
    summary: "A full-slide image (frontmatter `image`) with the content over it.",
    keys: ["image", "backgroundSize"],
    slots: [],
    example: "---\nlayout: image\nimage: /photo.jpg\n---\n\n# Over the image",
  },
  "image-left": {
    summary: "An image filling the left half; content on the right.",
    keys: ["image", "backgroundSize"],
    slots: [],
    example: "---\nlayout: image-left\nimage: /photo.jpg\n---\n\n## The content side",
  },
  "image-right": {
    summary: "Content on the left; an image filling the right half.",
    keys: ["image", "backgroundSize"],
    slots: [],
    example:
      "---\nlayout: image-right\nimage: /photo.jpg\nbackgroundSize: contain\n---\n\n## The content side",
  },
  iframe: {
    summary:
      "A live web page (frontmatter `url`) filling the slide, loaded only while the slide is near.",
    keys: ["url", "poster", "posterUrl", "posterWait"],
    slots: [],
    example: "---\nlayout: iframe\nurl: https://example.com\n---",
  },
  "iframe-left": {
    summary: "A live web page on the left half; content on the right.",
    keys: ["url", "poster", "posterUrl", "posterWait"],
    slots: [],
    example:
      "---\nlayout: iframe-left\nurl: https://example.com\n---\n\n## What you are looking at",
  },
  "iframe-right": {
    summary: "Content on the left; a live web page on the right half.",
    keys: ["url", "poster", "posterUrl", "posterWait"],
    slots: [],
    example:
      "---\nlayout: iframe-right\nurl: https://example.com\n---\n\n## What you are looking at",
  },
};

export const BACKGROUND_META: Record<
  string,
  { family: BackgroundFamily; summary: string; aliases?: string[] }
> = {
  "gradient-mesh": {
    family: "ambient",
    summary: "Slow, drifting, blurred colour blobs.",
    aliases: ["mesh"],
  },
  aurora: { family: "ambient", summary: "Soft northern-lights bands." },
  waves: { family: "ambient", summary: "Layered noise waves." },
  lines: { family: "ambient", summary: "Flowing gradient lines." },
  beams: { family: "ambient", summary: "Thin beams of light falling." },
  sparkles: { family: "ambient", summary: "A twinkling particle field." },
  starfield: { family: "ambient", summary: "Stars drifting slowly." },
  grid: { family: "ambient", summary: "A fine grid fading at the edges." },
  dots: { family: "ambient", summary: "A dot matrix." },
  noise: { family: "ambient", summary: "Film grain." },
  spotlight: { family: "ambient", summary: "A soft radial glow at a point." },
  topo: {
    family: "quiet",
    summary: "Topographic contour lines with index lines.",
    aliases: ["contours"],
  },
  glows: { family: "quiet", summary: "Large slow glows of colour." },
  graticule: { family: "quiet", summary: "A latitude/longitude graticule." },
  hex: { family: "quiet", summary: "A hexagonal grid." },
  constellation: { family: "quiet", summary: "Points joined to their near neighbours, drifting." },
  vignette: { family: "quiet", summary: "A darkened edge." },
  rays: { family: "quiet", summary: "Light rays from a point." },
  stripes: { family: "quiet", summary: "Diagonal stripes." },
  sweep: {
    family: "quiet",
    summary: "A slow animated gradient sweep across two or three colours.",
  },
  globe: {
    family: "map",
    summary: "A wire globe off to one side, turning slowly, with day and night sides.",
  },
  lattice: {
    family: "map",
    summary: "A grid that keeps zooming into one of its cells, three levels deep.",
  },
  thiessen: {
    family: "map",
    summary: "Seeds drifting under their Voronoi (Thiessen) polygons.",
    aliases: ["voronoi"],
  },
  cells: {
    family: "map",
    summary: "Reports landing on a lattice: cells light up, ripple and go dark.",
  },
  compass: { family: "map", summary: "A compass rose with its degree ring turning." },
  neatline: {
    family: "map",
    summary: "A map sheet's frame: neatline, coordinate ticks, north arrow, scale bar.",
  },
  scan: { family: "map", summary: "A graticule swept by a satellite pass." },
  track: { family: "map", summary: "A GPS trail wandering, with a pulsing head." },
  raster: {
    family: "map",
    summary: "A choropleth of cells classed by a drifting field, with its legend.",
    aliases: ["choropleth"],
  },
  plane: {
    family: "map",
    summary:
      'A dotted ground plane in oblique projection for exploded figures; locks onto `data-plane="origin"`/`"unit"` marks in the slide.',
    aliases: ["floor"],
  },
  signer: { family: "sign", summary: "A landmark skeleton signing, with a fading wrist trail." },
  variants: { family: "sign", summary: "One signer drawn as several synthetic variants at once." },
  handshapes: { family: "sign", summary: "A calm field of hands morphing through handshapes." },
  trails: {
    family: "sign",
    summary: "Wrist paths through signing space; `align` adds a time-warped copy (DTW).",
  },
  window: {
    family: "sign",
    summary: "Frames scrolling past a hopping 64-frame recogniser window.",
  },
  embedding: {
    family: "sign",
    summary: "Word clusters around prototypes and a query finding its nearest.",
  },
};

/** Backgrounds that are not components: frontmatter forms the engine resolves itself. */
export const PLAIN_BACKGROUNDS: Array<{ name: string; summary: string; example: string }> = [
  { name: "color", summary: "A flat colour (any CSS colour).", example: 'background: "#0f172a"' },
  {
    name: "gradient",
    summary: "A CSS gradient.",
    example: 'background: "linear-gradient(135deg, #0f172a, #1e3a8a)"',
  },
  {
    name: "image",
    summary: "An image (public/ path or URL), cover by default.",
    example: "background: /photo.jpg",
  },
  {
    name: "video",
    summary: "A looping muted video (.mp4/.webm/.mov/.ogv).",
    example: "background: /loop.mp4",
  },
  {
    name: "iframe",
    summary: "A web page behind the slide.",
    example: "background: { iframe: https://example.com, interactive: false }",
  },
  {
    name: "tint",
    summary:
      "A soft diagonal wash of one colour (`fill:` or `tint:`), alone or under a component background whose `color` is its stroke.",
    example:
      'background: { component: topo, color: "rgba(5,150,105,0.55)", fill: "rgba(5,150,105,0.12)" }',
  },
];

export const THEMES: ThemeInfo[] = [
  {
    name: "minimal",
    summary: "The default: black on white, a wide sans serif, one accent. Dark mode inverts.",
    css: "@kadal/deck/themes/minimal.css",
    scheme: "light",
  },
  {
    name: "rla",
    summary:
      "Zinc-950 with a blue→violet ramp, dot-matrix headings, made for the animated backgrounds.",
    css: "@kadal/deck/themes/rla.css",
    scheme: "dark",
  },
  {
    name: "stack",
    summary: "An emerald accent on warm neutrals, Inter, product-like.",
    css: "@kadal/deck/themes/stack.css",
    scheme: "light",
  },
];

export const TRANSITION_META: Record<string, string> = {
  none: "Cut straight to the next slide.",
  fade: "Cross-fade.",
  slide: "Slide horizontally (vertically within a stack). The default.",
  convex: "Slide with a convex 3D turn.",
  concave: "Slide with a concave 3D turn.",
  zoom: "Zoom into the next slide.",
  "view-transition":
    "The browser's View Transitions API: elements with matching view-transition-name morph.",
};

export const TRANSITION_SPEED_META: Record<string, string> = {
  default: "0.6 s.",
  fast: "0.3 s.",
  slow: "1 s.",
};

export const CLICK_EFFECT_META: Record<string, string> = {
  "fade-in": "Fade in (the default).",
  "fade-out": "Start visible, fade out.",
  "fade-up": "Fade in moving up.",
  "fade-down": "Fade in moving down.",
  "fade-left": "Fade in moving left.",
  "fade-right": "Fade in moving right.",
  "fade-in-then-out": "Fade in, then out at the next step.",
  "fade-in-then-semi-out": "Fade in, then dim at the next step.",
  "current-visible": "Visible only during its own step.",
  grow: "Scale up.",
  shrink: "Scale down.",
  strike: "Strike through.",
  "semi-fade-out": "Dim to half opacity.",
  "highlight-red": "Turn red.",
  "highlight-green": "Turn green.",
  "highlight-blue": "Turn blue.",
  "highlight-current-red": "Red only during its own step.",
  "highlight-current-green": "Green only during its own step.",
  "highlight-current-blue": "Blue only during its own step.",
};

export const CLICK_AT: NamedInfo[] = [
  { name: "(omitted)", summary: "One step after the previous click element — the usual case." },
  {
    name: '"+N"',
    summary: 'N steps after the previous element; "+0" shares its step (same as <After>).',
  },
  { name: "N", summary: "Absolute step N; 0 means always shown and takes no step." },
  {
    name: "[from, to]",
    summary: "Visible from step `from` until step `to`, hidden again from `to` on.",
  },
  { name: "hide", summary: "With `hide`, the element starts visible and disappears at its step." },
  { name: "clicks: N", summary: "Slide frontmatter: force the slide's total number of steps." },
];

export const CODE_META: CodeMetaOption[] = [
  {
    syntax: "```ts",
    summary: "Highlighted with Shiki at build time (light and dark themes).",
    example: "```ts\nconst a = 1\n```",
  },
  {
    syntax: "{2-3|5|all}",
    summary:
      "Line highlights, one set per click step: ranges, commas, `all`/`*`, `none`. N sets = N-1 clicks.",
    example: "```ts {1|2-3|all}\nconst a = 1\nconst b = 2\nconst c = 3\n```",
  },
  {
    syntax: "{hide|…}",
    summary: "Hide the whole block until its first step.",
    example: "```ts {hide|1|2}\na\nb\n```",
  },
  {
    syntax: "[file.ts]",
    summary: "A title bar with a file name.",
    example: "```ts [app.ts]\nexport {}\n```",
  },
  {
    syntax: "{lines:true}",
    summary:
      "Options object after the steps: lines (line numbers), startLine, maxHeight (CSS; scrolls beyond).",
    example: "```ts {2}{lines:true,startLine:10,maxHeight:'300px'}\na\nb\n```",
  },
  {
    syntax: 'data-line-numbers="3-5|8"',
    summary:
      "reveal.js's attribute spelling: line numbers on, with optional steps; data-ln-start-from sets the first number.",
    example: '```js data-line-numbers="1|2"\na\nb\n```',
  },
  {
    syntax: "````md magic-move",
    summary:
      "A 4-backtick md fence holding one code fence per step: the code morphs between them on each click.",
    example: "````md magic-move\n```ts\nlet x = 1\n```\n```ts\nconst x = 1\n```\n````",
  },
];

export const ROUTES: RouteInfo[] = [
  {
    path: "/<slug>/",
    summary: "The deck. `#/h/v/click` or `#/<slide-id>` addresses a slide and step.",
  },
  {
    path: "/<slug>/presenter",
    summary:
      "Presenter view: current + next slide, notes with click markers, timer, tools, the room panel.",
  },
  {
    path: "/<slug>/join",
    summary: "The audience page (also /audience): follow along, react, ask, vote.",
  },
  {
    path: "/<slug>/remote",
    summary:
      "The phone remote: next/back, blackout, focus labels, a slide list, pen, zoom, a laser aimed by touch on a live copy of the slide or by moving the phone, the notes for this step, the timer and a wake lock. Paired from the presenter view's Phone remote QR, a one-time code that changes every 30 seconds: `remote#pair=CODE` with a room, `remote?pair=CODE` on `kadal-deck dev`. One phone at a time; the newest to scan takes over. Pass `remote: RemotePage` (from `@kadal/deck/remote`) in `<Deck pages>`.",
  },
  { path: "/<slug>/notes", summary: "Every speaker note on one page." },
  { path: "/<slug>/stats", summary: "Views, dwell per slide, sessions, questions, reactions." },
];

export const QUERY_PARAMS: QueryParamInfo[] = [
  {
    param: "?print-pdf",
    summary:
      "Every slide (and click step) as a printable page; what export drives. Also ?print=pdf.",
  },
  {
    param: "?view=scroll",
    summary: "Read the deck as a scrolling page (?view=slide forces the stage).",
  },
  { param: "?presenter", summary: "Open as presenter." },
  { param: "?embedded", summary: "Embedded mode: no global key handling." },
  {
    param: "?projector",
    summary:
      "A look-only window for a second screen or a call: follows the presenter, ignores input.",
  },
  {
    param: "?narrate",
    summary: "Show the narration bar on the deck itself, to rehearse on the main screen (R does too).",
  },
  {
    param: "?at",
    summary:
      "Marks a link as being ABOUT its slide (share links): lands there instead of following.",
  },
];

export const LIVE: LiveFeature[] = [
  {
    name: "Following",
    summary:
      "Viewers start in step with the presenter; any move of their own stops following, a pill offers to follow again.",
    components: [],
  },
  {
    name: "Join",
    summary: "The audience opens /<slug>/join (QR on a slide) — nothing to install.",
    components: ["QrJoin", "Presence"],
  },
  {
    name: "Reactions",
    summary: "Emoji reactions float over the presenter's slide and every phone.",
    components: ["Reactions"],
  },
  {
    name: "Questions",
    summary: "Questions with upvotes; the presenter marks them answered.",
    components: ["Questions"],
  },
  {
    name: "Polls",
    summary: "Choice, multi-choice, rating and word polls, opened from the presenter view.",
    components: ["Poll", "WordCloud"],
  },
  {
    name: "Quizzes",
    summary: "Timed questions with points for speed and a leaderboard.",
    components: ["Quiz", "Leaderboard"],
  },
  {
    name: "Pace and hands",
    summary: "Slower/faster feedback and raised hands in the presenter's room panel.",
    components: ["Pace"],
  },
  {
    name: "Shared ink",
    summary: "The presenter's drawings, confetti and shared term cards reach every screen.",
    components: ["Confetti", "Term"],
  },
  {
    name: "Phone remote",
    summary:
      "The presenter view's Phone remote button shows a QR; the phone that scans it runs commands in that window (the same ones the keyboard runs). One phone at a time: the QR's code works once and changes every 30 seconds, the newest phone to scan takes over, and a paired phone reconnects with its lease. With a room the room pairs it; on `kadal-deck dev` the dev server relays it (`--host` for the network, `--https` for the air pointer's motion sensors).",
    components: [],
  },
  {
    name: "Turning it on",
    summary:
      "`kadal-deck publish` gives a deck a room on deck.kadal.cc; self-hosted, set `live.api` (and run a room server against @kadal/deck/protocol). Offline decks render live components as placeholders.",
    components: [],
  },
];

export const CLI: CliCommand[] = [
  {
    name: "new",
    usage: "kadal-deck new <dir> [--title t] [--yes] [--no-install] [--pm npm|pnpm|yarn|bun]",
    summary: "Scaffold a deck (non-interactive).",
    json: true,
  },
  {
    name: "dev",
    usage: "kadal-deck dev [--https] [vite flags]",
    summary:
      "The deck with live reload, and the phone remote's relay. `--host` makes it reachable from a phone on the same network; `--https` serves a self-signed certificate (made with openssl) so the phone's motion sensors work.",
    json: false,
  },
  {
    name: "build",
    usage: "kadal-deck build [vite flags]",
    summary: "dist/ for any static host.",
    json: false,
  },
  {
    name: "check",
    usage: "kadal-deck check [--json] [--no-compile]",
    summary:
      "Lint the deck: frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary, code meta.",
    json: true,
  },
  {
    name: "info",
    usage: "kadal-deck info [topic] [--search q] [--json]",
    summary: "Print the catalog: components, layouts, backgrounds, frontmatter…",
    json: true,
  },
  {
    name: "screenshot",
    usage:
      "kadal-deck screenshot [--slide N|all] [--out dir] [--theme t] [--scheme light|dark] [--width px] [--url u] [--dev] [--json]",
    summary: "PNG of slides, every click revealed (build + preview, headless Chromium).",
    json: true,
  },
  {
    name: "export",
    usage:
      "kadal-deck export [--png] [--pptx] [--no-pdf] [--vector-pdf] [--out dir] [--scale n] [--url u] [--json]",
    summary:
      "PDF/PNG/PPTX into export/. The PDF looks like the web in every viewer: each page is a picture of the slide with its text printed over it as text. --vector-pdf prints with the browser alone.",
    json: true,
  },
  {
    name: "login",
    usage: "kadal-deck login [--host url] [--json]",
    summary: "Sign this machine in (opens the browser).",
    json: true,
  },
  {
    name: "logout",
    usage: "kadal-deck logout [--json]",
    summary: "Forget the saved token.",
    json: true,
  },
  {
    name: "whoami",
    usage: "kadal-deck whoami [--json]",
    summary: "Who is signed in (exit 3 when nobody).",
    json: true,
  },
  {
    name: "publish",
    usage: "kadal-deck publish [--slug s] [--workspace w] [--title t] [--host url] [--json]",
    summary: "Build and publish to a host; prints the URL.",
    json: true,
  },
  {
    name: "narrate",
    usage: "kadal-deck narrate [--voice id] [--dtype fp32|fp16|q8|q4|q4f16] [--force] [--setup] [--json]",
    summary:
      "Bake the narration: every notes segment spoken by Kokoro into public/narration/ (MP3 or Opus with ffmpeg, else WAV) and public/narration.json; skips clips that exist. --setup installs kokoro-js.",
    json: true,
  },
  {
    name: "mcp",
    usage: "kadal-deck mcp [--dir path] [--allow-outside]",
    summary: "A Model Context Protocol server on stdio, for AI agents.",
    json: false,
  },
];

export const EXIT_CODES = [
  { code: 0, meaning: "Success (check: no errors; warnings allowed)." },
  {
    code: 1,
    meaning: "The command failed (check found errors, a build failed, the host refused).",
  },
  {
    code: 2,
    meaning:
      "Usage error: unknown command or flag, bad value, `new` into a folder that is not empty.",
  },
  { code: 3, meaning: "Not signed in, or the token was rejected: run `kadal-deck login`." },
  {
    code: 4,
    meaning:
      "Missing prerequisite: no deck.mdx here, dependencies not installed, or Playwright/Chromium missing.",
  },
];

// ── frontmatter ───────────────────────────────────────────────────────────────────────────────

const S = (text = "string"): ValueShape => ({ text, variants: [{ type: "string" }] });
const N = (): ValueShape => ({ text: "number", variants: [{ type: "number" }] });
const B = (): ValueShape => ({ text: "boolean", variants: [{ type: "boolean" }] });
const E = (...values: string[]): ValueShape => ({
  text: values.map((v) => JSON.stringify(v)).join(" | "),
  variants: [{ type: "string", enum: values }],
});

/** Descriptions for DeckConfig fields whose source has no doc comment. */
export const DECK_KEY_DOCS: Record<string, string> = {
  title: "The deck's title (browser tab, table of contents, publish).",
  author: "Who gives the talk.",
  info: "A line about the deck (Markdown).",
  height: "The authored height in px; with width, the stage every screen scales.",
  minScale: "Smallest scale the stage may shrink to.",
  maxScale: "Largest scale the stage may grow to.",
  controls: 'Show the navigation arrows; "speaker" shows them only in the presenter view.',
  controlsLayout: "Where the arrows sit.",
  controlsTutorial: "Hint at vertical slides the first time.",
  controlsBackArrows: "How the back arrows look.",
  progress: "The progress bar along the bottom.",
  slideNumber:
    'Show slide numbers: true, or a format — "h.v", "h/v", "c" (current), "c/t" (current/total).',
  showSlideNumber: "Where slide numbers show.",
  hash: "Keep the URL hash in step with the slide.",
  hashOneBasedIndex: "1-based slide numbers in the hash.",
  history: "Push a history entry per slide (Back walks the slides).",
  keyboard: "Keyboard navigation on.",
  overview: "The overview grid (O / Esc).",
  touch: "Swipe navigation.",
  loop: "Wrap from the last slide to the first.",
  rtl: "Right-to-left.",
  navigationMode: '"default", "linear" (arrows walk every slide) or "grid" (columns stay aligned).',
  shuffle: "Shuffle the slides on load.",
  fragments: "Clicks/fragments on; off shows every step at once.",
  fragmentInURL: "Include the click step in the hash.",
  embedded: "The deck lives inside another page.",
  help: "The ? keyboard help.",
  pause: "B / . blacks the screen out.",
  showNotes: 'Print notes with the slides: true (in a box) or "separate-page".',
  autoPlayMedia: "Autoplay media on every slide (null = per element).",
  autoAnimate: "Allow auto-animate between slides that set `autoAnimate`.",
  autoAnimateEasing: "CSS easing for auto-animate.",
  autoAnimateDuration: "Seconds.",
  autoAnimateUnmatched: "Fade in elements without a match.",
  autoSlideStoppable: "Any input stops auto-slide.",
  mouseWheel: "Scroll-wheel navigation.",
  previewLinks: "Open links in an overlay.",
  transition: "Slide transition (see transitions).",
  transitionSpeed: "default · fast · slow.",
  backgroundTransition: "Transition for backgrounds.",
  viewDistance: "Slides kept mounted on either side.",
  mobileViewDistance: "The same, on phones.",
  hideInactiveCursor: "Hide an idle cursor.",
  hideCursorTime: "Milliseconds before it hides.",
  view: '"slide" (the stage) or "scroll" (a page).',
  scrollProgress: "The scroll view's progress bar.",
  scrollSnap: "Scroll snapping in the scroll view.",
  theme: "The theme: minimal, rla, stack, or one your CSS defines as .theme-<name>.",
  themes: "Themes the theme menu offers (main.tsx must import their CSS).",
  colorScheme: '"auto" (follow the system), "light" or "dark".',
  pdfSeparateFragments: "A page per click step in print/PDF.",
  pdfMaxPagesPerSlide: "Pages a tall slide may spill onto.",
  jumpToSlide: "`:12` / g jumps.",
  search: "/ searches the deck.",
  zoom: "Alt+click zooms into a point; Esc zooms back out.",
  wakeLock: "Keep the screen awake while presenting.",
  selectable: "Text can be selected.",
  lineNumbers: "Line numbers on every code block.",
  magicMoveDuration: "Milliseconds per magic-move morph.",
  drawings: "Drawing: { enabled, persist, presenterOnly, syncAll }.",
  narration:
    'Narration (autoplay rehearsal: the notes read aloud, each `[click]` part at its step, the pages turning by themselves): { enabled ("auto" = when some slide has notes; false turns it off), engine ("auto" · "baked" · "kokoro" · "browser" · "silent"), voice (Kokoro id, default af_heart), rate (0.5–3), gap (ms between steps), silent (a slide without notes: "estimate", "skip" or ms), model (Hugging Face id), dtype ("auto" · fp32 · fp16 · q8 · q4 · q4f16) }. The bar is in the presenter view; on the deck, `?narrate` or R. Kokoro needs `kokoro-js` installed (`kadal-deck narrate --setup`); without it the browser\'s own voice reads. `kadal-deck narrate` bakes clips.',
  reactions: "Audience reactions in the live room.",
  qa: "Audience questions in the live room.",
  polls: "Polls and quizzes in the live room.",
  slug: "The deck's slug; set by the build from the Vite base.",
  badge: "Set by the host; leave it alone.",
  ads: "Set by the host; leave it alone.",
  fonts: 'Google Fonts families to load, e.g. ["Inter:wght@400;600"].',
  seoMeta: "Extra <meta> tags.",
};

/** Deck-level keys that are not DeckConfig fields. */
export const EXTRA_DECK_KEYS = [
  {
    name: "aspectRatio",
    type: N(),
    description: "Slidev spelling: with canvasWidth, sets width and height (16/9 = 1.777…).",
    scope: "deck" as const,
  },
  {
    name: "canvasWidth",
    type: N(),
    description: "Slidev spelling: the stage width used with aspectRatio.",
    scope: "deck" as const,
  },
];

/** Every slide frontmatter key the engine reads. */
export const SLIDE_KEYS = [
  {
    name: "layout",
    type: S(),
    description:
      "The slide's layout (see layouts). Default: cover for the first slide, default after.",
    example: "layout: two-cols",
  },
  {
    name: "class",
    type: {
      text: "string | string[]",
      variants: [{ type: "string" as const }, { type: "array" as const }],
    },
    description: "Extra CSS classes on the slide.",
  },
  {
    name: "id",
    type: S(),
    description: "A stable id: `#/<id>` links here and <Link to> finds it.",
  },
  { name: "routeAlias", type: S(), description: "Slidev's spelling of `id` for links." },
  {
    name: "title",
    type: S(),
    description: "The title the table of contents and search use (default: the first heading).",
  },
  {
    name: "level",
    type: N(),
    description: "Heading level for the table of contents (default: the first heading's depth).",
  },
  {
    name: "hide",
    type: B(),
    description: "Leave the slide out of the talk (still in the file).",
    aliases: ["disabled"],
  },
  { name: "disabled", type: B(), description: "Same as hide." },
  {
    name: "visibility",
    type: E("hidden", "uncounted"),
    description: '"hidden" leaves it out; "uncounted" shows it without a number.',
  },
  { name: "hideInToc", type: B(), description: "Keep the slide out of <Toc>." },
  { name: "transition", type: S(), description: "This slide's transition (see transitions)." },
  {
    name: "transitionSpeed",
    type: E("default", "fast", "slow"),
    description: "This slide's transition speed.",
  },
  { name: "backgroundTransition", type: S(), description: "This slide's background transition." },
  {
    name: "autoAnimate",
    type: {
      text: "boolean | { id: string }",
      variants: [{ type: "boolean" as const }, { type: "object" as const }],
    },
    description:
      "Animate matching elements (same text or data-id) from the previous auto-animate slide.",
  },
  {
    name: "autoAnimateId",
    type: S(),
    description: "Only auto-animate between slides with the same id.",
  },
  { name: "autoAnimateRestart", type: B(), description: "Break the auto-animate chain here." },
  {
    name: "autoSlide",
    type: N(),
    description: "Milliseconds before this slide advances on its own.",
    aliases: ["autoslide"],
  },
  { name: "autoslide", type: N(), description: "reveal.js spelling of autoSlide." },
  { name: "clicks", type: N(), description: "Force the number of click steps." },
  { name: "clicksStart", type: N(), description: "The step the slide opens at." },
  {
    name: "preload",
    type: B(),
    description: "Load the slide's module ahead of time (default true).",
  },
  {
    name: "timing",
    type: N(),
    description: "Seconds planned for this slide (the presenter's pacing timer).",
  },
  {
    name: "state",
    type: {
      text: "string | string[]",
      variants: [{ type: "string" as const }, { type: "array" as const }],
    },
    description: "Adds state-<name> classes while the slide shows (CSS hooks).",
  },
  {
    name: "colorScheme",
    type: E("light", "dark"),
    description: "Force light or dark tokens on this slide (dark background under a light theme).",
  },
  { name: "zoom", type: N(), description: "Scale the slide's content (0.8 fits more)." },
  {
    name: "background",
    type: {
      text: "string | object",
      variants: [{ type: "string" as const }, { type: "object" as const }],
    },
    description:
      "A background: a registered name (aurora…), a colour, a gradient, an image or video path/URL, or { component, ...props } / { image, size, position, opacity } / { iframe, interactive } / { fill | tint }.",
    example: "background: { component: starfield, count: 400 }",
  },
  { name: "backgroundColor", type: S(), description: "reveal.js: flat background colour." },
  { name: "backgroundGradient", type: S(), description: "reveal.js: a CSS gradient." },
  { name: "backgroundImage", type: S(), description: "reveal.js: an image URL." },
  {
    name: "backgroundSize",
    type: S(),
    description: "CSS background-size for the image (also the image layouts).",
  },
  { name: "backgroundPosition", type: S(), description: "CSS background-position." },
  { name: "backgroundRepeat", type: S(), description: "CSS background-repeat." },
  { name: "backgroundOpacity", type: N(), description: "0–1." },
  { name: "backgroundVideo", type: S(), description: "reveal.js: a video URL." },
  { name: "backgroundVideoLoop", type: B(), description: "Loop the background video." },
  {
    name: "backgroundVideoMuted",
    type: B(),
    description: "Mute the background video (default true).",
  },
  { name: "backgroundIframe", type: S(), description: "reveal.js: a page behind the slide." },
  { name: "backgroundInteractive", type: B(), description: "Let the background page take input." },
  {
    name: "image",
    type: S(),
    description: "The image for the image, image-left and image-right layouts.",
  },
  {
    name: "url",
    type: S(),
    description: "The page for the iframe, iframe-left and iframe-right layouts.",
  },
  {
    name: "poster",
    type: S(),
    description: "A picture that stands in for the iframe in print, previews and while it loads.",
  },
  {
    name: "posterUrl",
    type: S(),
    description: "Capture the poster from this address instead of `url`.",
  },
  {
    name: "posterWait",
    type: N(),
    description: "Milliseconds to let the page settle before the poster capture, counted once its network has gone quiet (default 5000).",
  },
  {
    name: "terms",
    type: {
      text: "boolean | { skip: string[] }",
      variants: [{ type: "boolean" as const }, { type: "object" as const }],
    },
    description:
      "false: link no glossary terms automatically on this slide; { skip: [GIS] } leaves some out.",
  },
  {
    name: "src",
    type: S(),
    description: "Include the slides of another .mdx file here (a frontmatter-only slide).",
    example: "src: ./part-two.mdx",
  },
  {
    name: "say",
    type: S(),
    description:
      "What the narrator says on this slide instead of its notes (`[click]` splits it into steps); an empty string keeps it silent.",
    example: 'say: "Here is the plan. [click] First, the data."',
  },
  {
    name: "narration",
    type: {
      text: "false",
      variants: [{ type: "boolean" as const }],
    },
    description:
      "false: the narrator says nothing here (the slide dwells as `narration.silent` says). In the headmatter, false switches narration off for the deck.",
  },
];

/** Allowed values the frontmatter types do not spell out. */
export const SUGGEST = {
  layout: Object.keys(LAYOUT_META),
  theme: THEMES.map((t) => t.name),
};
