# @kadal/deck

**Kadal Deck** — presentations written in MDX. Every reveal.js and Slidev feature, a live room so
the audience can follow, react, ask and vote from their phones, islands in any framework, and
export to PDF, PNG and PPTX. Docs: **https://deck.kadal.cc/docs/**

## Start a deck

```sh
npm create kadal-deck@latest my-talk
cd my-talk && npm install
npm run dev                     # edit deck.mdx; the page reloads as you type
npx kadal-deck build            # dist/, for any static host
npx kadal-deck login            # once per machine
npx kadal-deck publish          # https://deck.kadal.cc/@you/my-talk/ with a live room
```

Slides split at `---`, vertical slides at `----`. YAML between the dashes is that slide's
frontmatter; the block at the top is the headmatter (deck settings and the title slide).
`deck.config.ts` overrides the headmatter; every option is documented in `src/core/model.ts`.

## The CLI

| command | what |
| --- | --- |
| `kadal-deck dev` | Vite dev server for the deck in this folder |
| `kadal-deck build` | `dist/` for any static host |
| `kadal-deck export [--png] [--pptx]` | PDF (and PNG/PPTX) into `export/` — install `playwright` (and `pptxgenjs` for PPTX) |
| `kadal-deck login` / `logout` / `whoami` | sign this machine in to a Kadal Deck host (device code, opens the browser) |
| `kadal-deck publish [--slug] [--workspace] [--title]` | build for the host and publish; only changed files are uploaded |

`KADAL_DECK_TOKEN` (an API token from the dashboard) and `KADAL_DECK_HOST` override the saved
login, which is how CI publishes.

## Writing slides

Markdown, with these on top:

