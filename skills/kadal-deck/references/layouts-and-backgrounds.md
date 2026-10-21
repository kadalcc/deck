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

## Backgrounds

`background: <name>` in frontmatter, `{ component: <name>, ...props }` for props, or `<Background name>` in the slide. Colours are CSS strings; `rgba()` sets their weight. With a component, `color` is its stroke and `fill`/`tint` washes the layer.

### Ambient

- **gradient-mesh** (also mesh) — Slow, drifting, blurred colour blobs. Props: `colors=["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b"]`, `speed=1`. `background: { component: gradient-mesh, speed: 1 }`
- **aurora** — Soft northern-lights bands. Props: `colors=["#22d3ee", "#a78bfa", "#34d399"]`, `speed=1`. `background: { component: aurora, speed: 1 }`
- **waves** — Layered noise waves. Props: `colors=["#38bdf8", "#818cf8", "#c084fc", "#e879f9", "#22d3ee"]`, `speed=1`, `blur=10`. `background: { component: waves, speed: 1 }`
- **lines** — Flowing gradient lines. Props: `colors=["#1d4ed8", "#3b82f6", "#06b6d4"]`, `count=18`, `speed=0.3`. `background: { component: lines, count: 18 }`
- **beams** — Thin beams of light falling. Props: `color="#60a5fa"`, `count=7`. `background: { component: beams, color: "#60a5fa" }`
- **sparkles** — A twinkling particle field. Props: `color="#3b82f6"`, `density=400`, `size=1.6`. `background: { component: sparkles, color: "#3b82f6" }`
- **starfield** — Stars drifting slowly. Props: `color="#ffffff"`, `count=240`. `background: { component: starfield, color: "#ffffff" }`
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
- **sweep** — A slow animated gradient sweep across two or three colours. Props: `colors=["#0f172a", "#1e3a8a", "#0f766e"]`, `speed=1`, `angle=120`. `background: { component: sweep, speed: 1 }`

### Map

- **globe** — A wire globe off to one side, turning slowly, with day and night sides. Props: `color="rgba(127,127,127,0.55)"`, `x=0.82`, `y=0.45`, `radius=0.62`, `tilt=23`, `speed=6`, `step=15`, `opacity=1`. `background: { component: globe, x: 0.82 }`
- **lattice** — A grid that keeps zooming into one of its cells, three levels deep. Props: `color="rgba(127,127,127,0.35)"`, `accent="rgba(124,58,237,0.9)"`, `size=96`, `sub=4`, `period=9`. `background: { component: lattice, size: 96 }`
- **thiessen** (also voronoi) — Seeds drifting under their Voronoi (Thiessen) polygons. Props: `color="rgba(127,127,127,0.5)"`, `accent="rgba(13,148,136,0.9)"`, `count=22`, `speed=5`. `background: { component: thiessen, count: 22 }`
- **cells** — Reports landing on a lattice: cells light up, ripple and go dark. Props: `color="rgba(127,127,127,0.3)"`, `accent="rgba(219,39,119,0.9)"`, `size=30`, `rate=0.9`, `life=7`. `background: { component: cells, size: 30 }`
- **compass** — A compass rose with its degree ring turning. Props: `color="rgba(127,127,127,0.5)"`, `accent="rgba(220,38,38,0.85)"`, `x=0.84`, `y=0.52`, `radius=0.42`, `speed=3`. `background: { component: compass, x: 0.84 }`
- **neatline** — A map sheet's frame: neatline, coordinate ticks, north arrow, scale bar. Props: `color="rgba(127,127,127,0.55)"`, `inset=0.045`, `step=48`, `lat=13.0`, `lon=80.1`. `background: { component: neatline, inset: 0.045 }`
- **scan** — A graticule swept by a satellite pass. Props: `color="rgba(127,127,127,0.35)"`, `accent="rgba(59,130,246,0.9)"`, `size=48`, `major=5`, `speed=40`. `background: { component: scan, size: 48 }`
- **track** — A GPS trail wandering, with a pulsing head. Props: `color="rgba(127,127,127,0.6)"`, `accent="rgba(5,150,105,0.9)"`, `speed=1`, `width=2`. `background: { component: track, speed: 1 }`
- **raster** (also choropleth) — A choropleth of cells classed by a drifting field, with its legend. Props: `color="rgba(5,150,105,1)"`, `size=40`, `classes=6`, `speed=0.05`, `opacity=0.55`. `background: { component: raster, size: 40 }`
- **plane** (also floor) — A dotted ground plane in oblique projection for exploded figures; locks onto `data-plane="origin"`/`"unit"` marks in the slide. Props: `color="rgba(100,116,139,0.55)"`, `accent="rgba(13,148,136,0.9)"`, `size=36`, `shear=0.62`, `rise=0.3`, `major=4`, `x=0.05`, `y=0.9`, `horizon=0.24`, `focus=0.3`, `speed=11`. `background: { component: plane, size: 36 }`

