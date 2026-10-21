# @kadal/deck

**Kadal Deck** — presentations written in MDX. Every reveal.js and Slidev feature, a live room so
the audience can follow, react, ask and vote from their phones, islands in any framework, and
export to PDF, PNG, PPTX (pictures or editable) and Markdown. Docs: **https://deck.kadal.cc/docs/**

[![npm](https://img.shields.io/npm/v/@kadal/deck?color=0e7490)](https://www.npmjs.com/package/@kadal/deck)
[![CI](https://img.shields.io/github/actions/workflow/status/kadalcc/deck/ci.yml?branch=main&label=CI)](https://github.com/kadalcc/deck/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-AGPL--3.0--or--later-0e7490)](https://github.com/kadalcc/deck/blob/main/LICENSING.md)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A5-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/pmithunish)

## Start a deck

```sh
npm create @kadal/deck@latest my-talk
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
| `kadal-deck new <dir> [--title t] [--no-install] [--pm npm\|pnpm\|yarn\|bun]` | a deck from the starter, no questions asked |
| `kadal-deck dev [--https] [--tunnel] [--remote [password]]` | Vite dev server for the deck in this folder, with the [side editor](#editors) (E). `--tunnel`: on the internet through a Cloudflare Quick Tunnel (needs `cloudflared`), with a QR in the terminal and the phone remote pairing through it; `--remote [password]`: on the network, the presenter and editing behind the password (a tunnel always has one) |
| `kadal-deck build [--without-notes] [--download]` | `dist/` for any static host; `--without-notes` leaves the speaker notes out; `--download` (or `download: true`) also prints `dist/deck.pdf` for the deck's Download button |
| `kadal-deck check [--no-compile]` | lint: YAML and frontmatter keys/types, unknown layouts, backgrounds, themes, transitions, MDX compile errors with file:line, unknown JSX components, broken `src:` includes, missing assets, glossary, code-fence options |
| `kadal-deck format [files] [--check]` | format `deck.mdx` and its includes (or the files named) with [@kadal/prettier-plugin](../prettier-plugin): separators, frontmatter YAML (comments kept), each slide's Markdown; code, notes, magic-move, `<style>`, maths and `::slot::` sugar byte for byte; every slide checked to mean the same. `--check` exits 1 when a file would change |
| `kadal-deck info [topic] [name] [--search words] [--markdown]` | the reference (components, layouts, backgrounds, themes, transitions, clicks, code, deck, slide, keys, routes, live, cli, exit) |
| `kadal-deck screenshot [--slide N\|all] [--out dir] [--scheme light\|dark] [--theme t] [--width px] [--dev] [--url u]` | PNG of each slide in `screenshots/` (build + preview, headless Chromium) |
| `kadal-deck export [--format pdf,png,pptx,pptx-editable,md] [--range 1,3-5] [--dark] [--no-with-clicks] [--omit-background] [--per-slide] [--out dir] [--output name] [--scale n] [--url u]` | PDF (and PNG, PPTX, editable PPTX, Markdown) into `export/` — install `playwright`. Each PDF page is a picture of the slide with its text over it as real text, so it looks the same in every viewer and stays searchable, with bookmarks from the slide titles; `--vector-pdf` prints with the browser alone. See [Export](#export) |
| `kadal-deck login` / `logout` / `whoami` | sign this machine in to a Kadal Deck host (device code, opens the browser) |
| `kadal-deck publish [--slug] [--workspace] [--title] [--host] [--without-notes]` | build for the host and publish; only changed files are uploaded |
| `kadal-deck narrate [--voice id] [--dtype q8\|fp32…] [--force] [--setup]` | bake the narration: each notes segment spoken by Kokoro into `public/narration/` (MP3/Opus with ffmpeg, else WAV) + `public/narration.json`; skips clips that exist. `--setup` installs `kokoro-js` |
| `kadal-deck mcp [--dir path] [--allow-outside]` | a Model Context Protocol server on stdio for AI agents (see below); confined to `--dir` unless `--allow-outside` |

Every command takes `--dir <path>` (`-C`) and, except `dev`, `build` and `mcp`, `--json`: one JSON
object on stdout, progress on stderr. Flags accept `--flag value` and `--flag=value`; switches
take `--no-` to turn off. Exit codes: **0** ok (check: no errors) · **1** failed · **2** usage ·
**3** not signed in · **4** missing prerequisite (no `deck.mdx`, dependencies or Chromium).

`KADAL_DECK_TOKEN` (an API token from the dashboard) and `KADAL_DECK_HOST` override the saved
login, which is how CI publishes.

## For AI agents and tools

- `kadal-deck mcp` — tools to read the reference, scaffold, outline, edit single slides (only
  their lines change), lint, **render slides to PNG** for the agent to look at, preview, build,
  export and publish; resources for the catalog, the reference and the guides; prompts
  `draft_deck` and `review_deck`. Setup for each client: the repository README.
- `skill/` in this package (and `skills/kadal-deck` in the repository) — the Agent Skill.
- `@kadal/deck/catalog` — `catalog` (components with props/defaults/examples, layouts,
  backgrounds, themes, transitions, click effects, code meta, deck/slide frontmatter, keys, routes,
  live room, CLI, exit codes), `searchCatalog`, `findEntry`, `catalogMarkdown`,
  `frontmatterSchema`. Pure data: works in a browser or a Worker. [REFERENCE.md](REFERENCE.md) is
  the same catalog as Markdown.
- `@kadal/deck/authoring` — `outlineDeck`, `lintDeck`, `addSlide` / `updateSlide` /
  `removeSlide` / `moveSlide` / `setNotes` / `updateHeadmatter` over a `{ entry, read }` file
  interface; edits return new file text and never touch bytes outside the slide.
- `@kadal/deck/schema/frontmatter.json` — JSON Schema (`$defs.headmatter`, `$defs.slide`).
- `@kadal/deck/monaco` — `createMonacoHost`, `bundledGrammar`, `bundledThemes`, `registerMonacoLoader`:
  for a page that bundles Monaco itself and compiles decks in the browser (the prebuilt shell does).
  A deck built with the Vite plugin needs none of it.

## Editors

- **The side editor** (`kadal-deck dev`): press <kbd>E</kbd> (or `view.editor`, or "Edit slide
  source" on the right-click menu) and the current slide's source opens beside it in CodeMirror —
  separator, frontmatter, body and notes, as written. <kbd>Cmd/Ctrl+S</kbd> saves it into the
  deck file (or the file it is included from) through `/__kadal/source`: only that slide's lines
  change, a slide edited elsewhere in the meantime is a conflict to resolve rather than an
  overwrite, and the deck shows the change. The panel is resizable, the slide shrinks beside it,
  and unsaved text survives a reload. CodeMirror is loaded only by the dev server; a build has
  none of it.
- **VS Code** (`packages/vscode`, "Kadal Deck"): a Slides outline you can drag to reorder, a
  preview that follows the cursor, frontmatter and component IntelliSense from the catalog,
  `check` as problems, formatting, and dev/presenter/export commands.
- **Prettier**: `@kadal/prettier-plugin` formats `deck.mdx` / `slides.mdx` by name in any editor
  that runs Prettier; `kadal-deck format` is the same without setup.

## Writing slides

Markdown, with these on top:

| What | How |
| --- | --- |
| Steps (fragments / clicks) | `<Click>…</Click>`, `<After>`, `<Clicks>` around a list; `at={3}`, `at="+2"`, `at={[2,5]}`, `hide`, `effect="fade-up"` |
| Code that steps | ```` ```ts {1\|3-5\|all} {lines:true} [title.ts] ```` |
| Magic move | ````` ````md magic-move ````` holding one fence per step |
| Code marks | `// [!code ++]`, `[!code --]`, `[!code highlight]`, `[!code focus]`, `[!code error]` / `warning`, `[!code word:x]` at a line's end (Shiki's notation transformers); add your own with `deck({ shiki: { transformers } })` |
| Code groups | `::code-group` … `::` around titled fences (```` ```sh [npm] ````): tabs with file badges, ←/→ between them; `{clicks:true}`, `{print:'all'}`; or `<CodeGroup>` |
| Snippets | `<<< @/snippets/x.ts#region {2\|4} [x.ts]` — a file (or one `#region` of it, any comment style) as a fence; `@` is the deck folder; watched in dev |
| TwoSlash | ```` ```ts twoslash ```` — type hovers (also on Tab), compiler errors, `// ^?`, rendered at build time (needs `typescript`) |
| Monaco | ```` ```ts {monaco} ```` an editor; `{monaco-diff}` (original `~~~` modified); `{monaco-run}` runs JS/TS (Web Worker) and Python (Pyodide) with the output below, `{autorun:false,showOutputAt:'+1',outputHeight:'200px'}`; `{monaco-write}` saves edits back to the file in `kadal-deck dev`. Lazy: never in the main bundle. More runners: `registerCodeRunner(lang, fn)` or `setup/code-runners.ts` |
| Math | `$inline$`, `$$ display $$`, `<Tex tex="…" />`; `$$ {1\|3\|all}` lights lines one click at a time; `katex: { macros }` in the headmatter |
| Diagrams | ```` ```mermaid {scale: 0.8} ```` or `<Mermaid>{`flowchart LR …`}</Mermaid>` (`mermaid:` headmatter for all); ```` ```plantuml ```` (on `plantUmlServer`); hand-drawn: `<Sketch scene={…} steps={[…]} />`, `<Sketch src="x.excalidraw" />`, `<Sketch>{`flowchart …`}</Sketch>` |
| Notes | `<Notes>… [click] …</Notes>`, or Slidev's `<!-- … -->` at the end of the slide — the presenter view splits them at `[click]`; `notesAutoRuby: { 日本語: ni hon go }` annotates words |
| Slidev syntax | ```` ```yaml ```` first in a slide = its frontmatter; `defaults:` headmatter for every slide; `src: ./more.mdx#2-5`; `<style>` scoped to its slide (`<style global>` for the deck); other HTML comments are dropped |
| Layouts | `layout: cover \| center \| section \| two-cols \| image-right \| iframe-left \| fact \| quote …`; `::right::` names a slot |
| Backgrounds | `background: aurora` (also mesh, waves, lines, beams, sparkles, starfield, grid, dots, noise, spotlight), a colour, a gradient, an image, a video, an iframe, or `{ component: starfield, count: 400 }` |
| Transitions | `transition: slide \| fade \| convex \| concave \| zoom \| none \| view-transition`, `-in`/`-out`, `transitionSpeed`, `backgroundTransition`; your own: `transitions: { flip: { in: flip-in, out: flip-out } }` in the headmatter (or `registerTransition`), or CSS on `.deck-stage[data-transition="flip"]` setting `--deck-anim-in`/`--deck-anim-out` |
| Auto-animate | `autoAnimate: true` on consecutive slides; matching `data-id`s move |
| Motion | `<Motion initial enter clicks={{ "click-1": {…} }}>` |
| Bits | `Cols/Col`, `Grid`, `Callout`, `Badge`, `Kbd`, `Counter`, `Typewriter`, `Encrypted`, `Mark`, `Confetti`, `Timer`, `Qr`, `Toc`, `Image preview`, `Youtube`, `Tweet`, `BlueSky`, `Iframe`, `FitText`, `Arrow`, `Transform`, `Absolute`, `FlipBoard` |
| Icons | `<Icon name="rocket" />` (Lucide, bundled) or any Iconify icon: `<Icon name="mdi:account" />`, and Slidev's tag form `<mdi-account class="text-3xl" />`, `<logos-vue />` (also UnoCSS's `<div class="i-carbon-logo-github" />`). `kadal-deck dev`/`build` bundle the drawings from the deck's own `@iconify-json/<set>` (or `@iconify/json`), so a built deck needs no network; the hosted shell, or a set not installed, fetches from the Iconify API once and keeps them; offline, a dashed box. `kadal-deck check` names a misspelt icon and the set to install |
| Marks | `<Mark type="circle" at={2} color="#e11d48">` — rough-notation's underline, box, circle, highlight, strike-through, crossed-off and bracket (`brackets="left right"`), with `strokeWidth`, `padding`, `iterations`, `multiline`, `duration`, `delay`, `opacity`; drawn stroke by stroke on the click, the same wobble on every screen and in the PDF |
| Placed by hand | `<Drag pos="x,y,w,h,rotation">` or `<Drag pos="name">` with `dragPos: { name: "…" }` in the slide's frontmatter (`_` height: automatic); `<DragArrow pos="x,y,dx,dy" />`; Slidev's `v-drag`, `<v-drag>` and `<v-drag-arrow>` compile to them. In `kadal-deck dev` double-click to move, resize (Shift: keep the shape), turn and nudge (arrow keys); saved into deck.mdx through `/__kadal/drag`, nothing else in the file touched |
| Switches and video | `<Switch>` with `<Case>`s (Slidev's v-switch: `at={n}`, `at="a-b"`, `transition`, `unmount`); `<Video at={1} pauseAt={3} steps={{ 2: "rewind" }} autoreset="slide" printTimestamp="last" />` — Slidev's SlidevVideo options plus click steps |
| In context | `<LightOrDark>` (`slot="light"`/`slot="dark"` children, `light`/`dark` props, or a function), `<RenderWhen context="presenter \| previewNext \| overview \| print \| main \| visible…" fallback>`, `<SlideCurrentNo />`, `<SlidesTotal />`, `<TitleRenderer no={3} />` |
| Live | `<QrJoin />`, `<Presence />`, `<Reactions />`, `<Poll id question options kind="choice\|multi\|rating" />`, `<WordCloud id question />`, `<Quiz id question options correct seconds />`, `<Leaderboard />`, `<Questions />`, `<Pace />` |
| Per-slide | `class`, `colorScheme: dark`, `transition`, `clicks`, `hide`, `hideInToc`, `timing`, `zoom`, `state` |

Cards that share a row share a height: a `<Glass>` or `<Callout>` that is the only thing in its `<Col>` (or in the `<Click>` that reveals it) fills the cell, unless the row says `align="start"`; give your own card component the `deck-card` class to join in. Your own components go in `src/components.tsx` and are available in `deck.mdx` without imports; `layout:name` entries register custom layouts.

### The Vite plugin's options

`deck({ entry, shiki, remarkPlugins, rehypePlugins, preprocess, katex, mermaid, withoutNotes })`:
your remark plugins run after GFM and maths, your rehype plugins after highlighting, KaTeX and the
glossary; `preprocess(text, file)` rewrites each file before it is cut into slides; `katex` and
`mermaid` are the defaults the headmatter's `katex:` and `mermaid:` merge over. The browser
compiler (`compileDeck` in `@kadal/deck/runtime`) takes the same options.

## Keys

`?` shows the sheet. Vim first: `j`/`k` next and previous step through everything, `h`/`l` previous and next column (steps first, then the column — reveal.js's arrows do the same), `gg`/`G` first and last, `/` search, `:12` jump, `f` **focus** — every link, button, glossary term, image preview and embedded page on the slide gets a home-row label; type it to use it (Vimium's f). Also Space/N, `↓`/`↑` for the vertical stack, `O` overview, `T` theme menu, `⇧F` fullscreen, `B` blackout, `D` dark/light, `C` draw, `X` laser, `S` presenter view, `Alt`+click to zoom to a point, `Esc`.

`,` opens the **display settings** — brightness, contrast, saturation, sepia, hue and invert for the slides (not the controls), kept per deck in the browser and shared live by its windows, so the presenter can tune the projector from the presenter view. **Right-click** a slide (or `Shift F10`) for the **context menu**: back and next, the overview, the presenter view, the notes, full screen, dark, pen, laser, display settings, export; `contextMenu: false | "dev" | "build"` in the headmatter turns it off or limits it, Shift + right-click is always the browser's own.

**Your own keys.** `<Deck shortcuts={[{ keys: ["KeyQ"], command: "view.overview", description: "Overview" }]}>` lays keys over the defaults (a key a shortcut takes is gone from the default that had it); a function gets the defaults and returns the whole list, so it can remove and rebind too — `defineShortcuts((d) => d.filter((b) => b.action !== "colorScheme"))`. A shortcut runs a built-in `action`, any `command` (with `params`) or a `run` function, optionally only on some `views`. `keyboard: { KeyQ: overview, KeyD: null }` in the headmatter rebinds or unbinds single keys, and `deck.shortcuts.add(…)` (an addon's setup, a component) layers more at run time and returns its remover. The `?` sheet lists them all, the deck's own marked; two shortcuts claiming one key are reported on the console. Menu items work the same way: `<Deck contextMenu={(items) => [...items, { id, label, icon, command }]}>` or `deck.menu.add(…)`.

**Direction.** The deck root, the stage and the moving slides carry `data-nav-direction="forward|backward"` (and `--deck-nav-sign: 1 | -1`). The starter's Tailwind declares Slidev's variants — `@custom-variant forward (&:where([data-nav-direction="forward"] *))` and `backward` — so `<Click className="forward:delay-300">` waits only going forward; without Tailwind, `deck-instant-back`, `deck-instant-forward`, `deck-delay-forward` (with `--deck-forward-delay`), `deck-forward-only` and `deck-backward-only` cover the usual cases. `useNavDirection()` reads it in a component.

**Slide hooks.** `useSlideEnter(fn)` and `useSlideLeave(fn)` (Slidev's `onSlideEnter` / `onSlideLeave`) run when a slide becomes, and stops being, the current one in that window — slides stay mounted while near, so mount is not "shown". They never fire for the presenter's next-step box, the overview, print or the audience's mirror, and StrictMode does not double them; an enter can return a cleanup that runs on leave.

## Themes and looks

`T` (or the palette button) opens the theme menu on every view — play, presenter, audience: the themes the deck ships (`theme` and `themes`) and light or dark. Each screen keeps its own choice per deck in the browser.

**Theme and addon packages.** `theme: seriph` in the headmatter finds a built-in theme (minimal, rla, stack), then `@kadal/theme-seriph`, then `kadal-theme-seriph`, then the package `seriph`; `theme: ./theme` is a folder beside deck.mdx. `addons: [qr]` finds `@kadal/addon-qr` / `kadal-addon-qr` the same way. The Vite plugin resolves them from the deck's folder and imports their CSS and modules for you — no line in main.tsx — and a package that is not installed fails the build with what it tried and the command that installs it. Their layouts, components and layers merge in under the deck's own; `themeConfig: { primary: "#0f766e" }` becomes `--theme-primary` on the deck root; a theme's `shiki` themes colour the code. `kadal-deck info themes` lists the installed ones; `kadal-deck new --theme <name>` (or `--addon`, or `npm create @kadal/deck -- --theme <name>`) scaffolds one ready to publish; `kadal-deck theme eject` copies the deck's theme — built-ins too — into `./theme` and points the headmatter at it. The prebuilt shell bundles every first-party theme package and falls back to minimal, with a notice, for one it lacks. The contract, the tokens and every class a theme styles: [THEMES.md](./THEMES.md).

**Slidev's themes.** Five first-party packages port Slidev's official themes, with their layouts, frontmatter, slots, components and colour schemes: `classic` (Slidev's `default`), `seriph`, `crisp`, `bricks` and `shibainu` — `npm i @kadal/theme-seriph`, then `theme: seriph`. The prebuilt shell has them all. The name mapping is in [THEMES.md](./THEMES.md#6-first-party-themes-and-slidevs).

**Kadal's own themes.** Eight first-party packages, each with its own layouts and components, light and dark (neon is dark only), print-safe and checked for contrast: `ocean` (Kadal's sea, calm gradients; `waves`, `depth`), `folio` (editorial serif; `pull-quote`, `essay`, `chapter`), `swiss` (grid and grotesk, one signal colour; `poster`, `index`, `grid`), `terminal` (mono, dark first, code as editor windows; `code`, `shell`, `<Terminal>`), `lecture` (numbered sections, a course footer, `<Theorem>`/`<Definition>`/`<Proof>`, `<Cite>`, `references`), `brand` (colours, logo and footer from `themeConfig`; `title-logo`, `agenda`, `metrics`), `crayon` (pastel stickers for classrooms; `activity`, `cards`, `<Sticker>`, `<Bubble>`) and `neon` (synthwave; `launch`, `horizon`, `<Glow>`). `npm i @kadal/theme-ocean`, then `theme: ocean`; each package's README has its `themeConfig` and a picture, and `examples/themes` shows them side by side (press `T`).

**Layers.** `global-top.tsx`, `global-bottom.tsx`, `slide-top.tsx` or `slide-bottom.tsx` beside deck.mdx (or in `src/`), `<Deck layers={{ "global-bottom": Footer }}>`, and themes and addons draw on every slide; a layer gets `{ page, total, slide, click, layout, print }`, so a footer with the slide number is three lines. They show in play, print and export, in the presenter view unless `layers: { presenter: false }`, on overview tiles with `layers: { overview: true }`.

**Fonts.** `fonts: ["Inter:wght@400;600"]` as before, or Slidev's object — `fonts: { sans: Inter, heading: Fraunces, mono: Fira Code, weights: "400,600", italic: true, provider: google | bunny | none, local: [Helvetica Neue] }` — which also points the theme's font tokens at the families. Exports wait for them.

Backgrounds (`background: name` in frontmatter, `{ component, ...props }` for props, or `<Background name>` inside a slide): mesh, aurora, waves, lines, beams, sparkles, starfield, grid, dots, noise, spotlight, the quieter set — topo (contours, with index lines), glows, graticule, hex, constellation, vignette, rays, stripes, sweep — and the map room: **globe** (a wire globe off to one side, turning slowly, day and night sides), **lattice** (a grid zooming into one cell three levels deep), **thiessen** (drifting seeds under their Voronoi polygons), **cells** (reports landing on a lattice, rippling, going dark), **compass** (a rose with its degree ring turning), **neatline** (a map sheet's frame with coordinate ticks, north arrow and scale bar), **scan** (a graticule swept by a satellite pass), **track** (a GPS trail with a pulsing head), **raster** (a choropleth of cells classed by a drifting field, with its legend), **plane** (a dotted ground plane in oblique projection — the lattice an exploded figure stands on — with surveyor's control points at every `major`-th point, thinning toward a `horizon` and away from `focus` so words beside the figure sit on clean paper, and one slow glint crossing it; a figure that carries `data-plane="origin"` and `data-plane="unit"` marks has the floor locked onto it, point for point, at any size). All pause off-slide and hold a still frame under reduced motion; colours are CSS strings, so `rgba()` sets their weight. With a component, `color` is the component's stroke and `fill` (or `tint`) washes the layer behind it — a soft diagonal gradient of that one colour, strongest top-left, never a flat block (`background: { component: topo, color: "rgba(5,150,105,0.55)", fill: "rgba(5,150,105,0.12)" }`); `tint:` alone does the same on a slide without a component, where plain `color:` stays flat.

Bling components, all reading the theme's tokens: `<GradientText>`, `<Glass tone glow>`, `<Glow>`, `<Chip tone icon>`, `<Icon name>` (any Lucide icon, or Iconify's `set:name`), `<Divider label>`, `<Ribbon>`, `<Halo>`, `<Shimmer>`, `<Blob>`, `<Tilt>`. Tones: accent, accent-2, good, warn, bad, info, neutral, purple, pink, amber, teal.

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

Embedded pages (`layout: iframe*`, `<Iframe>`) load when their slide shows, unload when it is left, and sit behind a "click to interact" shield so keys keep driving the deck until you mean it; `Done` hands the keyboard back. The slide a press lands on next has its pages loading already, hidden, so arriving there looks instant. `<Iframe scale={0.5}>` renders a page at twice the pane and shrinks it, for a desktop layout in a small card. `posterUrl:` (or `<Iframe posterUrl>`) photographs a different address for the poster — the same page in a state its URL does not carry — and `posterWait:` gives it longer than the default five seconds to settle. Posters are taken on the machine's GPU when it has one (a map on software WebGL draws too slowly to be photographed), once the page's requests have gone quiet, at 2×. Where a page cannot be live — print, the overview, the presenter's next-slide box, the scroll view — and while it loads, a **poster** stands in: `poster: shots/map.jpg` on the slide (or `<Iframe poster>`), else the screenshot `kadal-deck export` captures for that URL at the pane's size into `public/posters/` (`--posters` captures only, `--refresh-posters` recaptures), else a card with the address. `<Youtube>` and `<Tweet>` take `poster` too, and get captured ones the same way: the video's player, and the post once for each colour scheme. A slide whose content overflows is scaled to fit (`autoFit`, on by default).

## Views

- `/<slug>/?print-pdf` — every slide as a page; on screen the pages are zoomed to the window, the browser's print dialog gets them at full size. `&range=1,3-5`, `&clicks=0|1` (a page per click step or not), `&notes=0|1|page`, `&omit-background` and `&scheme=dark` narrow it — the same options every exporter passes.
- `/<slug>/` — the deck. The stage is authored at 1920 × 1080 and scaled uniformly to every window: edge to edge on a 16:9 screen, centred between bars on any other shape — a phone, a tall window, a projector at 4:3 — never reflowed. `?view=scroll` reads it as a page, `?print-pdf` lays it out for print.
- `/<slug>/presenter` — current + next, notes with click markers (each one a button to its step; `[click:3]` names the step), a stopwatch or countdown timer (`timer: countdown`, `duration: 30min`) that pauses, resets, fills a progress bar with a tick where this slide should be and goes red in overtime, with pacing (ahead/behind the plan for this slide — also on the phone remote and in the room panel), tools (draw, laser, spotlight, blackout, share notes, share terms, confetti, camera, record, mirror, link), the room panel (QR, presence, pace, questions, polls; collapses to a rail with badges for hands, open questions and open polls, and the current-slide card grows). Passcode-gated on a host. Drawing: each pen is a colour family and a stroke drifts through it as it travels; strokes are scribbles that linger five seconds and unwind along their own path on every screen — the pin keeps them.

**Drawing.** <kbd>C</kbd> (or **Draw**) turns the pen on in the play view and the presenter view; a stylus draws without it, and its eraser end erases. While it is on: <kbd>1</kbd>–<kbd>7</kbd> pick pen, highlighter, line, arrow, rectangle, ellipse and eraser (<kbd>E</kbd> toggles the eraser), <kbd>Shift</kbd> keeps a line or arrow at 45° steps and makes a rectangle a square and an ellipse a circle, <kbd>[</kbd> <kbd>]</kbd> step the width, <kbd>Ctrl</kbd> <kbd>Z</kbd> undoes and <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> (or <kbd>Ctrl</kbd> <kbd>Y</kbd>) redoes — strokes, shapes, erases and clears alike — <kbd>Shift</kbd> <kbd>C</kbd> clears, <kbd>Esc</kbd> is done. The toolbar also has any colour and the scissors: the eraser takes whole strokes, or with the scissors on cuts only where it passes. Arrowheads grow with the stroke. Everything drawn reaches the deck's other windows in this browser at once (the window bus — no room needed), the room when there is one, and the phone remote's pen, which has the same shapes and eraser. Commands: `draw.toggle`, `draw.tool`, `draw.pen` (`shape`, `erase`), `draw.shape`, `draw.undo`, `draw.redo`, `draw.clear`.

**Saved drawings.** Slidev keeps drawings in `.slidev/drawings`; Kadal keeps them in `drawings/` beside deck.mdx, one ordinary SVG per slide, named by its `id:` or else its number (`drawings/3.svg`). With `drawings: { persist: "files" }`, every pinned stroke, shape and erase on `kadal-deck dev` is written there (`/__kadal/drawings`); `kadal-deck build` bundles them, so the hosted copy and `kadal-deck publish` carry them, and the print view draws them, so PDF, PNG, PPTX and the `/export` page include them. Files are the base layer, live strokes go on top; outside the dev server they are read-only, and pinned strokes fall back to browser storage (`persist: true`, the default). An SVG from elsewhere loads too — `<line>`, `<rect>`, `<ellipse>`, `<polyline>` and paths become strokes, scaled from the file's viewBox (a Slidev drawing comes across). `perClick: true` ties a stroke to the click step it was drawn on: it shows from that step on, and print pages per step follow. The hosted shell reads `drawings/*.svg` from the files it is given.

**Camera and recording.** <kbd>V</kbd> in the play view, or the presenter's **Camera**, puts your camera in a bubble ON the slide — in the play view, any shared window and the presenter's current-slide preview at once — so a recording or a screen share of the audience's view has you in it. Drag it to move it, its corner to resize it, or focus it and use the arrows and + −; a circle, a rounded box or a rectangle, mirrored or not; position, size and shape are remembered per deck. The arrow beside **Camera** picks the camera and microphone (remembered in the browser). It never prints. **Record** records the screen with your voice, the camera alone, or both as two separate files started together; with pause and resume, a clock of recorded time, WebM or MP4 where the browser can, the shared tab's sound mixed in, and file names that say the deck, your label, what and when (`talk-dry-run-camera-2026-10-22-1430.webm`). WebM files get their duration written in, so players show the length and seek. Commands: `media.camera`, `media.record`, `media.recordPause`.
- `/<slug>/join` — the audience page: the deck at the presenter's slide in a stage-exact mirror (same scale, auto-fit and backgrounds as the projector; embedded pages load live, staggered so a room of phones does not hit a site at once), tap or ⤢ to fill the screen sideways with the reactions floating, plus reactions, ask + upvote, polls, quiz with nickname, pace, raise a hand, bookmarks, the notes when shared.
**Following.** A viewer who opens a live deck starts in step with the presenter and is shown nothing about it — the deck simply moves. The moment they move themselves, by any means at all (a key, an arrow, a swipe, the overview, search, the progress bar, a link that changes the hash, a second tab of their own browser), they stop following and nothing moves them again: the presenter can step through the whole deck and the viewer stays exactly where they stopped reading. A pill then offers **Follow the presenter**, which jumps them to where the presenter is and puts them back in step.

Where a window starts, in order of how much each signal knows: a `?at` link — one the deck itself minted ABOUT a slide (a share link, the phone's "Open full") — lands on that slide, free, and the marker is taken out of the address bar once it has been read; failing that, what this viewer last chose for this deck, for twelve hours, which is what carries a bookmark taken mid-talk, a tab closed at the interval or a sleeping phone back in step; failing that, a plain link follows and a bare hash is a slide someone typed. The hash alone cannot decide it, because the deck writes the hash as the viewer navigates: a bookmark's address is indistinguishable from a link someone chose to send, which is why the deliberate ones say so.

The phone page roams the same way — a chevron on each edge of the slide, or a swipe across it, and the same button underneath. What still reaches a viewer who is reading on their own: the presenter's drawings (kept per slide, so they appear on the slide they were drawn on), confetti, a shared term card (it names a slide, so it opens only on that one), blackout. What does not: the laser and the spotlight, which point at a place on the presenter's slide and mean nothing on any other.

The one rule underneath: a move with no `sync.source` is a person, here, and ends the follow — see `withTransition` in `react/Deck.tsx`. Everything arriving from the room, from another window, or from the deck's own auto-slide carries a source and leaves the follow alone.

- `/<slug>/?projector` — a window that exists to be LOOKED at: a second screen, or the one window to share on a call. It renders the deck exactly as `/<slug>/` does — backgrounds, controls, progress, slide number, the presenter's laser and pen, reactions — and gives up only input: no key, swipe, wheel or click reaches navigation, and the follow can never be broken, because a stray press on a shared window in the middle of a call is not a thing to be recoverable from. It shows no cursor. The presenter view's **Share window** button opens and closes one with a plain `window.open`, so it works in any browser; a desktop shell that wants to give it a frame of its own only has to recognise the URL.
- `/<slug>/notes` — every note on one page, following the presenter (the current part lit, markers jump). `/<slug>/notes-edit` — every note as Markdown on one page, saved as you type. `/<slug>/overview` — every slide in order with a slider through its steps and its notes beside it. **Editing notes**: under `kadal-deck dev` the presenter's notes panel, /notes, /overview and /notes-edit edit a slide's notes in place (Edit or double-click; Cmd/Ctrl+S or leaving the field saves, Esc puts it back) through the dev server's `/__kadal/notes`, which rewrites only that slide's notes in deck.mdx (or the file it includes) and pushes them to every open view without a reload; a save that finds the notes changed meanwhile offers the file's version or yours. A built deck is read-only; a host passes `<Deck notesEditor={{ load, save }}>` for its own save path. `/<slug>/stats` — views, dwell per slide, sessions, questions, reactions, exports, share links.
- `/<slug>/export` — the browser exporter, on every deck (hosted ones too, no Playwright): PDF through the browser's print, a zip of PNGs, an image-per-slide PowerPoint file with the notes, or Markdown with the PNGs; range, click steps, colour scheme, notes, picture size and a transparent background, previewed live, with progress and Cancel.

## Narration

Rehearse with the deck reading its own notes. The presenter view has a narration bar at the
bottom; on the deck itself `?narrate` shows it and **R** starts or pauses it. Each `[click]` part
of a slide's `<Notes>` is said at its step, then — after `narration.gap` — the deck runs `nav.next`
and the next part is said, so the presenter window, a projector and the room follow exactly as
they follow you. A slide without notes stays up long enough to read it (`narration.silent`).
Navigating by hand while it plays moves the narration with you; pause stops the voice at once.
The bar has previous / play / next / stop, speed (0.8–2×), mute and volume, the voice, the engine,
"follow" (off: it reads on without turning pages), and a timeline with a mark per slide (hover
for the title, click to narrate from there). Every control is a `narrate.*` command
(`narrate.play {from}`, `narrate.rate`, `narrate.voice`, `narrate.state`…), so an agent or the
phone remote can drive it too. Frontmatter: `say: "…"` replaces a slide's notes;
`narration: false` keeps it quiet (in the headmatter: turns narration off).

Voices, chosen per segment by `narration.engine: auto`:

1. **Baked clips** — `npx kadal-deck narrate` speaks every segment once and writes the files into
   `public/`. Instant, the same everywhere, no model in the browser. A clip is found by the
   SHA-256 of `voice|text`, so editing a sentence just falls back until you run it again.
2. **Kokoro-82M in the browser** — in a Web Worker on WebGPU (fp32) or WebAssembly (q8). It starts
   downloading (~90 MB on WebAssembly, ~300 MB on WebGPU, kept in the browser cache) the first
   time someone presses play, never on page load; the browser's voice reads until it is ready, and
   each next segment is synthesized while the current one plays.
3. **The browser's own voice** (`speechSynthesis`) — always there, no download.

Kokoro needs `kokoro-js`, an **optional peer**: `npx kadal-deck narrate --setup` adds it to the
deck (it brings transformers.js and the ONNX runtime, a few hundred MB in `node_modules`, and adds
a ~2 MB worker and ~22 MB `.wasm` to the build — fetched only when narration uses Kokoro). Without
it nothing of it is built and the narrator uses baked clips and the browser's voice. The weights
come from the Hugging Face Hub at run time; see `THIRD_PARTY_NOTICES.md` for the licences
(eSpeak NG, inside the phonemizer, is GPL-3.0-or-later).

## Export

```sh
npx kadal-deck export                         # PDF into export/ (builds + previews the deck itself)
npx kadal-deck export --png --pptx            # also PNGs and a PPTX (one image per slide, notes attached)
npx kadal-deck export --format pptx-editable  # PowerPoint you can edit: native text, lists, shapes, tables
npx kadal-deck export --format md             # export/<name>.md + export/png/: the slides with their notes
npx kadal-deck export --range 1,3-5 --dark    # some slides, in the dark scheme
npx kadal-deck export --png --omit-background # transparent PNGs
npx kadal-deck export --posters               # only capture posters for the embedded pages
```

- **PDF**: each page is a picture of the slide with its text printed over it as text, so it looks
  the same in Preview, Acrobat, Chrome and Poppler and stays searchable. It carries bookmarks — a
  slide's title at its first page, vertical stacks and `level`s nested, `hideInToc` slides left
  out (`--no-with-toc` for none) — and the deck's title, author, `info` and `keywords`.
  `--vector-pdf` prints with the browser alone.
- **Editable PPTX** (`--format pptx-editable`, written as `<name>.editable.pptx`): every slide is
  measured in the browser and rebuilt as PowerPoint objects — text boxes with their runs (font,
  size, colour, bold, italic, underline, strike, links, letter spacing), alignment and line
  height; lists with real bullets, numbering and levels; rectangles, rounded rectangles and
  ellipses with their fill, border and shadow; pictures as the original files, cropped as
  `object-fit` and `background-size` crop them; tables as tables; code as coloured monospace runs.
  What PowerPoint cannot draw — SVG, canvas, maths, diagrams, embedded pages, gradients, filters,
  masks, rotated or blended things, pseudo-element decorations — is photographed where it stands,
  so nothing goes missing. The speaker notes are attached. `data-export="image"` on an element
  photographs it whole; `data-export="skip"` leaves it out. A .pptx names its fonts without
  carrying them, so the export lists the families its recipients need.
- **Markdown** (`--format md`): `<name>.md` with a picture of every page (from `png/`) and each
  slide's notes under it, slides separated by `---` (Slidev's shape).
- **Every format**: `--range 1,3-5`, `--dark` / `--scheme light|dark`, `--with-clicks` /
  `--no-with-clicks` (a page per click step, or one per slide; the deck's `pdfSeparateFragments`
  by default), `--omit-background`, `--per-slide` (one page load per slide, for very large decks),
  `--timeout <ms>`, `--wait <ms>`, `--wait-until networkidle|load|domcontentloaded|none`,
  `--executable-path <chrome>`, `--output <name>`, `--scale <n>`, `--json`.
- **In the browser**: `/<slug>/export` does PDF, PNG, image PPTX and Markdown with no Playwright.
- **A Download button**: `download: true` in the headmatter shows one beside the theme menu;
  `kadal-deck build` then prints `dist/deck.pdf` for it (or `kadal-deck build --download` without
  the key), and without one it opens `/export`. `download: "talk.pdf"` (or a URL) links that file.
  A host can turn it off or point it elsewhere (`window.__KADAL_DECK__.download`).

Needs `playwright` installed in the deck: it is an optional peer, so a deck that never exports
never downloads a browser. `pptxgenjs` and `pdf-lib` come with the engine (and load only when
used).

## Publish

`npx kadal-deck publish` puts the deck on https://deck.kadal.cc with a live room, analytics and
share links (free plan included). Any static host also works: `npx kadal-deck build` and upload
`dist/` — everything except the live room runs without a server.

### Sandboxed hosting (opaque origins)

deck.kadal.cc serves every published deck with `Content-Security-Policy: sandbox` and without
`allow-same-origin`, so a deck keeps its `/@handle/slug/` address but runs in an *opaque origin*:
it can't read the visitor's cookies, storage or account on the host. Any host may do the same, and
the engine is built for it:

- `localStorage` and `sessionStorage` throw there; the deck's preferences, drawings, bookmarks
  and nickname fall back to memory for the page (`src/core/storage.ts`). Guard storage the same
  way in your own components.
- Every request the deck makes to its host is cross-origin and carries no cookies: serve the
  deck's files with `Access-Control-Allow-Origin: *` (module scripts and fonts are CORS requests),
  and give the presenter a ticket instead of a cookie — `#ticket=…` in the URL, or
  `window.__KADAL_DECK__.ticket` (`src/live/ticket.ts`).
- Windows of one deck no longer share a BroadcastChannel; the play window, presenter view and
  share window keep in step through the windows they opened (`src/core/windows.ts`) and the room.
- Turnstile can't run in an opaque origin; a host that wants it names its own verification page
  (`window.__KADAL_DECK__.verify`).

`node tools/opaque-check/run.mjs` drives a published deck through all of this against a local host.

## Layout of this package

- `src/compiler` — splitting, frontmatter, code meta, magic-move, slots, plain text for search, the glossary pass
- `src/glossary` — the glossary model shared by compiler and browser (matcher, inline Markdown, options) and the YAML parser
- `src/vite` — the plugin: `virtual:deck` manifest, one module per slide / notes / magic block
- `src/core` — model, navigation, click registry, hash, keyboard, layout, touch (pure, tested)
- `src/react` — the runtime: Deck, Stage, SlideFrame, layouts, backgrounds, auto-animate, chrome, overview, scroll, print, lightbox, zoom
- `src/components` — everything a slide can use
- `src/sketch` — Excalidraw: the DSL, the renderer (elements → theme-aware SVG), the canvas
- `src/live` — the room protocol, client, provider, live components, analytics, Turnstile
- `src/draw` — drawing layer, strokes, shapes, the eraser, undo/redo, the shared drawing and its SVG files
- `src/media` — the camera bubble, the recorder and its WebM duration fix
- `src/presenter`, `src/audience` — the pages
- `src/backgrounds` — the background components
- `src/themes` — base.css (engine), live.css, minimal / rla / stack
- `src/export` — Playwright export to PDF, PNG, PPTX, editable PPTX (`pptx/`), Markdown; the
  browser exporter (`browser/`)
- `src/catalog` — `@kadal/deck/catalog`; `generated.ts` comes from `tools/catalog-extract.ts` (`bun run catalog`)
- `src/authoring` — `@kadal/deck/authoring`: outline, lint and line-exact edits of a deck as text
- `src/cli` — the `kadal-deck` CLI (commands, args, render, new, host/login/publish)
- `src/mcp` — `kadal-deck mcp`, the MCP server