| What | How |
| --- | --- |
| Steps (fragments / clicks) | `<Click>…</Click>`, `<After>`, `<Clicks>` around a list; `at={3}`, `at="+2"`, `at={[2,5]}`, `hide`, `effect="fade-up"` |
| Code that steps | ```` ```ts {1\|3-5\|all} {lines:true} [title.ts] ```` |
| Magic move | ````` ````md magic-move ````` holding one fence per step |
| Math | `$inline$`, `$$ display $$`, `<Tex tex="…" />` |
| Diagrams | `<Mermaid>{`flowchart LR …`}</Mermaid>`; hand-drawn: `<Sketch scene={…} steps={[…]} />`, `<Sketch src="x.excalidraw" />`, `<Sketch>{`flowchart …`}</Sketch>` |
| Notes | `<Notes>… [click] …</Notes>` — the presenter view splits them at `[click]` |
| Layouts | `layout: cover \| center \| section \| two-cols \| image-right \| iframe-left \| fact \| quote …`; `::right::` names a slot |
| Backgrounds | `background: aurora` (also mesh, waves, lines, beams, sparkles, starfield, grid, dots, noise, spotlight), a colour, a gradient, an image, a video, an iframe, or `{ component: starfield, count: 400 }` |
| Transitions | `transition: slide \| fade \| convex \| concave \| zoom \| none \| view-transition`, `-in`/`-out`, `transitionSpeed`, `backgroundTransition` |
| Auto-animate | `autoAnimate: true` on consecutive slides; matching `data-id`s move |
| Motion | `<Motion initial enter clicks={{ "click-1": {…} }}>` |
| Bits | `Cols/Col`, `Grid`, `Callout`, `Badge`, `Kbd`, `Counter`, `Typewriter`, `Encrypted`, `Mark`, `Confetti`, `Timer`, `Qr`, `Toc`, `Image preview`, `Youtube`, `Tweet`, `Iframe`, `FitText`, `Arrow`, `Transform`, `Absolute`, `FlipBoard` |
| Live | `<QrJoin />`, `<Presence />`, `<Reactions />`, `<Poll id question options kind="choice\|multi\|rating" />`, `<WordCloud id question />`, `<Quiz id question options correct seconds />`, `<Leaderboard />`, `<Questions />`, `<Pace />` |
| Per-slide | `class`, `colorScheme: dark`, `transition`, `clicks`, `hide`, `hideInToc`, `timing`, `zoom`, `state` |

Cards that share a row share a height: a `<Glass>` or `<Callout>` that is the only thing in its `<Col>` (or in the `<Click>` that reveals it) fills the cell, unless the row says `align="start"`; give your own card component the `deck-card` class to join in. Your own components go in `src/components.tsx` and are available in `deck.mdx` without imports; `layout:name` entries register custom layouts.

## Keys

`?` shows the sheet. Vim first: `j`/`k` next and previous step through everything, `h`/`l` previous and next column (steps first, then the column — reveal.js's arrows do the same), `gg`/`G` first and last, `/` search, `:12` jump, `f` **focus** — every link, button, glossary term, image preview and embedded page on the slide gets a home-row label; type it to use it (Vimium's f). Also Space/N, `↓`/`↑` for the vertical stack, `O` overview, `T` theme menu, `⇧F` fullscreen, `B` blackout, `D` dark/light, `C` draw, `X` laser, `S` presenter view, `Z` zoom, `Esc`.

## Themes and looks

`T` (or the palette button) opens the theme menu on every view — play, presenter, audience: the themes the deck ships (`config.themes`, whose CSS its main.tsx imports) and light or dark. Each screen keeps its own choice per deck in the browser.

Backgrounds (`background: name` in frontmatter, `{ component, ...props }` for props, or `<Background name>` inside a slide): mesh, aurora, waves, lines, beams, sparkles, starfield, grid, dots, noise, spotlight, the quieter set — topo (contours, with index lines), glows, graticule, hex, constellation, vignette, rays, stripes, sweep — and the map room: **globe** (a wire globe off to one side, turning slowly, day and night sides), **lattice** (a grid zooming into one cell three levels deep), **thiessen** (drifting seeds under their Voronoi polygons), **cells** (reports landing on a lattice, rippling, going dark), **compass** (a rose with its degree ring turning), **neatline** (a map sheet's frame with coordinate ticks, north arrow and scale bar), **scan** (a graticule swept by a satellite pass), **track** (a GPS trail with a pulsing head), **raster** (a choropleth of cells classed by a drifting field, with its legend), **plane** (a dotted ground plane in oblique projection — the lattice an exploded figure stands on — with surveyor's control points at every `major`-th point, thinning toward a `horizon` and away from `focus` so words beside the figure sit on clean paper, and one slow glint crossing it; a figure that carries `data-plane="origin"` and `data-plane="unit"` marks has the floor locked onto it, point for point, at any size). All pause off-slide and hold a still frame under reduced motion; colours are CSS strings, so `rgba()` sets their weight. With a component, `color` is the component's stroke and `fill` (or `tint`) washes the layer behind it — a soft diagonal gradient of that one colour, strongest top-left, never a flat block (`background: { component: topo, color: "rgba(5,150,105,0.55)", fill: "rgba(5,150,105,0.12)" }`); `tint:` alone does the same on a slide without a component, where plain `color:` stays flat.

Bling components, all reading the theme's tokens: `<GradientText>`, `<Glass tone glow>`, `<Glow>`, `<Chip tone icon>`, `<Icon name>` (any lucide icon), `<Divider label>`, `<Ribbon>`, `<Halo>`, `<Shimmer>`, `<Blob>`, `<Tilt>`. Tones: accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal.

## Terms

Key concepts and abbreviations explain themselves. A `glossary.yaml` beside `deck.mdx` holds them; the compiler links the **first mention of each term on every slide** (body text first, a heading only when the body never says it; code, maths, links, controls and self-painting text like `<GradientText>` are left alone), and the runtime shows the definition in a card. Rest the pointer on a dotted word: the cursor fills like a pie and the underline draws itself solid for `delay` ms — sweeping across a slide sets nothing off — then the card opens, anchored to the word, inside the slide's canvas. A click or a tap opens it at once and pins it; `f` labels every term, so the keyboard reaches them; Escape, a press elsewhere or the next step closes it. The card never drops below readable type: on a small window it grows against the canvas's scale.

```yaml
# glossary.yaml — the key is the card's title and the first string matched
GNSS: Satellite positioning — GPS, NavIC, Galileo and the rest.      # short form
UTM:
  full: Universal Transverse Mercator        # an abbreviation's expansion
  def: Sixty projections that turn latitude and longitude into **metres**.   # inline Markdown, $maths$
  more: Chennai sits in zone 44N.            # a second, quieter paragraph
  aliases: [UTM zone 44N]                    # other spellings; plurals are found on their own
  tag: Projection                            # the category chip
  link: https://epsg.io/32644                # a source (or { href, label })
  see: [WGS84, EPSG]                         # chips that swap the card to a related term
  auto: false                                # never linked automatically — a word too common to trust