### Sign

- **signer** — A landmark skeleton signing, with a fading wrist trail. Props: `color="rgba(13,148,136,0.55)"`, `accent="rgba(124,58,237,0.75)"`, `x=0.78`, `y=0.42`, `scale=0.16`, `speed=1`, `zones`, `trail`. `background: { component: signer, x: 0.78 }`
- **variants** — One signer drawn as several synthetic variants at once. Props: `color="rgba(5,150,105,0.5)"`, `accent="rgba(124,58,237,0.7)"`, `x=0.78`, `y=0.4`, `scale=0.15`, `count=4`, `speed=1`. `background: { component: variants, x: 0.78 }`
- **handshapes** — A calm field of hands morphing through handshapes. Props: `color="rgba(13,148,136,0.4)"`, `accent="rgba(124,58,237,0.6)"`, `cols=7`, `rows=4`, `size=0.075`, `speed=1`, `top=0`. `background: { component: handshapes, cols: 7 }`
- **trails** — Wrist paths through signing space; `align` adds a time-warped copy (DTW). Props: `color="rgba(13,148,136,0.55)"`, `accent="rgba(124,58,237,0.8)"`, `count=4`, `speed=1`, `align`, `area="0,0,1,1"`. `background: { component: trails, count: 4 }`
- **window** — Frames scrolling past a hopping 64-frame recogniser window. Props: `color="rgba(37,99,235,0.45)"`, `accent="rgba(5,150,105,0.8)"`, `speed=1`, `y=0.93`. `background: { component: window, speed: 1 }`
- **embedding** — Word clusters around prototypes and a query finding its nearest. Props: `color="rgba(124,58,237,0.45)"`, `accent="rgba(5,150,105,0.85)"`, `count=9`, `speed=1`. `background: { component: embedding, count: 9 }`

### Not components

- **color** — A flat colour (any CSS colour). `background: "#0f172a"`
- **gradient** — A CSS gradient. `background: "linear-gradient(135deg, #0f172a, #1e3a8a)"`
- **image** — An image (public/ path or URL), cover by default. `background: /photo.jpg`
- **video** — A looping muted video (.mp4/.webm/.mov/.ogv). `background: /loop.mp4`
- **iframe** — A web page behind the slide. `background: { iframe: https://example.com, interactive: false }`
- **tint** — A soft diagonal wash of one colour (`fill:` or `tint:`), alone or under a component background whose `color` is its stroke. `background: { component: topo, color: "rgba(5,150,105,0.55)", fill: "rgba(5,150,105,0.12)" }`

## Themes

- **minimal** (light) — The default: black on white, a wide sans serif, one accent. Dark mode inverts. CSS: `@kadal/deck/themes/minimal.css`
- **rla** (dark) — Zinc-950 with a blue→violet ramp, dot-matrix headings, made for the animated backgrounds. CSS: `@kadal/deck/themes/rla.css`
- **stack** (light) — An emerald accent on warm neutrals, Inter, product-like. CSS: `@kadal/deck/themes/stack.css`

