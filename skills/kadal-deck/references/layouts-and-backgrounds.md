<!-- Generated from the engine's catalog by packages/deck/tools/catalog.ts (layouts and backgrounds). Do not edit: run `bun run catalog` in packages/deck. -->

# Layouts, backgrounds, themes and frontmatter

## Layouts

Pick one with `layout: <name>` in a slide's frontmatter.

- **default** — Content from the top left, the theme's padding around it. The default for every slide but the first.
- **center** — Everything centred on both axes.
- **cover** — The title slide: large title, subtitle and author. The first slide's default.
- **intro** — An introduction: who you are and what the talk covers.
- **section** — A section divider: one big heading that starts a part of the talk.
- **end** — The closing slide.
- **fact** — One number or fact, very large, with a line of context.
- **quote** — A quotation, set large, with its source.
- **statement** — One statement, centred and large.
- **full** — Content edge to edge, no padding — for a full-bleed image, map or diagram.
- **none** — No wrapper at all: the slide's MDX is the slide.
- **two-cols** — Two columns: everything before `::right::` on the left, the rest on the right. Slots: `::default::`, `::right::`.
- **two-cols-header** — A header across the top (everything before the first slot), then `::left::` and `::right::` side by side; an optional `::bottom::` spans both again. Slots: `::default::`, `::left::`, `::right::`, `::bottom::`.
- **image** — A full-slide image (frontmatter `image`) with the content over it. Reads: `image`, `backgroundSize`.
- **image-left** — An image filling the left half; content on the right. Reads: `image`, `backgroundSize`.
- **image-right** — Content on the left; an image filling the right half. Reads: `image`, `backgroundSize`.
- **iframe** — A live web page (frontmatter `url`) filling the slide, loaded only while the slide is near. Reads: `url`, `poster`, `posterUrl`, `posterWait`.
- **iframe-left** — A live web page on the left half; content on the right. Reads: `url`, `poster`, `posterUrl`, `posterWait`.
- **iframe-right** — Content on the left; a live web page on the right half. Reads: `url`, `poster`, `posterUrl`, `posterWait`.

Custom layouts: add `"layout:name": Component` to `src/components.tsx`.

**The Pro library.** `layout: pro/<slug>` and `background: pro/<slug>` (or `<Background name="pro/<slug>" />`) pick one of 95 items in 15 genres that deck.kadal.cc serves to decks published from a Pro or Team workspace; browse them at https://deck.kadal.cc/library/ (JSON: https://deck.kadal.cc/api/v1/library/catalog). On any other host or plan a `pro/` name falls back to the theme's own background and the `default` layout, so write the slide to read well either way.

## Backgrounds

`background: <name>` in frontmatter, `{ component: <name>, ...props }` for props, or `<Background name>` in the slide. Colours are CSS strings; `rgba()` sets their weight. With a component, `color` is its stroke and `fill`/`tint` washes the layer.

**The Pro library.** `layout: pro/<slug>` and `background: pro/<slug>` (or `<Background name="pro/<slug>" />`) pick one of 95 items in 15 genres that deck.kadal.cc serves to decks published from a Pro or Team workspace; browse them at https://deck.kadal.cc/library/ (JSON: https://deck.kadal.cc/api/v1/library/catalog). On any other host or plan a `pro/` name falls back to the theme's own background and the `default` layout, so write the slide to read well either way.

Removed in 0.6: `signer`, `variants`, `handshapes`, `trails`, `window`, `embedding`, `lattice` and `track`. A deck that needs one copies it from https://deck.kadal.cc/docs/backgrounds/#removed-in-06 into `src/components.tsx` and registers it with `registerBackground`.

### Ambient

- **gradient-mesh** (also mesh) — Slow, drifting, blurred colour blobs. Props: `colors=["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b"]`, `speed=1`. `background: { component: gradient-mesh, speed: 1 }`
- **aurora** — Soft northern-lights bands. Props: `colors=["#22d3ee", "#a78bfa", "#34d399"]`, `speed=1`. `background: { component: aurora, speed: 1 }`
- **waves** — Layered noise waves. Props: `colors=["#38bdf8", "#818cf8", "#c084fc", "#e879f9", "#22d3ee"]`, `speed=1`, `blur=10`. `background: { component: waves, speed: 1 }`
- **lines** — Flowing gradient lines. Props: `colors=["#1d4ed8", "#3b82f6", "#06b6d4"]`, `count=18`, `speed=0.3`. `background: { component: lines, count: 18 }`
- **beams** — Thin beams of light falling. Props: `color="#60a5fa"`, `count=7`. `background: { component: beams, color: "#60a5fa" }`
- **sparkles** — A twinkling particle field. Props: `color="#3b82f6"`, `density=400`, `size=1.6`. `background: { component: sparkles, color: "#3b82f6" }`
- **starfield** — Stars drifting slowly. Props: `color=light ? "#1e293b" : "#ffffff"`, `count=240`. `background: { component: starfield, count: 240 }`
- **grid** — A fine grid fading at the edges. Props: `color="rgba(127,127,127,0.25)"`, `size=48`. `background: { component: grid, size: 48 }`
- **dots** — A dot matrix. Props: `color="rgba(127,127,127,0.35)"`, `size=28`. `background: { component: dots, size: 28 }`
- **noise** — Film grain. Props: `opacity=0.12`. `background: { component: noise, opacity: 0.12 }`
- **spotlight** — A soft radial glow at a point. Props: `color="rgba(59,130,246,0.35)"`, `x=50`, `y=40`. `background: { component: spotlight, x: 50 }`

### Quiet