```

```mdx
<Term>UTM</Term>                                  {/* the entry, by name or alias */}
<Term id="utm">projected metres</Term>            {/* other words, same entry */}
<Term def="Root-mean-square error." tag="Statistics">RMSE</Term>   {/* a one-off, no entry */}
```

A name with no lowercase letter, or shorter than four characters, matches in its exact case only (`WHO`, never "who"); part of a hyphenated compound is a mention only for such an abbreviation (`GNSS-derived`, not `cell-level`). Definitions — a one-off's too — are rendered at build time, KaTeX included, so the browser loads no Markdown or maths code for them; a YAML mistake or an unknown `<Term>` is a build **warning**, never a failed build. Per slide, `terms: false` links nothing automatically and `terms: { skip: [GIS] }` leaves single terms out (the first slide shares the headmatter, which is why this key is not `glossary`). Deck-wide, in the headmatter: `glossary: terms.yaml` (another path), `glossary: false`, or `glossary: { repeat: all, headings: false | true | fallback, skip: [MyComponent], delay: 700, sync: false }`. Words that reach a component as a prop are out of the compiler's reach; link them where they render with `<Terms>{label}</Terms>`.

**Sharing.** A card is the presenter's own aid until the presenter view's **Share terms** is on (off by default, remembered per deck; `glossary: { sync: true }` starts it on). Then every card the presenter opens — hover, click, hint or a see-also swap — opens on the projector window and on every phone, and leaves them when it closes or the deck moves on. What travels through the room is a mention (slide, term id, which occurrence), not words: every screen runs the same build and resolves them itself, so a late joiner gets the open card too. A viewer's own cards stay private. On the audience page the mirror is too small to carry a card, so the definition appears as a readout under the slide (`<TermReadout />`, with the mirror inside `data-term-cards="off"`); full-screen it is a card again. Print and the previews (overview, next slide) render terms as plain text.

## Sketches

`<Sketch>` puts an Excalidraw drawing on a slide — the hand-drawn look, in the deck's colours. Three ways in:

```tsx
// src/sketches.ts — drawn in code with the DSL (plain data; Excalidraw loads only when a sketch renders)
import { sketch } from "@kadal/deck/sketch";
const s = sketch({ width: 1280, height: 600 });
s.region("edge", { x: 440, y: 20, w: 420, h: 560, title: "Cloudflare Workers", tone: "accent" });
s.node("w", { x: 470, y: 70, w: 360, h: 96, label: "Next.js 16\nSSR + OG image", tone: "accent", region: "edge" });
s.node("d1", { x: 470, y: 472, w: 160, h: 88, shape: "cylinder", label: "D1", tone: "pink", region: ["edge", "report"] });
s.arrow("w", "d1", { label: "only what is on the map", fromShift: -0.5 });
export const architecture = s.build();
```

```mdx
<Sketch scene={architecture} steps={["edge", { focus: "report", caption: "…" }, null]} height="660px" />
<Sketch src="diagrams/flow.excalidraw" />        {/* saved on excalidraw.com, in public/; frames and groups are regions */}
<Sketch>{`flowchart LR; a --> b`}</Sketch>        {/* Mermaid, converted (flowchart, sequence, class, state, ER) */}
```

Nodes: `box`, `pill`, `ellipse`, `diamond`, `cylinder`, `note`, `text`; tones as for bling plus `ink` and `muted`; `fill: hachure`, `dashed`, `font: hand | normal | code`. Arrows pick the facing sides (`from`/`to`/`fromShift`/`via` to steer), take a `label`, and belong to the regions of both ends. `steps` makes a tour: the whole drawing first, then one click per entry lights that region and dims the rest, with a caption; the notes' `[click]` markers line up. The corner button (and its F-hint) opens the real Excalidraw canvas in view mode to pan and zoom. Colours are rewritten to theme tokens on export, so a sketch follows the theme menu and the dark scheme; fonts are self-hosted by the Vite plugin under `<base>excalidraw/fonts/`.

Embedded pages (`layout: iframe*`, `<Iframe>`) load when their slide shows, unload when it is left, and sit behind a "click to interact" shield so keys keep driving the deck until you mean it; `Done` hands the keyboard back. The slide a press lands on next has its pages loading already, hidden, so arriving there looks instant. `<Iframe scale={0.5}>` renders a page at twice the pane and shrinks it, for a desktop layout in a small card. `posterUrl:` (or `<Iframe posterUrl>`) photographs a different address for the poster — the same page in a state its URL does not carry — and `posterWait:` gives it longer than the default five seconds to settle. Where a page cannot be live — print, the overview, the presenter's next-slide box, the scroll view — and while it loads, a **poster** stands in: `poster: shots/map.jpg` on the slide (or `<Iframe poster>`), else the screenshot `kadal-deck export` captures for that URL at the pane's size into `public/posters/` (`--posters` captures only, `--refresh-posters` recaptures), else a card with the address. A slide whose content overflows is scaled to fit (`autoFit`, on by default).

## Views

- `/<slug>/?print-pdf` — every slide as a page; on screen the pages are zoomed to the window, the browser's print dialog gets them at full size.
- `/<slug>/` — the deck. The stage is authored at 1920 × 1080 and scaled uniformly to every window: edge to edge on a 16:9 screen, centred between bars on any other shape — a phone, a tall window, a projector at 4:3 — never reflowed. `?view=scroll` reads it as a page, `?print-pdf` lays it out for print.
- `/<slug>/presenter` — current + next, notes with click markers, timer with pacing, tools (draw, laser, spotlight, blackout, share notes, share terms, confetti, camera, record, mirror, link), the room panel (QR, presence, pace, questions, polls; collapses to a rail with badges for hands, open questions and open polls, and the current-slide card grows). Passcode-gated on a host. Drawing: each pen is a colour family and a stroke drifts through it as it travels; strokes are scribbles that linger five seconds and unwind along their own path on every screen — the pin keeps them.
- `/<slug>/join` — the audience page: the deck at the presenter's slide in a stage-exact mirror (same scale, auto-fit and backgrounds as the projector; embedded pages load live, staggered so a room of phones does not hit a site at once), tap or ⤢ to fill the screen sideways with the reactions floating, plus reactions, ask + upvote, polls, quiz with nickname, pace, raise a hand, bookmarks, the notes when shared.
**Following.** A viewer who opens a live deck starts in step with the presenter and is shown nothing about it — the deck simply moves. The moment they move themselves, by any means at all (a key, an arrow, a swipe, the overview, search, the progress bar, a link that changes the hash, a second tab of their own browser), they stop following and nothing moves them again: the presenter can step through the whole deck and the viewer stays exactly where they stopped reading. A pill then offers **Follow the presenter**, which jumps them to where the presenter is and puts them back in step.

Where a window starts, in order of how much each signal knows: a `?at` link — one the deck itself minted ABOUT a slide (a share link, the phone's "Open full") — lands on that slide, free, and the marker is taken out of the address bar once it has been read; failing that, what this viewer last chose for this deck, for twelve hours, which is what carries a bookmark taken mid-talk, a tab closed at the interval or a sleeping phone back in step; failing that, a plain link follows and a bare hash is a slide someone typed. The hash alone cannot decide it, because the deck writes the hash as the viewer navigates: a bookmark's address is indistinguishable from a link someone chose to send, which is why the deliberate ones say so.

The phone page roams the same way — a chevron on each edge of the slide, or a swipe across it, and the same button underneath. What still reaches a viewer who is reading on their own: the presenter's drawings (kept per slide, so they appear on the slide they were drawn on), confetti, a shared term card (it names a slide, so it opens only on that one), blackout. What does not: the laser and the spotlight, which point at a place on the presenter's slide and mean nothing on any other.

The one rule underneath: a move with no `sync.source` is a person, here, and ends the follow — see `withTransition` in `react/Deck.tsx`. Everything arriving from the room, from another window, or from the deck's own auto-slide carries a source and leaves the follow alone.

- `/<slug>/?projector` — a window that exists to be LOOKED at: a second screen, or the one window to share on a call. It renders the deck exactly as `/<slug>/` does — backgrounds, controls, progress, slide number, the presenter's laser and pen, reactions — and gives up only input: no key, swipe, wheel or click reaches navigation, and the follow can never be broken, because a stray press on a shared window in the middle of a call is not a thing to be recoverable from. It shows no cursor. The presenter view's **Share window** button opens and closes one with a plain `window.open`, so it works in any browser; a desktop shell that wants to give it a frame of its own only has to recognise the URL.
- `/<slug>/notes` — every note on one page. `/<slug>/stats` — views, dwell per slide, sessions, questions, reactions, exports, share links.

## Export

```sh
npx kadal-deck export                  # PDF into export/ (builds + previews the deck itself)
npx kadal-deck export --png --pptx     # also PNGs and a PPTX (one image per slide, notes attached)
npx kadal-deck export --posters        # only capture posters for the embedded pages
```

Needs `playwright` (and `pptxgenjs` for PPTX) installed in the deck: they are optional peers, so
a deck that never exports never downloads a browser.

## Publish

`npx kadal-deck publish` puts the deck on https://deck.kadal.cc with a live room, analytics and
share links (free plan included). Any static host also works: `npx kadal-deck build` and upload
`dist/` — everything except the live room runs without a server.

## Layout of this package

- `src/compiler` — splitting, frontmatter, code meta, magic-move, slots, plain text for search, the glossary pass
- `src/glossary` — the glossary model shared by compiler and browser (matcher, inline Markdown, options) and the YAML parser
- `src/vite` — the plugin: `virtual:deck` manifest, one module per slide / notes / magic block
- `src/core` — model, navigation, click registry, hash, keyboard, layout, touch (pure, tested)
- `src/react` — the runtime: Deck, Stage, SlideFrame, layouts, backgrounds, auto-animate, chrome, overview, scroll, print, lightbox, zoom
- `src/components` — everything a slide can use
- `src/sketch` — Excalidraw: the DSL, the renderer (elements → theme-aware SVG), the canvas
- `src/live` — the room protocol, client, provider, live components, analytics, Turnstile
- `src/draw` — drawing layer and strokes
- `src/presenter`, `src/audience` — the pages
- `src/backgrounds` — the background components
- `src/themes` — base.css (engine), live.css, minimal / rla / stack
- `src/export` — Playwright export to PDF, PNG, PPTX