Theme and addon packages: `theme: seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then the package `seriph`; `theme: ./theme` is a folder beside deck.mdx; `addons: [qr]` the same with addon-. The Vite plugin imports their CSS and modules; their layouts, components and layers merge in under the deck's own; `themeConfig` keys become `--theme-<kebab>` CSS variables. `kadal-deck info themes` lists the ones installed, `kadal-deck new --theme <name>` makes one, `kadal-deck theme eject` copies one into the deck. The contract: THEMES.md in @kadal/deck.

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
| `routeAlias` | `string` |  | Slidev's spelling of `id` for links. |
| `title` | `string` |  | The title the table of contents and search use (default: the first heading). |
| `level` | `number` |  | Heading level for the table of contents (default: the first heading's depth). |
| `hide` | `boolean` |  | Leave the slide out of the talk (still in the file). |
| `disabled` | `boolean` |  | Same as hide. |
| `visibility` | `"hidden" \| "uncounted"` |  | "hidden" leaves it out; "uncounted" shows it without a number. Values: `hidden` `uncounted` |
| `hideInToc` | `boolean` |  | Keep the slide out of <Toc>. |
| `transition` | `string` |  | This slide's transition (see transitions). Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
| `transitionSpeed` | `"default" \| "fast" \| "slow"` |  | This slide's transition speed. Values: `default` `fast` `slow` |
| `backgroundTransition` | `string` |  | This slide's background transition. Values: e.g. `none` `fade` `slide` `convex` `concave` `zoom` `view-transition` |
| `autoAnimate` | `boolean \| { id: string }` |  | Animate matching elements (same text or data-id) from the previous auto-animate slide. |
| `autoAnimateId` | `string` |  | Only auto-animate between slides with the same id. |
| `autoAnimateRestart` | `boolean` |  | Break the auto-animate chain here. |
| `autoSlide` | `number` |  | Milliseconds before this slide advances on its own. |
| `autoslide` | `number` |  | reveal.js spelling of autoSlide. |
| `clicks` | `number` |  | Force the number of click steps. |
| `clicksStart` | `number` |  | The step the slide opens at. |
| `preload` | `boolean` | `true` | Load the slide's module ahead of time (default true). |
| `timing` | `number` |  | Seconds planned for this slide (the presenter's pacing timer). |
| `state` | `string \| string[]` |  | Adds state-<name> classes while the slide shows (CSS hooks). |
| `colorScheme` | `"light" \| "dark"` |  | Force light or dark tokens on this slide (dark background under a light theme). Values: `light` `dark` |
| `zoom` | `number` |  | Scale the slide's content (0.8 fits more). |
| `background` | `string \| object` |  | A background: a registered name (aurora…), a colour, a gradient, an image or video path/URL, or { component, ...props } / { image, size, position, opacity } / { iframe, interactive } / { fill \| tint }. |
| `backgroundColor` | `string` |  | reveal.js: flat background colour. |
| `backgroundGradient` | `string` |  | reveal.js: a CSS gradient. |
| `backgroundImage` | `string` |  | reveal.js: an image URL. |
| `backgroundSize` | `string` |  | CSS background-size for the image (also the image layouts). |
| `backgroundPosition` | `string` |  | CSS background-position. |
| `backgroundRepeat` | `string` |  | CSS background-repeat. |
| `backgroundOpacity` | `number` |  | 0–1. |
| `backgroundVideo` | `string` |  | reveal.js: a video URL. |
| `backgroundVideoLoop` | `boolean` |  | Loop the background video. |
| `backgroundVideoMuted` | `boolean` |  | Mute the background video (default true). |
| `backgroundIframe` | `string` |  | reveal.js: a page behind the slide. |
| `backgroundInteractive` | `boolean` |  | Let the background page take input. |
| `image` | `string` |  | The image for the image, image-left and image-right layouts. |
| `url` | `string` |  | The page for the iframe, iframe-left and iframe-right layouts. |
| `poster` | `string` |  | A picture that stands in for the iframe in print, previews and while it loads. |
| `posterUrl` | `string` |  | Capture the poster from this address instead of `url`. |
| `posterWait` | `number` |  | Milliseconds to let the page settle before the poster capture, counted once its network has gone quiet (default 5000). |
| `terms` | `boolean \| { skip: string[] }` |  | false: link no glossary terms automatically on this slide; { skip: [GIS] } leaves some out. |
| `src` | `string` |  | Include the slides of another .mdx file here (a frontmatter-only slide). |
| `say` | `string` |  | What the narrator says on this slide instead of its notes (`[click]` splits it into steps); an empty string keeps it silent. |
| `narration` | `false` |  | false: the narrator says nothing here (the slide dwells as `narration.silent` says). In the headmatter, false switches narration off for the deck. |

## Deck frontmatter (headmatter)

The YAML block at the very top of deck.mdx. It configures the deck and is also the first slide's frontmatter. `deck.config.ts` overrides it.

| key | type | default | |
| --- | --- | --- | --- |
| `title` | `string` | `"Untitled deck"` | The deck's title (browser tab, table of contents, publish). |
| `author` | `string` | `""` | Who gives the talk. |
| `info` | `string` | `""` | A line about the deck (Markdown). |
| `width` | `number` | `1920` | The authored size; the stage scales uniformly to fit any viewport. |
| `height` | `number` | `1080` | The authored height in px; with width, the stage every screen scales. |
| `margin` | `number` | `0` | Fraction of the viewport left empty around the stage. 0 by default: a 16:9 window shows the slide edge to edge, any other shape gets bars on two sides — the content never reflows. |
| `minScale` | `number` | `0.2` | Smallest scale the stage may shrink to. |
| `maxScale` | `number` | `2` | Largest scale the stage may grow to. |
| `center` | `boolean` | `true` | Vertically centre each slide's content. |
| `controls` | `boolean \| "speaker"` | `true` | Show the navigation arrows; "speaker" shows them only in the presenter view. Values: `speaker` |
| `controlsLayout` | `"bottom-right" \| "edges"` | `"bottom-right"` | Where the arrows sit. Values: `bottom-right` `edges` |
| `controlsTutorial` | `boolean` | `true` | Hint at vertical slides the first time. |
| `controlsBackArrows` | `"faded" \| "hidden" \| "visible"` | `"faded"` | How the back arrows look. Values: `faded` `hidden` `visible` |
| `progress` | `boolean` | `true` | The progress bar along the bottom. |
| `slideNumber` | `boolean \| SlideNumberFormat` | `false` | Show slide numbers: true, or a format — "h.v", "h/v", "c" (current), "c/t" (current/total). Values: `h.v` `h/v` `c` `c/t` |
| `showSlideNumber` | `"all" \| "speaker" \| "print"` | `"all"` | Where slide numbers show. Values: `all` `speaker` `print` |
| `hash` | `boolean` | `true` | Keep the URL hash in step with the slide. |
| `hashOneBasedIndex` | `boolean` | `false` | 1-based slide numbers in the hash. |
| `history` | `boolean` | `false` | Push a history entry per slide (Back walks the slides). |
| `keyboard` | `boolean \| Record<string, KeyAction \| null>` | `true` | Keyboard navigation on. |
| `overview` | `boolean` | `true` | The overview grid (O / Esc). |
| `touch` | `boolean` | `true` | Swipe navigation. |
| `loop` | `boolean` | `false` | Wrap from the last slide to the first. |
| `rtl` | `boolean` | `false` | Right-to-left. |
| `navigationMode` | `NavigationMode` | `"default"` | "default", "linear" (arrows walk every slide) or "grid" (columns stay aligned). Values: `grid` `default` `linear` |
| `shuffle` | `boolean` | `false` | Shuffle the slides on load. |
| `fragments` | `boolean` | `true` | Clicks/fragments on; off shows every step at once. |
| `fragmentInURL` | `boolean` | `true` | Include the click step in the hash. |
| `embedded` | `boolean` | `false` | The deck lives inside another page. |
| `help` | `boolean` | `true` | The ? keyboard help. |
| `pause` | `boolean` | `true` | B / . blacks the screen out. |
| `showNotes` | `boolean \| "separate-page"` | `false` | Print notes with the slides: true (in a box) or "separate-page". Values: `separate-page` |
| `autoPlayMedia` | `boolean \| null` | `null` | Autoplay media on every slide (null = per element). |
| `autoAnimate` | `boolean` | `true` | Allow auto-animate between slides that set `autoAnimate`. |
| `autoAnimateEasing` | `string` | `"ease"` | CSS easing for auto-animate. |
| `autoAnimateDuration` | `number` | `1` | Seconds. |
| `autoAnimateUnmatched` | `boolean` | `true` | Fade in elements without a match. |
| `autoSlide` | `number` | `0` | Milliseconds between automatic steps; 0 disables. |
| `autoSlideStoppable` | `boolean` | `true` | Any input stops auto-slide. |
| `defaultTiming` | `number \| null` | `null` | Seconds per slide for the pacing timer, or null. |
| `totalTime` | `number \| null` | `null` | Total seconds for the pacing timer, or null. |
| `mouseWheel` | `boolean` | `false` | Scroll-wheel navigation. |
| `previewLinks` | `boolean` | `false` | Open links in an overlay. |
| `transition` | `Transition` | `"slide"` | Slide transition (see transitions). Values: `zoom` `none` `fade` `slide` `convex` `concave` `view-transition` |
| `transitionSpeed` | `TransitionSpeed` | `"default"` | default · fast · slow. Values: `default` `fast` `slow` |
| `backgroundTransition` | `Transition` | `"fade"` | Transition for backgrounds. Values: `zoom` `none` `fade` `slide` `convex` `concave` `view-transition` |
| `viewDistance` | `number` | `3` | Slides kept mounted on either side. |
| `mobileViewDistance` | `number` | `2` | The same, on phones. |
| `hideInactiveCursor` | `boolean` | `true` | Hide an idle cursor. |
| `hideCursorTime` | `number` | `5000` | Milliseconds before it hides. |
| `view` | `"slide" \| "scroll"` | `"slide"` | "slide" (the stage) or "scroll" (a page). Values: `slide` `scroll` |
| `scrollProgress` | `boolean \| "auto"` | `"auto"` | The scroll view's progress bar. Values: `auto` |
| `scrollSnap` | `false \| "mandatory" \| "proximity"` | `"mandatory"` | Scroll snapping in the scroll view. Values: `mandatory` `proximity` `false` |
| `scrollActivationWidth` | `number` | `0` | Viewport width under which the scroll view switches on by itself; 0 (the default) never does — a phone gets the same stage, letterboxed, and `?view=scroll` stays an explicit choice. |
| `theme` | `string` | `"minimal"` | The theme: a built-in (minimal, rla, stack, none), a package (`seriph` finds @kadal/theme-seriph, then kadal-theme-seriph, then a package of that name), a folder (`./theme`), or a class your own CSS defines (.theme-<name>). The Vite plugin imports a package's CSS and module for you; `kadal-deck theme eject` copies it into the deck. Values: e.g. `minimal` `rla` `stack` |
| `themes` | `string[]` | `["minimal","rla","stack"]` | The themes the theme menu offers, besides `theme`: built-ins, packages or folders, resolved like `theme` (the Vite plugin imports their CSS), or classes main.tsx's CSS defines. |
| `colorScheme` | `ColorScheme` | `"auto"` | "auto" (follow the system), "light" or "dark". Values: `auto` `light` `dark` |
| `pdfSeparateFragments` | `boolean` | `true` | A page per click step in print/PDF. |
| `pdfMaxPagesPerSlide` | `number` | `1` | Pages a tall slide may spill onto. |
| `jumpToSlide` | `boolean` | `true` | `:12` / g jumps. |
| `search` | `boolean` | `true` | / searches the deck. |
| `zoom` | `boolean` | `true` | Alt+click zooms into a point; Esc zooms back out. |
| `wakeLock` | `boolean` | `true` | Keep the screen awake while presenting. |
| `selectable` | `boolean` | `true` | Text can be selected. |
| `lineNumbers` | `boolean` | `false` | Line numbers on every code block. |
| `autoFit` | `boolean` | `true` | Scale a slide whose content overflows so it fits (measured after render). |
| `magicMoveDuration` | `number` | `800` | Milliseconds per magic-move morph. |
| `live` | `{ api: string \| null; room: string \| null; turnstile: string \| null; verify?: string \| null; }` | `{"api":"/api","room":null,"turnstile":null}` | Live room: the backend base (same origin `/api` on the host), or null for an offline deck. `verify` is a host page that checks a viewer (Turnstile) and sends them back with a pass — how a host that serves decks sandboxed keeps the check, since Turnstile can't run in an opaque origin. Set by the host (`window.__KADAL_DECK__.verify`), never by a deck. |
| `drawings` | `{ enabled: boolean; persist: boolean; presenterOnly: boolean; syncAll: boolean; }` | `{"enabled":true,"persist":true,"presenterOnly":false,"syncAll":true}` | Drawing: { enabled, persist, presenterOnly, syncAll }. |
| `narration` | `NarrationConfig \| boolean` | `{"enabled":"auto","engine":"auto","voice":"af_heart","rate":1,"gap":600,"silent":"estimate","model":"onnx-community/Kokoro-82M-v1.0-ONNX","dtype":"auto"}` | Narration (autoplay rehearsal: the notes read aloud, each `[click]` part at its step, the pages turning by themselves): { enabled ("auto" = when some slide has notes; false turns it off), engine ("auto" · "baked" · "kokoro" · "browser" · "silent"), voice (Kokoro id, default af_heart), rate (0.5–3), gap (ms between steps), silent (a slide without notes: "estimate", "skip" or ms), model (Hugging Face id), dtype ("auto" · fp32 · fp16 · q8 · q4 · q4f16) }. The bar is in the presenter view; on the deck, `?narrate` or R. Kokoro needs `kokoro-js` installed (`kadal-deck narrate --setup`); without it the browser's own voice reads. `kadal-deck narrate` bakes clips. |
| `glossary` | `GlossaryOptions \| string \| false` | `{"src":"glossary.yaml","repeat":"first","headings":"fallback","skip":[],"delay":700,"sync":false}` | Term cards. The runtime reads `delay` and `sync`; the rest steers the compiler, which sees the headmatter only — set those there. `glossary: false` or a path are shorthands. Values: `false` |
| `reactions` | `boolean` | `true` | Audience reactions in the live room. |
| `qa` | `boolean` | `true` | Audience questions in the live room. |
| `polls` | `boolean` | `true` | Polls and quizzes in the live room. |
| `audienceNotes` | `boolean` | `false` | Show every slide's notes to anyone on the audience page (after the talk, for instance). |
| `slug` | `string` | `""` | The deck's slug on the host, from the Vite base — decks/<slug>. |
| `badge` | `boolean` | `false` | Show the "Made with Kadal Deck" link in the corner (set by the host, see `withHostOverride`). |
| `ads` | `boolean` | `false` | Frame the first and last slides with the host's ads (set by the host, see `withHostOverride` and core/ads.ts). Only the play view shows them. |
| `fonts` | `FontsInput` | `[]` | Web fonts: Google Fonts families as written (`["Inter:wght@400;600"]`), or Slidev's object — `{ sans, heading, serif, mono, weights, italic, provider: google\|bunny\|none, local, fallbacks }` — which also points the theme's font tokens at them (theming/fonts.ts). |
| `seoMeta` | `Record<string, string>` | `{}` | Extra <meta> tags. |
| `addons` | `string[]` | `[]` | Addon packages: `@kadal/addon-<name>`, `kadal-addon-<name>`, a package name or a folder. |
| `themeConfig` | `Record<string, unknown>` | `{}` | The theme's knobs: each key becomes a `--theme-<kebab-key>` custom property on the deck root (`primary: "#0f766e"` → `--theme-primary`), over the theme's own defaults. |
| `layers` | `{ presenter: boolean; overview: boolean; }` | `{"presenter":true,"overview":false}` | Where the global and slide layers draw besides the deck, print and export. |
| `aspectRatio` | `number` |  | Slidev spelling: with canvasWidth, sets width and height (16/9 = 1.777…). |
| `canvasWidth` | `number` |  | Slidev spelling: the stage width used with aspectRatio. |