- **topo** (also contours) — Topographic contour lines with index lines. Props: `color="rgba(127,127,127,0.5)"`, `levels=14`, `speed=0.15`, `spacing=26`, `width=1`, `index=4`. `background: { component: topo, levels: 14 }`
- **glows** — Large slow glows of colour. Props: `colors=["#059669", "#3b82f6", "#f59e0b"]`, `opacity=0.35`, `speed=1`. `background: { component: glows, opacity: 0.35 }`
- **graticule** — A latitude/longitude graticule. Props: `color="rgba(127,127,127,0.28)"`, `size=40`, `major=5`. `background: { component: graticule, size: 40 }`
- **hex** — A hexagonal grid. Props: `color="rgba(127,127,127,0.25)"`, `size=28`. `background: { component: hex, size: 28 }`
- **constellation** — Points joined to their near neighbours, drifting. Props: `color="#3b82f6"`, `count=70`, `reach=140`. `background: { component: constellation, color: "#3b82f6" }`
- **vignette** — A darkened edge. Props: `color="rgba(0,0,0,1)"`, `strength=0.35`. `background: { component: vignette, strength: 0.35 }`
- **rays** — Light rays from a point. Props: `color="rgba(255,255,255,0.35)"`, `x=20`, `y=-10`, `opacity=0.5`. `background: { component: rays, x: 20 }`
- **stripes** — Diagonal stripes. Props: `color="rgba(127,127,127,0.12)"`, `size=14`, `angle=45`. `background: { component: stripes, size: 14 }`
- **sweep** — A slow animated gradient sweep across two or three colours. Props: `colors=scheme === "light" ? ["#dbeafe", "#c7d2fe", "#ccfbf1"] : ["#0f172a", "#1e3a8a", "#0f766e"]`, `speed=1`, `angle=120`. `background: { component: sweep, speed: 1 }`

### Map

- **globe** — A wire globe off to one side, turning slowly, with day and night sides. Props: `color="rgba(127,127,127,0.55)"`, `x=0.82`, `y=0.45`, `radius=0.62`, `tilt=23`, `speed=6`, `step=15`, `opacity=1`. `background: { component: globe, x: 0.82 }`
- **thiessen** (also voronoi) — Seeds drifting under their Voronoi (Thiessen) polygons. Props: `color="rgba(127,127,127,0.5)"`, `accent="rgba(13,148,136,0.9)"`, `count=22`, `speed=5`. `background: { component: thiessen, count: 22 }`
- **cells** — Reports landing on a lattice: cells light up, ripple and go dark. Props: `color="rgba(127,127,127,0.3)"`, `accent="rgba(219,39,119,0.9)"`, `size=30`, `rate=0.9`, `life=7`. `background: { component: cells, size: 30 }`
- **compass** — A compass rose with its degree ring turning. Props: `color="rgba(127,127,127,0.5)"`, `accent="rgba(220,38,38,0.85)"`, `x=0.84`, `y=0.52`, `radius=0.42`, `speed=3`. `background: { component: compass, x: 0.84 }`
- **neatline** — A map sheet's frame: neatline, coordinate ticks, north arrow, scale bar. Props: `color="rgba(127,127,127,0.55)"`, `inset=0.045`, `step=48`, `lat=13.0`, `lon=80.1`. `background: { component: neatline, inset: 0.045 }`
- **scan** — A graticule swept by a satellite pass. Props: `color="rgba(127,127,127,0.35)"`, `accent="rgba(59,130,246,0.9)"`, `size=48`, `major=5`, `speed=40`. `background: { component: scan, size: 48 }`
- **raster** (also choropleth) — A choropleth of cells classed by a drifting field, with its legend. Props: `color="rgba(5,150,105,1)"`, `size=40`, `classes=6`, `speed=0.05`, `opacity=0.55`. `background: { component: raster, size: 40 }`
- **plane** (also floor) — A dotted ground plane in oblique projection for exploded figures; locks onto `data-plane="origin"`/`"unit"` marks in the slide. Props: `color="rgba(100,116,139,0.55)"`, `accent="rgba(13,148,136,0.9)"`, `size=36`, `shear=0.62`, `rise=0.3`, `major=4`, `x=0.05`, `y=0.9`, `horizon=0.24`, `focus=0.3`, `speed=11`. `background: { component: plane, size: 36 }`

### Not components

- **color** — A flat colour (any CSS colour). `background: "#0f172a"`
- **gradient** — A CSS gradient. `background: "linear-gradient(135deg, #0f172a, #1e3a8a)"`
- **image** — An image (public/ path or URL), cover by default. `background: /photo.jpg`
- **video** — A looping muted video (.mp4/.webm/.mov/.ogv); `{ video, loop: false }` plays it once. `background: /loop.mp4`
- **iframe** — A web page behind the slide. `background: { iframe: https://example.com, interactive: false }`
- **tint** — A soft diagonal wash of one colour (`fill:` or `tint:`), alone or under a component background whose `color` is its stroke. `background: { component: topo, color: "rgba(5,150,105,0.55)", fill: "rgba(5,150,105,0.12)" }`

## Themes

- **minimal** (light) — The default: black on white, a wide sans serif, one accent. Dark mode inverts. CSS: `@kadal/deck/themes/minimal.css`
- **rla** (dark) — Zinc-950 with a blue→violet ramp, dot-matrix headings, made for the animated backgrounds. CSS: `@kadal/deck/themes/rla.css`
- **stack** (light) — An emerald accent on warm neutrals, Inter, product-like. CSS: `@kadal/deck/themes/stack.css`

