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
  ThemePackageInfo,
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
  "two-cols-header": {
    summary:
      "A header across the top (everything before the first slot), then `::left::` and `::right::` side by side; an optional `::bottom::` spans both again.",
    keys: [],
    slots: ["default", "left", "right", "bottom"],
    example:
      "---\nlayout: two-cols-header\n---\n\n## Then and now\n\n::left::\n\nThe old way.\n\n::right::\n\nThe new way.",
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
    summary: "A looping muted video (.mp4/.webm/.mov/.ogv); `{ video, loop: false }` plays it once.",
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

/**
 * The first-party theme packages (packages/theme-*). Their own packages, and copies inside
 * @kadal/deck too: a deck names one (`theme: seriph`) with nothing installed, and every deck's
 * theme menu offers them all; the prebuilt shell bundles them all. The ports keep their Slidev theme's layouts, frontmatter and look (THEMES.md has the
 * name mapping, for decks moving over). Eight more are Kadal's own designs, with no `slidev`
 * field.
 */
export const THEME_PACKAGES: ThemePackageInfo[] = [
  {
    name: "classic",
    package: "@kadal/theme-classic",
    summary:
      "Avenir Next, light headings, square bullets, dashed links, a cyan primary; a dimmed picture under the cover.",
    scheme: "both",
    layouts: ["cover"],
    components: [],
    slidev: "default",
  },
  {
    name: "seriph",
    package: "@kadal/theme-seriph",
    summary:
      "PT Serif throughout, headings in the primary colour (themeConfig.primary, slate teal), a centred cover.",
    scheme: "both",
    layouts: ["cover"],
    components: [],
    slidev: "seriph",
  },
  {
    name: "crisp",
    package: "@kadal/theme-crisp",
    summary:
      "Plain black on white: Helvetica Neue, bold titles under a bold subtitle, pictures set in a margin.",
    scheme: "both",
    layouts: ["intro-image", "intro-image-right", "image-right", "3-images", "bullets"],
    components: [],
    slidev: "apple-basic",
  },
  {
    name: "bricks",
    package: "@kadal/theme-bricks",
    summary:
      "Building blocks in coral, butter, rose and sky on a cream page, Sigmar One headings. Light only.",
    scheme: "light",
    layouts: ["items", "blank"],
    components: [
      "Polygon1",
      "Polygon2",
      "Polygon3",
      "Polygon4",
      "Polygon5",
      "Polygon6",
      "Polygon7",
      "Polygon8",
      "Polygon9",
      "Polygon10",
      "Polygon11",
    ],
    slidev: "bricks",
  },
  {
    name: "shibainu",
    package: "@kadal/theme-shibainu",
    summary:
      "Soft blobs in a shiba's browns, Titillium Web, a different arrangement for each of fourteen layouts. Dark only.",
    scheme: "dark",
    layouts: [
      "default-2",
      "default-3",
      "default-4",
      "default-5",
      "default-6",
      "default-7",
      "right",
      "section-2",
      "section-3",
    ],
    components: [],
    slidev: "shibainu",
  },
  {
    name: "brand",
    package: "@kadal/theme-brand",
    summary:
      "A corporate theme branded from themeConfig alone — primary and secondary colours, a logo (and a dark one), the company and a footer line — on a white page with Plus Jakarta Sans and calm cards.",
    scheme: "both",
    layouts: ["title-logo", "agenda", "metrics"],
    components: ["Metric", "Logo"],
  },
  {
    name: "crayon",
    package: "@kadal/theme-crayon",
    summary:
      "A playful pastel theme for workshops and classrooms: Fredoka and Nunito, cream paper and plum ink, chunky outlines, callouts as tilted stickers, a blockquote as a speech bubble.",
    scheme: "both",
    layouts: ["activity", "cards"],
    components: ["Sticker", "Bubble"],
  },
  {
    name: "folio",
    package: "@kadal/theme-folio",
    summary:
      "An editorial theme for essays and keynotes: warm paper and ink, Playfair Display over Newsreader, booktabs tables, an asterism for a rule, a drop cap, generous margins.",
    scheme: "both",
    layouts: ["pull-quote", "essay", "chapter"],
    components: ["Byline", "Lede"],
  },
  {
    name: "lecture",
    package: "@kadal/theme-lecture",
    summary:
      "An academic theme: the Source family, numbered sections, a footer with the course, author, section and page, definition / theorem / proof blocks, citations and a references slide; prints on white.",
    scheme: "both",
    layouts: ["section", "definition", "theorem", "references"],
    components: [
      "Definition",
      "Theorem",
      "Lemma",
      "Corollary",
      "Proposition",
      "Proof",
      "Example",
      "Remark",
      "Cite",
    ],
  },
  {
    name: "neon",
    package: "@kadal/theme-neon",
    summary:
      "A dark synthwave theme for meetups and launches: a striped sunset over a running grid, Orbitron and Space Grotesk, glows that keep the letters near white, a solid print fallback. Dark only.",
    scheme: "dark",
    layouts: ["launch", "horizon"],
    components: ["Glow"],
  },
  {
    name: "ocean",
    package: "@kadal/theme-ocean",
    summary:
      "Kadal's own theme: the sea's palette, sunlit shallows in light and midnight water in dark, calm gradients, Catamaran, Night Owl code; a wave cover and depth-gauge section openers.",
    scheme: "both",
    layouts: ["waves", "depth"],
    components: ["Wave"],
  },
  {
    name: "swiss",
    package: "@kadal/theme-swiss",
    summary:
      "The International Typographic Style: huge Inter Tight headings flush left on a twelve-column grid, heavy rules, one signal red, a running header with the section and page.",
    scheme: "both",
    layouts: ["poster", "index", "grid"],
    components: ["Rule"],
  },
  {
    name: "terminal",
    package: "@kadal/theme-terminal",
    summary:
      "A developer theme for code-heavy talks: JetBrains Mono headings, code blocks as editor windows, line numbers and a lit active line, Ayu colours; dark first with a light variant.",
    scheme: "both",
    layouts: ["code", "shell"],
    components: ["Terminal"],
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
  blur: "Start blurred, come into focus.",
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
      "The attribute spelling: line numbers on, with optional steps; data-ln-start-from sets the first number.",
    example: '```js data-line-numbers="1|2"\na\nb\n```',
  },
  {
    syntax: "// [!code ++]",
    summary:
      "Shiki notation comments, at the end of a line (any comment style): `[!code ++]` / `[!code --]` added and removed lines, `[!code highlight]` (or `highlight:3` for 3 lines), `[!code focus]` blurs the rest until hover, `[!code error]` / `[!code warning]`, `[!code word:name]` marks every `name`. The comment is removed. Works with click steps; `deck({ shiki: { transformers } })` adds your own transformers.",
    example: "```ts\nconst a = 1 // [!code --]\nconst a = 2 // [!code ++]\nconst b = a // [!code highlight]\n```",
  },
  {
    syntax: "::code-group",
    summary:
      "Fences between `::code-group` and `::` (or `:::`) become tabs (`<CodeGroup>`), named by each fence's `[title]`. Options after the opener: `{clicks:true}` turns tabs on clicks, `{print:'all'}` prints every tab.",
    example: "::code-group\n\n```sh [npm]\nnpm i @kadal/deck\n```\n\n```sh [bun]\nbun add @kadal/deck\n```\n\n::",
  },
  {
    syntax: "<<< @/snippets/file.ts#region",
    summary:
      "Import code from a file (`@` = the deck's folder; `./x` relative to the slide's file), optionally one `#region` (marked `// #region name` … `// #endregion` in any comment style). A language word and any fence meta may follow: `<<< @/a.js ts {2|4}{lines:true} [a.ts]`. Watched in dev; in the hosted shell the file must be published beside deck.mdx.",
    example: "<<< @/snippets/tide.ts#ask {2-3} [tide.ts]",
  },
  {
    syntax: "twoslash",
    summary:
      "TypeScript type information rendered at build time: hover (or Tab to) a name for its type, errors underlined with the compiler's message, `// ^?` pins a type under the token above. Needs `typescript` installed; the hosted shell renders the block plain.",
    example: "```ts twoslash\nconst tide = { height: 6.1 }\n//    ^?\n```",
  },
  {
    syntax: "{monaco}",
    summary:
      "A Monaco editor on the slide (lazy-loaded; print, export and the phone remote show the highlighted code). Options: height (CSS or 'auto' to grow), lines, editorOptions (Monaco IEditorOptions), readonly. Esc gives the keys back to the deck.",
    example: "```ts {monaco}{height:'auto'}\nconst greeting = 'hello'\n```",
  },
  {
    syntax: "{monaco-diff}",
    summary:
      "A Monaco diff editor: the original code, a line of `~~~`, then the modified code. Print shows a unified line diff. `{sideBySide:false}` for inline.",
    example: "```ts {monaco-diff}\nconst tide = 6.1\n~~~\nconst tide = 6.4\n```",
  },
  {
    syntax: "{monaco-run}",
    summary:
      "An editor with a Run button (Ctrl/⌘+Enter) and the output under it: JS/TS run in a Web Worker (console captured, timeouts), Python in Pyodide; other languages through `registerCodeRunner` or setup/code-runners.ts. Options: autorun (default true, re-runs on edit), showOutputAt (a click, e.g. '+1'), outputHeight, outputPosition ('bottom' | 'right'), timeout (ms), runnerOptions.",
    example: "```ts {monaco-run}{showOutputAt:'+1'}\nconsole.log([1, 2, 3].map((n) => n * 2))\n```",
  },
  {
    syntax: "{monaco-write}",
    summary:
      "An editor whose edits are saved back to the source in `kadal-deck dev` (the imported file with `<<<`, else the fence in deck.mdx); read-only in a build and in the hosted shell.",
    example: "<<< @/snippets/tide.ts#ask {monaco-write}",
  },
  {
    syntax: "````md magic-move",
    summary:
      "A 4-backtick md fence holding one code fence per step: the code morphs between them on each click. An inner fence's highlight steps (`{*|1|2-5}`) are clicks of their own, before the next morph; `{lines: true}` (outer, or one step's) numbers lines; `{at:N}`, `{duration:ms}`.",
    example:
      "````md magic-move {lines: true}\n```ts {*|1}\nlet x = 1\nlet y = 2\n```\n```ts\nconst x = 1\n```\n````",
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
      "Presenter view: current + next slide, notes with click markers (click one to jump to its step; Edit under `kadal-deck dev`), a stopwatch or countdown timer with pause, reset, progress and pacing, tools, the room panel.",
  },
  {
    path: "/<slug>/join",
    summary: "The audience page (also /audience): follow along, react, ask, vote.",
  },
  {
    path: "/<slug>/remote",
    summary:
      "The phone remote: next/back, blackout, focus labels, a slide list, pen, zoom, a laser aimed by touch on a live copy of the slide or by moving the phone, the notes for this step, the timer and a wake lock. Paired from the presenter view's Phone remote QR, a one-time code that changes every 30 seconds: `remote#pair=CODE` with a room, `remote?pair=CODE` on `kadal-deck dev` or a `kadal-deck relay` (plus `&relay=…` when the presenter view was pointed at the relay by its address). One phone at a time; the newest to scan takes over. Pass `remote: RemotePage` (from `@kadal/deck/remote`) in `<Deck pages>`.",
  },
  {
    path: "/<slug>/notes",
    summary:
      "Every speaker note on one page, following the presenter: the current part marked, markers jump to their step; editable per slide under `kadal-deck dev`.",
  },
  {
    path: "/<slug>/teleprompter",
    summary:
      "The teleprompter: this slide's notes alone, big, in a window for another screen, following the presenter's slide and step (the current part on a reading line a third of the way down, earlier parts dimmed, the next slide's first lines below). Opened from the presenter view's Teleprompter button (a menu of this computer's screens where the browser can place windows), Shift T or `present.teleprompter`. Text size, line width, mirror for a prompter's glass, a reading guide, auto-scroll (Space, ↑ ↓ speed), light or dark, fullscreen; a strip with the slide, the presenter's timer and pace, and the room's hands, pace votes, viewers and open questions. It does not join the room. Every deck has it.",
  },
  {
    path: "/<slug>/notes-edit",
    summary:
      "The batch notes editor: every slide's notes as Markdown on one scrolling page, saved into deck.mdx as you type (`kadal-deck dev`, or a host's `notesEditor`; read-only elsewhere).",
  },
  {
    path: "/<slug>/overview",
    summary:
      "Every slide in order with a slider through its click steps and its notes beside it (editable under `kadal-deck dev`); a thumbnail opens the deck at that step.",
  },
  {
    path: "/<slug>/export",
    summary:
      "The browser exporter, on every deck (hosted ones too; no Playwright): PDF through the browser's print of the print view, a zip of PNGs, an image-per-slide PPTX file with the notes, or Markdown with the PNGs. Range, a page per click step, colour scheme, notes, picture size and a transparent background, with a live preview, progress and Cancel.",
  },
  { path: "/<slug>/stats", summary: "Views, dwell per slide, sessions, questions, reactions." },
  {
    path: "/<slug>/<your-path>",
    summary:
      'A page of the deck\'s own: `routes.tsx` beside deck.mdx (or src/routes.tsx, setup/routes.ts) exporting `defineRoutes([{ path: "handout", component: Handout }, { path: "q/:id", load: () => import("./Q.tsx"), title }])`, `<Deck routes>`, or a theme\'s or addon\'s `routes` / `api.addRoute()`. Drawn inside the deck\'s providers with `{ path, params, route }`; the engine\'s pages win a clash; the build copies index.html to each plain path for static hosts.',
  },
  {
    path: "/<slug>/__kadal/drawings",
    summary:
      '`kadal-deck dev` only: GET every `drawings/*.svg`; PUT `{ file, svg }` writes one (same origin, JSON; the SVG is re-serialised, never written as sent) and tells every open page. Used by `drawings.persist: "files"`.',
  },
];

export const QUERY_PARAMS: QueryParamInfo[] = [
  {
    param: "?print-pdf",
    summary:
      "Every slide (and click step) as a printable page; what export drives. Also ?print=pdf.",
  },
  {
    param: "?range=1,3-5",
    summary: "With ?print-pdf: only those slides (1-based, in play order; `8-` runs to the end).",
  },
  {
    param: "?clicks=0|1",
    summary: "With ?print-pdf: a page per click step (1) or one per slide at its last step (0); overrides pdfSeparateFragments.",
  },
  {
    param: "?notes=0|1|page",
    summary: "With ?print-pdf: notes off, in a box on each slide, or on pages of their own; overrides showNotes.",
  },
  {
    param: "?omit-background",
    summary: "With ?print-pdf: no page colour and no background layer (transparent PNGs).",
  },
  {
    param: "?scheme=light|dark",
    summary: "Open in that colour scheme (also ?dark), without changing the viewer's remembered choice.",
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
    summary:
      "Show the narration bar on the deck itself, to rehearse on the main screen (R does too).",
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
    summary:
      "The presenter's drawings (pen, highlighter, line, arrow, rectangle, ellipse; erasing, undo and redo), confetti and shared term cards reach every screen. Without a room, the deck's windows in one browser share the drawing and the camera bubble over the window bus.",
    components: ["Confetti", "Term"],
  },
  {
    name: "Phone remote",
    summary:
      "The presenter view's Phone remote button shows a QR; the phone that scans it runs commands in that window (the same ones the keyboard runs). One phone at a time: the QR's code works once and changes every 30 seconds, the newest phone to scan takes over, and a paired phone reconnects with its lease. With a room the room pairs it; on `kadal-deck dev` the dev server relays it (`--host` for the network, `--https` for the air pointer's motion sensors). A build on a static host (GitHub Pages, Netlify, S3, `python3 -m http.server`) pairs through `kadal-deck relay`: name it with `remote: { relay: \"wss://…\" }` in the deck or `?relay=wss://…` on the presenter view's address, and the presenter's window gives the relay's password once.",
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
    usage:
      "kadal-deck new <dir> [--title t] [--yes] [--no-install] [--pm npm|pnpm|yarn|bun] [--ci host[,host]] · kadal-deck new --theme <name> [dir] · kadal-deck new --addon <name> [dir]",
    summary:
      "Scaffold a deck (non-interactive); with --theme or --addon, a package ready to publish: package.json per the contract, a stylesheet with every token and layout class in light and dark, a layout, a layer, a README and a preview deck.",
    json: true,
  },
  {
    name: "theme",
    usage: "kadal-deck theme eject [--dir ./theme] [--force] [--theme name] [-C deck] [--json]",
    summary:
      "Copy the deck's theme (a package, or a built-in as a package-shaped folder) into the deck and point the headmatter at it, to change it there.",
    json: true,
  },
  {
    name: "import",
    usage:
      "kadal-deck import slidev <slides.md | folder> [--out dir] [--force] [--install] [--pm npm|pnpm|yarn|bun] [--json]",
    summary:
      "Convert a Slidev deck into a new Kadal deck folder (made as `new` makes one): deck.mdx, `src:` includes as pages/*.mdx, the project's .vue components, layouts and global layers as TSX, styles/, public/ and snippets/, the theme's package and icon sets in package.json, src/slidev.css with the UnoCSS utilities the slides use at Kadal's scale, and IMPORT-REPORT.md listing what did not carry over, slide by slide. Then it runs `check`. Nothing in the Slidev project is changed or run; --out defaults to <folder>-kadal and must be empty unless --force. The converter is `convertSlidev` in @kadal/deck/import.",
    json: true,
  },
  {
    name: "dev",
    usage: "kadal-deck dev [--https] [--tunnel] [--remote [password]] [vite flags]",
    summary:
      "The deck with live reload, and the phone remote's relay. `--host` makes it reachable from a phone on the same network; `--https` serves a self-signed certificate (made with openssl) so the phone's motion sensors work. `--tunnel` puts it on the internet through a Cloudflare Quick Tunnel (needs `cloudflared`; prints the https address and a QR, and the phone remote pairs through it; always password-guarded, with a password made up and printed unless `--remote <password>` gives one). `--remote [password]` serves on the network like `--host`, and with a password the presenter, notes, notes-edit and overview pages and the dev endpoints ask anyone not on this computer for it. In the browser, E (or `view.editor`) opens the side editor: the current slide's source beside it, saved back into the deck file with Cmd/Ctrl+S.",
    json: false,
  },
  {
    name: "build",
    usage:
      "kadal-deck build [deck files…] [--base /path/] [--out dir] [--without-notes] [--download] [--pwa | --no-pwa] [--bundle-remote-assets] [--port n] [vite flags]",
    summary:
      "dist/ for any static host. `--base /talks/x/` builds for that address (every route, the Excalidraw fonts, the workers and the narrator follow it); `--out` (Vite's --outDir) names the folder. Several deck files (`build a.mdx b.mdx`) build into dist/a/ and dist/b/ at <base>a/ and <base>b/, with a page listing them. The head comes from the headmatter (title, info, lang, favicon, seoMeta: Open Graph, Twitter, canonical; `ogImage: auto` photographs slide 1 into og-image.png). Each route also gets an index.html copy, plus 404.html and _redirects, so GitHub Pages, S3 and nginx serve /presenter without rewrites. `--without-notes` leaves the speaker notes out (no notes modules; the presenter and narrator have none). --download (or `download: true`) also prints dist/deck.pdf for the deck's Download button; --no-download skips it. --pwa (or `pwa: true`) makes it an installable app that presents offline; --bundle-remote-assets (or `bundleRemoteAssets: true`) downloads the remote images, media and fonts into it.",
    json: false,
  },
  {
    name: "serve",
    usage: "kadal-deck serve [folder] [--port n] [--host addr] [--base /path/] [--json]",
    summary:
      "Serve a built deck (dist/ by default) as a static host would: at the base it was built for (read from the build, or --base), every route answered by the deck's page, Range requests for video, a CDN's cache headers. For checking a build, the PWA offline, or a container (--host 0.0.0.0). Ctrl+C stops it.",
    json: true,
  },
  {
    name: "relay",
    usage: "kadal-deck relay [--port n] [--host addr] [--password p] [--tunnel] [--json]",
    summary:
      "The phone remote for a build on a static host, which has no room and no dev server: the dev server's relay (the same rotating one-time QR code, lease and one phone at a time) on a plain WebSocket, for a small box or behind a tunnel. A build reaches it with `remote: { relay: \"wss://…\" }` in the deck or `?relay=wss://…` on the presenter view's address (kept for the tab; the QR carries it to the phone). Becoming the presenting window takes the relay's password (`--password`, else KADAL_DECK_RELAY_PASSWORD, else one made up and printed), asked once in the Phone remote dialog; wrong ones are limited to 10 a minute per address. It serves no files and no editing endpoints: it carries the remote's messages and nothing else. Port 4174, on the network (0.0.0.0) unless --host says. `--tunnel` puts it on the internet through a Cloudflare Quick Tunnel (needs `cloudflared`) and prints the wss:// address, which a deck served over https needs. Ctrl+C stops it.",
    json: true,
  },
  {
    name: "ci",
    usage:
      "kadal-deck ci <github-pages|netlify|vercel|cloudflare|docker>[,…] [--force] [-C deck] [--json]",
    summary:
      "Write what a host needs to build and serve the deck, for its package manager and its folder in the repository: a GitHub Pages workflow (.github/workflows/deploy-deck.yml, --base /<repo>/), netlify.toml, vercel.json, wrangler.jsonc (Workers static assets), or a Dockerfile with nginx.conf. A deck whose build needs Chromium (download, ogImage: auto, pwa) gets the step that installs it. --force replaces existing files.",
    json: true,
  },
  {
    name: "check",
    usage: "kadal-deck check [--json] [--no-compile] [--contrast [contrast flags]]",
    summary:
      "Lint the deck: frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary, code meta. `--contrast` also runs the legibility check (`contrast`, with its flags) and fails when either does.",
    json: true,
  },
  {
    name: "contrast",
    usage:
      "kadal-deck contrast [--scheme light|dark|both] [--min 4.5] [--min-large 3] [--percentile 10] [--range 1,3-5] [--no-clicks] [--theme t] [--url u] [--dev] [--out dir] [--json]",
    summary:
      "Is every text legible? Each slide, click step and scheme (both by default) in headless Chromium: every visible text's colour (its alpha and opacity applied) against a picture of the same page with the glyphs made transparent — what is really behind it, images, gradients and canvas backgrounds included — sampled on a grid under each line, judged by WCAG 2.x at the worst 10% of the samples. Normal text needs --min (4.5:1), large text — 24px, or 18.66px bold, on the 1920 × 1080 stage — --min-large (3:1); large text under 4.5 is a warning. Exits 1 on a failure. Each finding gives the slide, steps, scheme, text, size, ratio, the colours and an element path; --out writes a picture of each failing page with the text outlined. `data-contrast=\"ignore\"` on an element leaves purely decorative text out (aria-hidden text is measured — a chart's labels often are); hidden and clipped text, words a background itself draws and the engine's dimmed parts (`.is-dim` code lines) are not measured, and text drawn inside a canvas or image cannot be.",
    json: true,
  },
  {
    name: "format",
    usage: "kadal-deck format [files…] [--check] [--json]",
    summary:
      "Format deck files with @kadal/prettier-plugin (default: deck.mdx and the files it includes): `---`/`----` separators and frontmatter normalised, the YAML through Prettier with its comments and key order kept, each slide's Markdown through Prettier — code fences, notes, magic-move, `<style>`, maths, `::slot::` markers, code groups and `<<<` imports left byte for byte. Every formatted slide is checked to mean the same, or keeps its text (and the command says why). The deck's own Prettier config applies. `--check` writes nothing and exits 1 when a file would change.",
    json: true,
  },
  {
    name: "info",
    usage: "kadal-deck info [topic] [--search q] [--json]",
    summary:
      "Print the catalog: components, layouts, backgrounds, frontmatter… `info themes` adds the theme and addon packages the deck can see, with their layouts.",
    json: true,
  },
  {
    name: "screenshot",
    usage:
      "kadal-deck screenshot [--slide N,M-N|id|all] [--out dir] [--theme t] [--scheme light|dark] [--width px] [--url u] [--dev] [--json]",
    summary:
      "PNG of slides, every click revealed (build + preview, headless Chromium). `--slide` counts from 1, as `export --range` does: `--slide 1` writes screenshots/slide-001.png.",
    json: true,
  },
  {
    name: "export",
    usage:
      "kadal-deck export [--format pdf,png,pptx,pptx-editable,md] [--png] [--pptx] [--pptx-editable] [--md] [--no-pdf] [--vector-pdf] [--range 1,3-5] [--dark | --scheme light|dark] [--with-clicks | --no-with-clicks] [--omit-background] [--no-with-toc] [--per-slide] [--out dir] [--output name] [--scale n] [--timeout ms] [--wait ms] [--wait-until networkidle|load|domcontentloaded|none] [--executable-path path] [--url u] [--port n] [--json]",
    summary:
      "PDF/PNG/PPTX/Markdown into export/. The PDF looks like the web in every viewer (each page a picture of the slide with its text printed over it as text), with bookmarks from the slide titles and levels (--no-with-toc for none) and the deck's metadata; --vector-pdf prints with the browser alone. --format pptx-editable rebuilds the slides as native PPTX text, lists, shapes, pictures and tables (what cannot be, it places as a picture where it stood) with the notes. --format md writes a .md file of the PNGs with each slide's notes. --range picks slides (counting from 1, like `screenshot --slide`), --dark the dark scheme, --no-with-clicks one page per slide, --omit-background transparent pages, --per-slide one page load per slide.",
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
    usage:
      "kadal-deck publish [--slug s] [--workspace w] [--title t] [--host url] [--without-notes] [--pwa] [--no-source] [--force] [--showcase|--no-showcase] [--json]",
    summary:
      "Build and publish to a host; prints the URL. The deck's editable source (deck.mdx, pages/, slides/, data, drawings) goes too, privately, with an editing kit, so it can be quick-edited on the web; `--no-source` keeps it local (quick edit off). Refused while merge conflicts are left (exit 5); exit 4 when the published deck moved since your last sync (a web edit, a publish from another copy, a rollback) — `pull` first, or `--force` to replace those edits (they stay in the history). `--without-notes` publishes the deck without its speaker notes. The host routes the deck itself, so the build has no static-host fallbacks, and no service worker unless --pwa (for a self-run host that serves decks on a real origin: deck.kadal.cc sandboxes them, and an opaque origin gets no worker; the live room and the host's API are never cached either way).",
    json: true,
  },
  {
    name: "pull",
    usage: "kadal-deck pull [--version n] [--ours|--theirs] [--dry-run] [--json]",
    summary:
      "Merge the web's edits (quick edit, agents) into the deck's files, slide by slide, against the last sync. Changed files are backed up to .kadal-deck/sync/backup/. Conflicts are left as git-style markers (exit 5) unless --ours/--theirs settles them.",
    json: true,
  },
  {
    name: "status",
    usage: "kadal-deck status [--json]",
    summary:
      "Your files vs your last sync vs the web: newer web versions, local changes by slide, conflicts, an unpublished web draft, and what to do next.",
    json: true,
  },
  {
    name: "resolve",
    usage: "kadal-deck resolve [file[#slide]] (--ours|--theirs|--both) | --list [--json]",
    summary:
      "Settle merge conflicts: keep your side, the web's, or both (yours first). Exit 5 while any are left; when the last goes, the pulled version becomes the base.",
    json: true,
  },
  {
    name: "narrate",
    usage:
      "kadal-deck narrate [--voice id] [--dtype fp32|fp16|q8|q4|q4f16] [--force] [--setup] [--json]",
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
      "Missing prerequisite: no deck.mdx here, dependencies not installed, or Playwright/Chromium missing. From `publish`: the published deck moved since your last sync (`error.code` \"diverged\"): run `kadal-deck pull`.",
  },
  {
    code: 5,
    meaning:
      "Unresolved merge conflicts (`pull`, `resolve`, and `publish`, which refuses until they are gone): `kadal-deck resolve`.",
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
  transition:
    'Slide transition (see transitions), or one of your own from `transitions` (or CSS on `.deck-stage[data-transition="name"]` setting `--deck-anim-in` / `--deck-anim-out`).',
  transitionSpeed: "default · fast · slow.",
  backgroundTransition: "Transition for backgrounds.",
  viewDistance: "Slides kept mounted on either side.",
  mobileViewDistance: "The same, on phones.",
  hideInactiveCursor: "Hide an idle cursor.",
  hideCursorTime: "Milliseconds before it hides.",
  view: '"slide" (the stage) or "scroll" (a page).',
  scrollProgress: "The scroll view's progress bar.",
  scrollSnap: "Scroll snapping in the scroll view.",
  theme:
    "The theme: a built-in (minimal, rla, stack, none), a package (`seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then a package of that name), a folder (`./theme`), or a class your own CSS defines (.theme-<name>). The Vite plugin imports a package's CSS and module for you; `kadal-deck theme eject` copies it into the deck.",
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
  monacoTypes:
    'Types for the packages `{monaco}` editors import, so hovers and errors are real: "auto" (the deck\'s installed declarations, bundled into the build; anything else from jsDelivr), "local", "cdn" or "none". Fetched types are cached in the browser; offline with nothing cached the editor works as before. `monacoTypesSource` (local · cdn/ata · none) is read too.',
  monacoPackages:
    'Packages the editors know, with versions: types acquired up front and `{monaco-run}` imports pinned to them. A list (`["zod", "lodash-es@4"]`) or a map (`{ zod: "^3.23" }`). `monacoTypesAdditionalPackages` is read too.',
  monacoTypesIgnore: "Packages never to fetch types for (also read as monacoTypesIgnorePackages).",
  monacoRunImports:
    'Where `{monaco-run}` resolves a bare import: a CDN base (default "https://esm.sh": `zod` → https://esm.sh/zod@<monacoPackages version>), a template with {name}, {version} and {path} (e.g. "https://cdn.jsdelivr.net/npm/{name}@{version}{path}/+esm"), or false to keep bare imports an error. The code already runs in a sandboxed worker that may import any URL; this only spells the URL for you.',
  drawings:
    'Drawing: { enabled: true | false | "dev", persist: true (browser storage) | "files" (drawings/<slide>.svg beside deck.mdx, written on `kadal-deck dev`, bundled into the build, printed into every export) | false, presenterOnly, syncAll, perClick (a stroke shows from the click step it was drawn on) }. Files in drawings/ are always shown under the live strokes.',
  narration:
    'Narration (autoplay rehearsal: the notes read aloud, each `[click]` part at its step, the pages turning by themselves): { enabled ("auto" = when some slide has notes; false turns it off), engine ("auto" · "baked" · "kokoro" · "browser" · "silent"), voice (Kokoro id, default af_heart), rate (0.5–3), gap (ms between steps), silent (a slide without notes: "estimate", "skip" or ms), model (Hugging Face id), dtype ("auto" · fp32 · fp16 · q8 · q4 · q4f16) }. The bar is in the presenter view; on the deck, `?narrate` or R. Kokoro needs `kokoro-js` installed (`kadal-deck narrate --setup`); without it the browser\'s own voice reads. `kadal-deck narrate` bakes clips.',
  reactions: "Audience reactions in the live room.",
  qa: "Audience questions in the live room.",
  polls: "Polls and quizzes in the live room.",
  slug: "The deck's slug; set by the build from the Vite base.",
  badge: "Set by the host; leave it alone.",
  ads: "Set by the host; leave it alone.",
  fonts:
    'Web fonts. A list of Google Fonts families as written (["Inter:wght@400;600"]), or an object, which also points the theme\'s font tokens at them: { sans, heading, serif, mono, weights: "300,400,600,700", italic, provider: google | bunny | none, local: [families already installed], fallbacks: true }. Exports wait for them.',
  addons:
    "Addon packages, in order (a later one wins a name clash): `qr` finds @kadal/addon-qr, then kadal-addon-qr, then a package of that name; `./my-addon` is a folder. Each brings components, layouts, layers, CSS and a setup.",
  themeConfig:
    'The theme\'s knobs, over its own defaults: each key becomes a CSS custom property `--theme-<kebab-key>` on the deck root (`primaryColor: "#0f766e"` → `--theme-primary-color`; nested keys join with dashes). What a theme reads is in its README.',
  comark:
    'Comark (formerly MDC) syntax: `:name[content]{prop=value .class #id}` inline components, `[text]{.class style="…"}` spans, `{…}` after `**bold**`, `` `code` ``, links and images, and `::name{props}` … `::` blocks (YAML props between `---` lines, `#slot` sections as props, nesting with more colons). Kadal\'s `::slot::` markers and `::code-group` keep their meaning.',
  layers:
    "Where the global and slide layers (global-top.tsx and friends, or a theme's or addon's) draw besides the deck, print and export: { presenter: true, overview: false }.",
};

/** Deck-level keys that are not DeckConfig fields. */
export const EXTRA_DECK_KEYS = [
  {
    name: "aspectRatio",
    type: N(),
    description: "With canvasWidth, sets width and height (16/9 = 1.777…).",
    scope: "deck" as const,
  },
  {
    name: "canvasWidth",
    type: N(),
    description: "The stage width used with aspectRatio.",
    scope: "deck" as const,
  },
  {
    name: "mdc",
    type: B(),
    description: "The older spelling of `comark` (MDC is Comark's former name).",
    scope: "deck" as const,
  },
  {
    name: "remoteAssets",
    type: {
      text: 'boolean | "build"',
      variants: [{ type: "boolean" as const }, { type: "string" as const }],
    },
    description: "Another spelling of bundleRemoteAssets (true or \"build\"; \"dev\" does nothing).",
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
  { name: "routeAlias", type: S(), description: "Another spelling of `id` for links." },
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
  {
    name: "transition",
    type: S(),
    description:
      "This slide's transition (see transitions): a built-in, or a name from the headmatter's `transitions` / `registerTransition` / your CSS. `zoom-in fade-out` names each half.",
  },
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
  { name: "autoslide", type: N(), description: "Another spelling of autoSlide." },
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
  { name: "backgroundColor", type: S(), description: "A flat background colour." },
  { name: "backgroundGradient", type: S(), description: "A CSS gradient behind the slide." },
  { name: "backgroundImage", type: S(), description: "An image URL behind the slide." },
  {
    name: "backgroundSize",
    type: S(),
    description: "CSS background-size for the image (also the image layouts).",
  },
  { name: "backgroundPosition", type: S(), description: "CSS background-position." },
  { name: "backgroundRepeat", type: S(), description: "CSS background-repeat." },
  { name: "backgroundOpacity", type: N(), description: "0–1." },
  { name: "backgroundVideo", type: S(), description: "A video URL behind the slide." },
  {
    name: "backgroundVideoLoop",
    type: B(),
    description: "Loop the background video (the default); false plays it once.",
  },
  {
    name: "backgroundVideoMuted",
    type: B(),
    description: "Mute the background video (default true).",
  },
  { name: "backgroundIframe", type: S(), description: "A page (iframe URL) behind the slide." },
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
    description:
      "Milliseconds to let the page settle before the poster capture, counted once its network has gone quiet (default 5000).",
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
    description:
      "Include the slides of another .mdx file here (a frontmatter-only slide). `#2-5`, `#1,3,5-7` or `#4-` includes only those slides (1-based); the slide's other keys merge into the first of them.",
    example: "src: ./part-two.mdx#2-5",
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
  {
    name: "dragPos",
    type: {
      text: "Record<string, string>",
      variants: [{ type: "object" as const }],
    },
    description:
      'Named positions for `<Drag pos="name">` / `<DragArrow pos="name">`: "x,y,w,h[,rotation]" in stage pixels, `_` for an automatic height. `kadal-deck dev` writes them when an element is dragged.',
    example: 'dragPos:\n  logo: "1500,80,300,_"',
  },
];

/** Allowed values the frontmatter types do not spell out. */
export const SUGGEST = {
  layout: Object.keys(LAYOUT_META),
  theme: THEMES.map((t) => t.name),
};