Theme and addon packages: `theme: seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then the package `seriph`; `theme: ./theme` is a folder beside deck.mdx; `addons: [qr]` the same with addon-. The Vite plugin imports their CSS and modules; their layouts, components and layers merge in under the deck's own; `themeConfig` keys become `--theme-<kebab>` CSS variables. `kadal-deck info themes` lists the ones installed, `kadal-deck new --theme <name>` makes one, `kadal-deck theme eject` copies one into the deck. The contract: THEMES.md in @kadal/deck.

First-party theme packages (`theme: <name>` with nothing to install: @kadal/deck ships them, and every deck's theme menu offers all seventeen, the deck's own `theme` and `themes` first; the prebuilt shell has them all):

- **classic** (light and dark) — Avenir Next, light headings, square bullets, dashed links, a cyan primary; a dimmed picture under the cover. `@kadal/theme-classic`, from Slidev's `default`. Adds layouts `cover`.
- **seriph** (light and dark) — PT Serif throughout, headings in the primary colour (themeConfig.primary, slate teal), a centred cover. `@kadal/theme-seriph`, from Slidev's `seriph`. Adds layouts `cover`.
- **crisp** (light and dark) — Plain black on white: Helvetica Neue, bold titles under a bold subtitle, pictures set in a margin. `@kadal/theme-crisp`, from Slidev's `apple-basic`. Adds layouts `intro-image`, `intro-image-right`, `image-right`, `3-images`, `bullets`.
- **bricks** (light) — Building blocks in coral, butter, rose and sky on a cream page, Sigmar One headings. Light only. `@kadal/theme-bricks`, from Slidev's `bricks`. Adds layouts `items`, `blank`; components `Polygon1`, `Polygon2`, `Polygon3`, `Polygon4`, `Polygon5`, `Polygon6`, `Polygon7`, `Polygon8`, `Polygon9`, `Polygon10`, `Polygon11`.
- **shibainu** (dark) — Soft blobs in a shiba's browns, Titillium Web, a different arrangement for each of fourteen layouts. Dark only. `@kadal/theme-shibainu`, from Slidev's `shibainu`. Adds layouts `default-2`, `default-3`, `default-4`, `default-5`, `default-6`, `default-7`, `right`, `section-2`, `section-3`.
- **reveal** (light and dark) — reveal.js's twelve themes as `themeConfig.variant` (black, white, league, beige, night, serif, simple, solarized, moon, dracula, sky, blood): their fonts, colours and heading case, centred in reveal's box, each in light and dark. What `kadal-deck import reveal` writes. `@kadal/theme-reveal`.
- **brand** (light and dark) — A corporate theme branded from themeConfig alone — primary and secondary colours, a logo (and a dark one), the company and a footer line — on a white page with Plus Jakarta Sans and calm cards. `@kadal/theme-brand`. Adds layouts `title-logo`, `agenda`, `metrics`; components `Metric`, `Logo`.
- **crayon** (light and dark) — A playful pastel theme for workshops and classrooms: Fredoka and Nunito, cream paper and plum ink, chunky outlines, callouts as tilted stickers, a blockquote as a speech bubble. `@kadal/theme-crayon`. Adds layouts `activity`, `cards`; components `Sticker`, `Bubble`.
- **folio** (light and dark) — An editorial theme for essays and keynotes: warm paper and ink, Playfair Display over Newsreader, booktabs tables, an asterism for a rule, a drop cap, generous margins. `@kadal/theme-folio`. Adds layouts `pull-quote`, `essay`, `chapter`; components `Byline`, `Lede`.
- **lecture** (light and dark) — An academic theme: the Source family, numbered sections, a footer with the course, author, section and page, definition / theorem / proof blocks, citations and a references slide; prints on white. `@kadal/theme-lecture`. Adds layouts `section`, `definition`, `theorem`, `references`; components `Definition`, `Theorem`, `Lemma`, `Corollary`, `Proposition`, `Proof`, `Example`, `Remark`, `Cite`.
- **neon** (dark) — A dark synthwave theme for meetups and launches: a striped sunset over a running grid, Orbitron and Space Grotesk, glows that keep the letters near white, a solid print fallback. Dark only. `@kadal/theme-neon`. Adds layouts `launch`, `horizon`; components `Glow`.
- **ocean** (light and dark) — Kadal's own theme: the sea's palette, sunlit shallows in light and midnight water in dark, calm gradients, Catamaran, Night Owl code; a wave cover and depth-gauge section openers. `@kadal/theme-ocean`. Adds layouts `waves`, `depth`; components `Wave`.
- **swiss** (light and dark) — The International Typographic Style: huge Inter Tight headings flush left on a twelve-column grid, heavy rules, one signal red, a running header with the section and page. `@kadal/theme-swiss`. Adds layouts `poster`, `index`, `grid`; components `Rule`.
- **terminal** (light and dark) — A developer theme for code-heavy talks: JetBrains Mono headings, code blocks as editor windows, line numbers and a lit active line, Ayu colours; dark first with a light variant. `@kadal/theme-terminal`. Adds layouts `code`, `shell`; components `Terminal`.

## Transitions

- `none` — Cut straight to the next slide.
- `fade` — Cross-fade.
- `slide` — Slide horizontally (vertically within a stack). The default.
- `convex` — Slide with a convex 3D turn.
- `concave` — Slide with a concave 3D turn.
- `zoom` — Zoom into the next slide.
- `view-transition` — The browser's View Transitions API: elements with matching view-transition-name morph.

## Transition speeds

- `default` — 0.6 s.
- `fast` — 0.3 s.
- `slow` — 1 s.

## Slide frontmatter

YAML right after a slide's `---` separator, closed by another `---`.

| key | type | default | |
| --- | --- | --- | --- |
| `layout` | `string` |  | The slide's layout (see layouts). Default: cover for the first slide, default after. Values: e.g. `default` `center` `cover` `intro` `section` `end` `fact` `quote` |
| `class` | `string \| string[]` |  | Extra CSS classes on the slide. |
| `id` | `string` |  | A stable id: `#/<id>` links here and <Link to> finds it. |
| `routeAlias` | `string` |  | Another spelling of `id` for links. |
| `generated` | `string` |  | Set by the compiler on a slide it adds ("credits", for `credits: true`); tools that count the author's slides skip it. Not for decks to write. |
| `title` | `string` |  | The title the table of contents and search use (default: the first heading). |
| `level` | `number` |  | Heading level for the table of contents (default: the first heading's depth). |
| `hide` | `boolean` |  | Leave the slide out of the talk (still in the file). |
| `disabled` | `boolean` |  | Same as hide. |
| `visibility` | `"hidden" \| "uncounted"` |  | "hidden" leaves it out; "uncounted" shows it but leaves it out of the slide number, the total and the progress bar (an appendix after the end, reveal.js's data-visibility). Values: `hidden` `uncounted` |
| `hideInToc` | `boolean` |  | Keep the slide out of <Toc>. |
| `transition` | `string` |  | This slide's transition (see transitions): a built-in, or a name from the headmatter's `transitions` / `registerTransition` / your CSS. `zoom-in fade-out` names each half. Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
| `transitionSpeed` | `"default" \| "fast" \| "slow"` |  | This slide's transition speed. Values: `default` `fast` `slow` |
| `backgroundTransition` | `string` |  | This slide's background transition. Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
| `autoAnimate` | `boolean \| { id: string }` |  | Animate matching elements (same text or data-id) from the previous auto-animate slide. |
| `autoAnimateId` | `string` |  | Only auto-animate between slides with the same id. |
| `autoAnimateRestart` | `boolean` |  | Break the auto-animate chain here. |
| `autoAnimateEasing` | `string` |  | reveal.js compatible: the CSS easing of the auto-animate into this slide, over the deck's. |
| `autoAnimateDuration` | `number` |  | reveal.js compatible: seconds the auto-animate into this slide takes, over the deck's. |
| `autoAnimateUnmatched` | `boolean` |  | reveal.js compatible: whether this slide's elements with no match fade in, over the deck's. |
| `autoSlide` | `number` |  | Milliseconds before this slide advances on its own. |
| `autoslide` | `number` |  | Another spelling of autoSlide. |
| `clicks` | `number` |  | Force the number of click steps. |
| `clicksStart` | `number` |  | The step the slide opens at. |
| `preload` | `boolean` | `true` | Load the slide's module ahead of time (default true). |
| `timing` | `number` |  | Seconds planned for this slide (the presenter's pacing timer). |
| `state` | `string \| string[]` |  | Adds state-<name> classes while the slide shows (CSS hooks). |
| `colorScheme` | `"light" \| "dark"` |  | Force light or dark tokens on this slide (dark background under a light theme). Values: `light` `dark` |
| `zoom` | `number` |  | Scale the slide's content (0.8 fits more). |
| `background` | `string \| object` |  | A background: a registered name (aurora…), a colour, a gradient, an image or video path/URL, or { component, ...props } / { image, size, position, opacity } / { iframe, interactive } / { fill \| tint }. |
| `backgroundColor` | `string` |  | A flat background colour. |
| `backgroundGradient` | `string` |  | A CSS gradient behind the slide. |
| `backgroundImage` | `string` |  | An image URL behind the slide. An animated GIF starts again from its first frame each time the slide is shown. |
| `backgroundSize` | `string` |  | CSS background-size for the image (also the image layouts). |
| `backgroundPosition` | `string` |  | CSS background-position. |
| `backgroundRepeat` | `string` |  | CSS background-repeat. |
| `backgroundOpacity` | `number` |  | 0–1. |
| `backgroundVideo` | `string` |  | A video URL behind the slide, or reveal.js's comma-separated list of sources, best first (`/loop.webm, /loop.mp4`). It plays from the start when the slide is shown (unless `autoPlayMedia: false`) and pauses when the slide is left. |
| `backgroundVideoLoop` | `boolean` |  | Loop the background video (the default); false plays it once. |
| `backgroundVideoMuted` | `boolean` |  | Mute the background video (default true). |
| `backgroundIframe` | `string` |  | A page (iframe URL) behind the slide. It hears `slide:start` and `slide:stop` as its slide is shown and left; a YouTube or Vimeo player plays and pauses (unless `autoPlayMedia: false`). |
| `backgroundInteractive` | `boolean` |  | Let the background page take input. |
| `image` | `string` |  | The image for the image, image-left and image-right layouts. |
| `url` | `string` |  | The page for the iframe, iframe-left and iframe-right layouts. |
| `poster` | `string` |  | A picture that stands in for the iframe in print, previews and while it loads. |
| `posterUrl` | `string` |  | Capture the poster from this address instead of `url`. |
| `posterWait` | `number` |  | Milliseconds to let the page settle before the poster capture, counted once its network has gone quiet (default 5000). |
| `terms` | `boolean \| { skip: string[] }` |  | false: link no glossary terms automatically on this slide; { skip: [GIS] } leaves some out. |
| `src` | `string` |  | Include the slides of another .mdx file here (a frontmatter-only slide). `#2-5`, `#1,3,5-7` or `#4-` includes only those slides (1-based); the slide's other keys merge into the first of them. |
| `say` | `string` |  | What the narrator says on this slide instead of its notes (`[click]` splits it into steps); an empty string keeps it silent. |
| `narration` | `false` |  | false: the narrator says nothing here (the slide dwells as `narration.silent` says). In the headmatter, false switches narration off for the deck. |
| `dragPos` | `Record<string, string>` |  | Named positions for `<Drag pos="name">` / `<DragArrow pos="name">`: "x,y,w,h[,rotation]" in stage pixels, `_` for an automatic height. `kadal-deck dev` writes them when an element is dragged. |

## Deck frontmatter (headmatter)

The YAML block at the very top of deck.mdx. It configures the deck and is also the first slide's frontmatter. `deck.config.ts` overrides it.

| key | type | default | |
| --- | --- | --- | --- |
| `title` | `string` | `"Untitled deck"` | The deck's title (browser tab, table of contents, publish). |
| `author` | `string` | `""` | Who gives the talk. |
| `info` | `string` | `""` | A line about the deck (Markdown). |
| `date` | `string` | `""` | When the talk is given, as YYYY-MM-DD. The deck doesn't show it; listings sort by it. |
| `width` | `number` | `1920` | The authored size; the stage scales uniformly to fit any viewport. |
| `height` | `number` | `1080` | The authored height in px; with width, the stage every screen scales. |
| `margin` | `number` | `0` | Fraction of the viewport left empty around the stage. 0 by default: a 16:9 window shows the slide edge to edge, any other shape gets bars on two sides — the content never reflows. |
| `minScale` | `number` | `0.2` | Smallest scale the stage may shrink to. |
| `maxScale` | `number` | `2` | Largest scale the stage may grow to. |
| `disableLayout` | `boolean` | `false` | reveal.js compatible: no scaling or centring; the slides fill the page at its own size and you style them responsively (bring your own layout). Default false. |
| `center` | `boolean` | `false` | Vertically centre the content of slides on the default layout, as reveal.js does. False by default (Kadal's slides start at the top); `kadal-deck import reveal` writes true. The other layouts place their content themselves. |
| `controls` | `boolean \| "speaker"` | `true` | Show the navigation arrows; "speaker" shows them only in the presenter view. Values: `speaker` |
| `controlsLayout` | `"bottom-right" \| "edges"` | `"bottom-right"` | Where the arrows sit. Values: `bottom-right` `edges` |
| `controlsTutorial` | `boolean` | `true` | Hint at vertical slides the first time. |
| `controlsBackArrows` | `"visible" \| "faded" \| "hidden"` | `"faded"` | How the back arrows look. Values: `visible` `faded` `hidden` |
| `progress` | `boolean` | `true` | The progress bar along the bottom. |
| `slideNumber` | `boolean \| SlideNumberFormat \| SlideNumberFunction` | `false` | Show slide numbers: true, or a format — "h.v", "h/v", "c" (current), "c/t" (current/total). reveal.js compatible: deck.config.ts may pass a function of the slide ({ h, v, click, index, total, id }) returning one string or three ([h, ".", v]). Values: `c` `c/t` `h.v` `h/v` |
| `showSlideNumber` | `"all" \| "print" \| "speaker"` | `"all"` | Where slide numbers show: "all" (default) the deck, every printed page (and `kadal-deck export` PDF) and the presenter view; "print" only the printed pages; "speaker" only the presenter view. Values: `all` `print` `speaker` |
| `hash` | `boolean` | `true` | Keep the URL hash in step with the slide. |
| `hashOneBasedIndex` | `boolean` | `false` | 1-based slide numbers in the hash. |
| `history` | `boolean` | `false` | Push a history entry per slide (Back walks the slides). |
| `respondToHashChanges` | `boolean` | `true` | reveal.js compatible: a change to the URL hash (a link, the address bar) moves the deck. Default true. |
| `keyboard` | `boolean \| Record<string, KeyAction \| string \| null>` | `true` | Keyboard navigation on (false: off), or a map of single keys over the defaults: `{ KeyQ: overview, KeyD: null }` (KeyboardEvent.code names; a Kadal action, a command id, or null to unbind). reveal.js's form reads too: keyCodes and its method names, `{ 13: next, 79: toggleOverview, 32: null }`, and in deck.config.ts a function. |
| `keyboardCondition` | `"focused" \| KeyboardConditionFunction \| null` | `null` | reveal.js compatible: when the deck takes keys. null (default): always; "focused": only while the deck has focus (a deck embedded in a page). deck.config.ts may pass a function of the KeyboardEvent instead, true letting the key through. Values: `focused` |
| `focusBodyOnPageVisibilityChange` | `boolean` | `true` | reveal.js compatible: when the tab becomes visible again, take focus back from an embedded frame so the keys reach the deck. Default true. |
| `overview` | `boolean` | `true` | The overview grid (O / Esc). |
| `touch` | `boolean` | `true` | Swipe navigation. A touch that starts inside `data-prevent-swipe` (or on media controls) keeps its gesture; `rtl` mirrors the horizontal swipes. |
| `loop` | `boolean` | `false` | Wrap from the last slide to the first. |
| `rtl` | `boolean` | `false` | Right-to-left. |
| `navigationMode` | `NavigationMode` | `"default"` | "default", "linear" (arrows walk every slide) or "grid" (columns stay aligned). Values: `grid` `default` `linear` |
| `shuffle` | `boolean` | `false` | Shuffle the slides on load. |
| `fragments` | `boolean` | `true` | Clicks/fragments on. false: every slide is drawn at its last step and a press goes straight to the next slide. |
| `fragmentInURL` | `boolean` | `true` | Include the click step in the hash. |
| `embedded` | `boolean` | `false` | The deck lives inside another page. |
| `postMessage` | `boolean` | `true` | reveal.js compatible: a page that frames the deck can drive it with reveal's postMessage calls (`{ method, args }`). Default true. |
| `postMessageEvents` | `boolean` | `false` | reveal.js compatible: post the deck's events (slide changed, fragment shown …) to the framing page, as reveal's `{ namespace: "reveal", eventName, state }`. Default false. |
| `help` | `boolean` | `true` | The ? keyboard help. |
| `pause` | `boolean` | `true` | B / . blacks the screen out. |
| `showNotes` | `boolean \| "separate-page"` | `false` | Print notes with the slides: true (in a box) or "separate-page". Values: `separate-page` |
| `autoPlayMedia` | `boolean \| null` | `null` | Autoplay media on every slide: true plays every video, audio and YouTube/Vimeo frame when its slide is shown, false none (background videos included); null (default) plays those marked `data-autoplay`, and backgrounds. |
| `preloadIframes` | `boolean \| null` | `null` | reveal.js compatible: null (default): an iframe with `data-preload` loads within viewDistance and the rest when their slide shows; true: every iframe loads within viewDistance; false: only when its slide shows. |
| `autoAnimate` | `boolean` | `true` | Allow auto-animate between slides that set `autoAnimate`. |
| `autoAnimateEasing` | `string` | `"ease"` | CSS easing for auto-animate. |
| `autoAnimateDuration` | `number` | `1` | Seconds. |
| `autoAnimateUnmatched` | `boolean` | `true` | Fade in elements without a match. |
| `autoAnimateStyles` | `string[]` | `["opacity","color","background-color","padding","font-size","line-height","letter-spacing","border-width","border-color","border-radius","outline","outline-offset"]` | reveal.js compatible: the CSS properties auto-animate morphs between matched elements. Default reveal's list: opacity, color, background-color, padding, font-size, line-height, letter-spacing, border-width, border-color, border-radius, outline, outline-offset. |
| `autoAnimateMatcher` | `AutoAnimateMatcher \| null` | `null` | reveal.js compatible, deck.config.ts only: a function (from, to) of the two slides' elements returning the pairs to morph ([{ from, to }]), in place of matching by text and data-id. null (default): the built-in matching. |
| `autoSlide` | `number \| false` | `0` | Milliseconds between automatic steps; 0: only the slides that set their own, false: none, not even those. Values: `false` |
| `autoSlideStoppable` | `boolean` | `true` | Any input stops auto-slide, and the play view shows a pause/play control with the slide's time left as a ring (bottom-left). false: neither. |
| `autoSlideMethod` | `string` | `"next"` | reveal.js compatible: the step auto-slide takes, by name. "next" (default) walks every click step and slide, down a vertical stack before going right. reveal takes a function here; a name works in YAML. |
| `defaultTiming` | `number \| null` | `null` | Seconds per slide for the pacing timer, or null. |
| `totalTime` | `number \| null` | `null` | Total seconds for the pacing timer, or null. |
| `mouseWheel` | `boolean` | `false` | Scroll-wheel navigation. |
| `previewLinks` | `boolean` | `false` | Open every outside link in the lightbox. A link with `data-preview-link="false"` (or `data-no-preview`) opens as a link. |
| `transition` | `Transition` | `"slide"` | Slide transition (see transitions), or one of your own from `transitions` (or CSS on `.deck-stage[data-transition="name"]` setting `--deck-anim-in` / `--deck-anim-out`). Values: `slide` `fade` `none` `zoom` `convex` `concave` `view-transition` |
| `transitionSpeed` | `TransitionSpeed` | `"default"` | default · fast · slow. Values: `default` `fast` `slow` |
| `backgroundTransition` | `Transition` | `"fade"` | Transition for backgrounds. Values: `slide` `fade` `none` `zoom` `convex` `concave` `view-transition` |
| `parallaxBackgroundImage` | `string` | `""` | reveal.js compatible: one large image behind every slide that shifts a little with each slide (a path in public/ or a URL). Empty (default): none. |
| `parallaxBackgroundSize` | `string` | `""` | reveal.js compatible: the parallax image's CSS background-size, e.g. "2100px 900px" (the steps are worked out from a size in pixels). Empty (default): the image's own size. |
| `parallaxBackgroundHorizontal` | `number \| null` | `null` | reveal.js compatible: pixels the parallax image moves per horizontal slide. null (default): worked out from the image and slide count. |
| `parallaxBackgroundVertical` | `number \| null` | `null` | reveal.js compatible: pixels the parallax image moves per vertical slide. null (default): worked out from the image and slide count. |
| `viewDistance` | `number` | `3` | Slides kept mounted on either side. |
| `mobileViewDistance` | `number` | `2` | The same, on phones. |
| `hideInactiveCursor` | `boolean` | `true` | Hide an idle cursor. |
| `hideCursorTime` | `number` | `5000` | Milliseconds before it hides. |
| `view` | `"slide" \| "scroll"` | `"slide"` | "slide" (the stage) or "scroll" (a page). Values: `slide` `scroll` |
| `scrollLayout` | `"full" \| "compact"` | `"compact"` | reveal.js compatible: the scroll view's page. "compact" (default): each slide as wide as the viewport, as tall as its aspect ratio makes it; "full": each slide fills the viewport height, letterboxed, as reveal does by default. Values: `full` `compact` |
| `scrollProgress` | `boolean \| "auto"` | `"auto"` | The scroll view's progress bar. Values: `auto` |
| `scrollSnap` | `false \| "mandatory" \| "proximity"` | `"mandatory"` | Scroll snapping in the scroll view. Values: `mandatory` `proximity` `false` |
| `scrollActivationWidth` | `number` | `0` | Viewport width under which the scroll view switches on by itself; 0 (the default) never does — a phone gets the same stage, letterboxed, and `?view=scroll` stays an explicit choice. |
| `theme` | `string` | `"minimal"` | The theme: a built-in (minimal, rla, stack, none), a package (`seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then a package of that name), a folder (`./theme`), or a class your own CSS defines (.theme-<name>). The Vite plugin imports a package's CSS and module for you; `kadal-deck theme eject` copies it into the deck. Values: e.g. `minimal` `rla` `stack` |
| `themes` | `string[]` | `["minimal","rla","stack"]` | The themes the deck ships besides `theme`, first in its theme menu and in this order: built-ins, packages or folders, resolved like `theme` (the Vite plugin imports their CSS), or classes main.tsx's CSS defines. The menu then offers every first-party theme not listed (seventeen in all), each loaded only when picked; a list orders the menu, it does not narrow it. |
| `colorScheme` | `ColorScheme` | `"auto"` | "auto" (follow the system), "light" or "dark". Values: `light` `dark` `auto` |
| `pdfSeparateFragments` | `boolean` | `true` | A page per click step in print/PDF. |
| `pdfMaxPagesPerSlide` | `number` | `1` | reveal.js compatible: how many printed/PDF pages a slide taller than one may run onto (default 1: one page each, autoFit shrinking what overflows). Its print page grows by whole page heights and breaks across them; past the limit autoFit shrinks the rest. |
| `jumpToSlide` | `boolean` | `true` | `:12` / g jumps: a slide number, a column and row (`6/2` or `6.2`, reveal.js's forms) or an id. |
| `search` | `boolean` | `true` | / searches the deck. |
| `zoom` | `boolean` | `true` | Alt+click zooms into a point; Esc zooms back out. |
| `wakeLock` | `boolean` | `true` | Keep the screen awake while presenting. |
| `selectable` | `boolean` | `true` | Text can be selected. |
| `lineNumbers` | `boolean` | `false` | Line numbers on every code block. |
| `autoFit` | `boolean` | `true` | Scale a slide whose content overflows so it fits (measured after render). |
| `magicMoveDuration` | `number` | `800` | Milliseconds per magic-move morph. |
| `monacoTypes` | `"none" \| "local" \| "auto" \| "cdn"` | `"auto"` | Where `{monaco}` editors get the types of the packages they import (monaco/types.ts): "auto" (the deck's installed ones in a build, else the CDN), "local", "cdn" or "none". Values: `none` `local` `auto` `cdn` |
| `monacoPackages` | `string[] \| Record<string, string>` | `[]` | Packages the editors know: their types are acquired up front, and `{monaco-run}` imports them at these versions. A list (`["zod", "lodash-es@4"]`) or a map (`{ zod: "^3.23" }`). |
| `monacoTypesIgnore` | `string[]` | `[]` | Packages never to fetch types for. |
| `monacoRunImports` | `string \| false` | `"https://esm.sh"` | Where `{monaco-run}` resolves a bare import (`import { z } from "zod"`): a CDN base (`https://esm.sh`, the default) or a template with `{name}`, `{version}` and `{path}`; false keeps bare imports an error. Values: `false` |
| `live` | `{ api: string \| null; room: string \| null; turnstile: string \| null; verify?: string \| null; }` | `{"api":"/api","room":null,"turnstile":null}` | Live room: the backend base (same origin `/api` on the host), or null for an offline deck. `verify` is a host page that checks a viewer (Turnstile) and sends them back with a pass — how a host that serves decks sandboxed keeps the check, since Turnstile can't run in an opaque origin. Set by the host (`window.__KADAL_DECK__.verify`), never by a deck. |
| `remote` | `{ relay: string \| null; }` | `{"relay":null}` | The phone remote without a room or a dev server: `relay` is the WebSocket address of a `kadal-deck relay` (`wss://…`), where a build's presenter view and phone page meet — a deck on GitHub Pages, Netlify, S3 or any static host. `?relay=wss://…` on the presenter view's address does the same for that tab. Null (the default): no relay. A deck with a room pairs through the room; `kadal-deck dev` through the dev server. |
| `drawings` | `DrawingsConfig` | `{"enabled":true,"persist":true,"presenterOnly":false,"syncAll":true,"perClick":false}` | Drawing: { enabled: true \| false \| "dev", persist: true (browser storage) \| "files" (drawings/<slide>.svg beside deck.mdx, written on `kadal-deck dev`, bundled into the build, printed into every export) \| false, presenterOnly, syncAll, perClick (a stroke shows from the click step it was drawn on) }. Files in drawings/ are always shown under the live strokes. |
| `narration` | `NarrationConfig \| boolean` | `{"enabled":"auto","engine":"auto","voice":"af_heart","rate":1,"gap":600,"silent":"estimate","model":"onnx-community/Kokoro-82M-v1.0-ONNX","dtype":"auto"}` | Narration (autoplay rehearsal: the notes read aloud, each `[click]` part at its step, the pages turning by themselves): { enabled ("auto" = when some slide has notes; false turns it off), engine ("auto" · "baked" · "kokoro" · "browser" · "silent"), voice (Kokoro id, default af_heart), rate (0.5–3), gap (ms between steps), silent (a slide without notes: "estimate", "skip" or ms), model (Hugging Face id), dtype ("auto" · fp32 · fp16 · q8 · q4 · q4f16) }. The bar is in the presenter view; on the deck, `?narrate` or R. Kokoro needs `kokoro-js` installed (`kadal-deck narrate --setup`); without it the browser's own voice reads. `kadal-deck narrate` bakes clips. |
| `glossary` | `GlossaryOptions \| string \| false` | `{"src":"glossary.yaml","repeat":"first","headings":"fallback","skip":[],"delay":700,"sync":false}` | Term cards. The runtime reads `delay` and `sync`; the rest steers the compiler, which sees the headmatter only — set those there. `glossary: false` or a path are shorthands. Values: `false` |
| `reactions` | `boolean` | `true` | Audience reactions in the live room. |
| `qa` | `boolean` | `true` | Audience questions in the live room. |
| `polls` | `boolean` | `true` | Polls and quizzes in the live room. |
| `audienceNotes` | `boolean` | `false` | Show every slide's notes to anyone on the audience page (after the talk, for instance). |
| `slug` | `string` | `""` | The deck's slug on the host, from the Vite base — decks/<slug>. |
| `badge` | `boolean` | `false` | Show the "Made with Kadal Deck" link in the corner (set by the host, see `withHostOverride`). |
| `ads` | `boolean` | `false` | Frame the first and last slides with the host's ads (set by the host, see `withHostOverride` and core/ads.ts). Only the play view shows them. |
| `download` | `string \| boolean` | `false` | A Download button beside the theme menu. `true` offers the PDF that `kadal-deck build --download` puts beside the deck (`deck.pdf`), or the browser exporter (/export) when there is none; a URL links that file instead. A host may switch it off, or on, for the decks it serves (`window.__KADAL_DECK__.download`). See core/download.ts. |
| `fonts` | `FontsInput` | `[]` | Web fonts: Google Fonts families as written (`["Inter:wght@400;600"]`), or an object — `{ sans, heading, serif, mono, weights, italic, provider: google\|bunny\|none, local, fallbacks }` — which also points the theme's font tokens at them (theming/fonts.ts). |
| `seoMeta` | `Record<string, string>` | `{}` | The link preview and search tags (core/head.ts), by unhead's names: `ogImage` (`auto` photographs slide 1 into og-image.png at build; a path or URL uses that), `ogUrl`, `ogTitle`, `ogDescription`, `twitterCard`, `twitterSite`, `canonical`, `themeColor`, and any other key as a meta tag of its own. Written into the built index.html. |
| `lang` | `string` | `""` | The page's language: `<html lang>` and og:locale. Empty leaves index.html's. |
| `favicon` | `string` | `""` | The tab icon: a file in public/ (`/logo.svg`) or a URL. The PWA's icon, when it is local. |
| `pwa` | `boolean \| Record<string, string>` | `false` | `kadal-deck build` makes the deck an installable web app that presents offline: a web manifest, icons, and a service worker that precaches the build (vite/pwa.ts). Never in dev; `kadal-deck publish` leaves it out unless `--pwa`. An object sets { name, shortName, themeColor, backgroundColor, display }. |
| `bundleRemoteAssets` | `boolean` | `false` | At build, download the remote images, media, fonts (Google Fonts' CSS and its files) and CSS `url()`s the deck names into dist/remote-assets/ and point the deck at the copies, so it presents with no network (vite/remote-assets.ts). Cached in .kadal-deck/cache. |
| `defaults` | `Frontmatter` | `{}` | Frontmatter every slide gets unless it sets the key itself, e.g. `{ layout: center, transition: fade }`. A theme's defaults sit beneath it. |
| `plantUmlServer` | `string` | `"https://www.plantuml.com/plantuml"` | The PlantUML server ```plantuml fences render with: `<server>/svg/<encoded source>`. |
| `comark` | `boolean` | `false` | Comark (formerly MDC) syntax in the slides: `:badge[New]{tone="good"}`, `[text]{.class}`, `::callout{type="warn"}` … `::` blocks with `#slot` sections (compiler/remark-comark.ts). |
| `notesAutoRuby` | `Record<string, string>` | `{}` | Words in the speaker notes and their reading, shown as ruby: `{ 日本語: "ni hon go" }`. |
| `katex` | `{ [option: string]: unknown; macros?: Record<string, string>; }` | `{}` | KaTeX options for every formula, e.g. `{ macros: { "\\RR": "\\mathbb{R}" } }`. |
| `mermaid` | `Record<string, unknown>` | `{}` | Mermaid configuration for every diagram (theme, themeVariables, look, flowchart…). |
| `transitions` | `Record<string, TransitionDefinition>` | `{}` | Named custom transitions: `{ flip: { in: "flip-in", out: "flip-out", back: {…} } }`, the keyframes defined in the theme's CSS or a `<style global>` (core/transitions.ts). |
| `addons` | `string[]` | `[]` | Addon packages: `@kadal/addon-<name>`, `kadal-addon-<name>`, a package name or a folder. |
| `themeConfig` | `Record<string, unknown>` | `{}` | The theme's knobs: each key becomes a `--theme-<kebab-key>` custom property on the deck root (`primary: "#0f766e"` → `--theme-primary`), over the theme's own defaults. |
| `layers` | `{ presenter: boolean; overview: boolean; }` | `{"presenter":true,"overview":false}` | Where the global and slide layers draw besides the deck, print and export. |
| `credits` | `boolean \| { slide?: false \| "end" \| "before-last"; footer?: boolean; title?: string; }` | `false` | Media credits (credits/model.ts): `true` collects every attributed GIF, sticker, meme, emoji set, icon set and credited image the slides use, puts a "Credits" slide before the last slide (`slide: "end"`: after it), and a small link to it in the corner of every other slide (`footer: false`: none). `title` names the slide and the link. Once compiled, the value is the collected credits (`ResolvedCredits`) that `<Credits />` draws. |
| `timer` | `"stopwatch" \| "countdown"` | `"stopwatch"` | The presenter's timer: "stopwatch" counts up, "countdown" counts down from `duration`. Both pause, resume and reset, show a progress bar when the talk has a length, and go into overtime past it; the pacing badge (ahead/behind) works with either. Values: `stopwatch` `countdown` |
| `duration` | `string \| number \| null ("30min", "1h", "90s", "25:00", or minutes)` | `null` | How long the talk is, in seconds once read: `30min`, `1h`, `1h30m`, `90s`, `25:00`, or a number of minutes. The countdown runs from it and the progress bar fills to it; pacing spreads it over the slides when there is no `totalTime`. Null: the planned length is `totalTime`, else the slides' `timing` added up, else (for a countdown) thirty minutes. |
| `contextMenu` | `boolean \| "dev" \| "build"` | `true` | The right-click menu on the slides: true (always), false (never), "dev" (only under `kadal-deck dev`) or "build" (only in a built deck). Shift + right-click always gives the browser's own menu. Values: `dev` `build` |
| `aspectRatio` | `number` |  | With canvasWidth, sets width and height (16/9 = 1.777…). |
| `canvasWidth` | `number` |  | The stage width used with aspectRatio. |
| `mdc` | `boolean` |  | The older spelling of `comark` (MDC is Comark's former name). |
| `remoteAssets` | `boolean \| "build"` |  | Another spelling of bundleRemoteAssets (true or "build"; "dev" does nothing). |
