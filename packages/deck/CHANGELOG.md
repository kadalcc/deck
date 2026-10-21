# @kadal/deck

## 0.4.0

### Minor Changes

- e08452a: Build and hosting, on par with Slidev and past it:

  - The built page's head comes from the headmatter: title, `info` as the description, author, `lang`, `favicon`, and `seoMeta` with Slidev's names (Open Graph, Twitter cards, canonical, theme-color, any other meta tag). The runtime keeps the document's head in step, so decks the hosted player compiles get them too.
  - `seoMeta.ogImage: auto` photographs slide 1 into `og-image.png` (1200×630) during `kadal-deck build`; a committed `og-image.png` or a path is used instead, and a build without Playwright skips it with a message.
  - `pwa: true` (or `build --pwa`) makes the deck an installable app that presents offline: a manifest, icons in the theme's colours (or your favicon), and a small service worker that saves the whole build, says when it is ready, and offers a new version with a Reload button instead of reloading mid-talk. It never answers the live room, the host's `/api`, the dev endpoints or the phone remote, and never runs in dev; `publish` leaves it out unless `--pwa`.
  - `bundleRemoteAssets: true` (or `--bundle-remote-assets`; Slidev's `remoteAssets` too) downloads remote images, video, Google/Bunny Fonts and CSS `url()`s into the build, cached between builds, so a deck needs no network at all.
  - `kadal-deck build a.mdx b.mdx` builds several decks into their own folders with a page listing them; `--out` names the folder, and `--base` now reaches `--download`'s PDF step too.
  - Every build copies index.html into each route's folder and writes `404.html` and `_redirects`, so `/presenter`, `/notes` and `/remote` work on GitHub Pages, S3 or nginx without rewrites.
  - New commands: `kadal-deck serve` serves a build as a static host would (its base, routes, Range requests, cache headers), and `kadal-deck ci <github-pages|netlify|vercel|cloudflare|docker>` (or `new --ci`) writes that host's deploy files for the deck.
  - `kadal-deck check` warns about a missing `favicon` or `ogImage` file and an `og:image` that will not be a full URL.

- f78ff3e: The developer-talk code toolkit:

  - **Notation marks.** `// [!code ++]`, `[!code --]`, `[!code highlight]`, `[!code focus]`, `[!code error]` / `[!code warning]` and `[!code word:x]` at the end of a line mark it, in light and dark, alongside click-stepped highlights. `deck({ shiki: { transformers } })` adds your own Shiki transformers, in the Vite plugin and in the browser compiler.
  - **Code groups.** `::code-group` … `::` (or `<CodeGroup>`) turns titled fences into tabs with file-type badges, keyboard and screen-reader friendly; `{clicks:true}` turns tabs on clicks, `{print:'all'}` prints every tab.
  - **Snippet imports.** `<<< @/snippets/x.ts#region {2|4} [x.ts]` puts a file, or one `#region` of it, on a slide; the file is watched in dev, and the hosted shell fetches it from beside deck.mdx.
  - **TwoSlash.** ` ```ts twoslash ` shows type hovers (also by keyboard), compiler errors and `// ^?` queries, computed at build time (needs `typescript`); the hosted shell renders such blocks plain.
  - **Monaco.** `{monaco}` editors, `{monaco-diff}` diffs, `{monaco-run}` with a Run button and the output on the slide (JavaScript and TypeScript in a Web Worker with a timeout, Python in Pyodide, any language through `registerCodeRunner` or `setup/code-runners.ts`), and `{monaco-write}` that saves edits back to the file in `kadal-deck dev`. Monaco is a lazy chunk, bundled (no CDN), never in the main bundle; print, export and the phone remote show the highlighted code and the run's output.
  - `kadal-deck check` knows all of the above: missing snippet files and regions, unknown code options, a diff without its `~~~`, a run block with no runner.
  - Fix: the pause curtain and the confetti layer no longer swallow pointer events over the whole slide.

- e42ad6a: Slidev's built-in components, and every icon.

  - **Any Iconify icon**: `<Icon name="mdi:account" />`, or Slidev's tag form `<mdi-account />`, `<logos-vue class="text-3xl" />` (and UnoCSS's `<div class="i-carbon-logo-github" />`). Lucide names keep working. `kadal-deck dev` and `build` bundle the drawings from the deck's own `@iconify-json/<set>` (or `@iconify/json`) packages, so a built deck needs no network; the hosted player fetches them from the Iconify API once and keeps them, and shows a dashed box offline. `kadal-deck check` names a misspelt icon (with the nearest names) and the set to install.
  - **Elements placed by hand**: `<Drag pos="x,y,w,h,rotation">` or `<Drag pos="name">` with `dragPos:` in the slide's frontmatter, and `<DragArrow pos="x,y,dx,dy" />`; Slidev's `v-drag`, `<v-drag>` and `<v-drag-arrow>` compile to them. In `kadal-deck dev`, double-click one to move, resize, turn and nudge it with the arrow keys; the position is saved into deck.mdx and nothing else in the file changes, without reloading the page.
  - **`<Mark>`** draws every rough-notation type — underline, box, circle, highlight, strike-through, crossed-off and bracket — as a hand-drawn stroke on its click, with `strokeWidth`, `padding`, `iterations`, `multiline`, `brackets`, `duration`, `delay` and `opacity`. The wobble is the same on every screen and in the PDF.
  - **`<Switch>`** with `<Case>`s shows one block per click (Slidev's v-switch), in one spot so nothing below jumps.
  - **`<Video>`** follows the clicks: `at`, `pauseAt`, `steps` (play, pause, rewind or jump at a click), plus Slidev's `autoplay="once"`, `autoreset`, `timestamp`, `printPoster` and `printTimestamp`; inside a `<Click>` it starts when revealed.
  - **`<LightOrDark>`, `<RenderWhen context>`, `<SlideCurrentNo>`, `<SlidesTotal>`, `<TitleRenderer>`** and **`<BlueSky>`** (a Bluesky post in the deck's colour scheme, with export posters).

- 479e4ae: Drawing tools, saved drawings, the camera on the slide, and a better recorder.

  - **Shapes and an eraser**: the pen's toolbar now has line, arrow, rectangle and ellipse (hold Shift to keep a line at 45° steps, a rectangle square, an ellipse round; arrowheads grow with the stroke), an eraser that takes whole strokes or, with the scissors on, cuts only where it passes, redo next to undo, any colour, and more widths. While the pen is on, 1–7 pick the tools, E toggles the eraser, [ and ] change the width, Ctrl Z undoes and Ctrl Shift Z (or Ctrl Y) redoes — strokes, shapes, erases and clears alike. A stylus's eraser end erases. The phone remote's pen has the same shapes, the eraser and redo.
  - **Drawings shared between windows**: what you draw in the presenter view shows on the play view and any shared window in the same browser at once, with or without a live room. Shapes travel through the room like strokes.
  - **Saved drawings**: `drawings: { persist: "files" }` writes pinned drawings to `drawings/<slide>.svg` beside deck.mdx while you run `kadal-deck dev`. Files in `drawings/` are shown under the live strokes, are bundled by `kadal-deck build` (so hosted and published copies have them), and are printed, so PDF, PNG, PPTX and the `/export` page include them. Ordinary SVGs work too — a Slidev drawing loads. `drawings: { perClick: true }` ties each stroke to the click step it was drawn on. `drawings: { enabled: "dev" }` turns the pen on only on the dev server.
  - **Camera on the slide**: V (or the presenter's Camera button) shows your camera in a bubble on the slide itself — on the play view, any shared window and the presenter's preview at once — so a recording or a screen share has you in it. Drag it, resize it from its corner, make it a circle, a rounded box or a rectangle, mirror it or not; it is remembered per deck and never printed. The arrow beside Camera picks the camera and microphone.
  - **Recording**: record the screen with your voice, the camera alone, or both as two separate files; pause and resume, a clock, WebM or MP4 where the browser supports it, the shared tab's sound mixed in, and clear file names. WebM recordings now carry their duration, so players show the length and can seek.

- 62d24fc: Export, in depth.

  - **Editable PowerPoint**: `kadal-deck export --format pptx-editable` rebuilds every slide as native PowerPoint objects — text boxes with their fonts, sizes, colours, bold/italic/underline/strike and links; lists with real bullets, numbering and levels; rectangles, rounded rectangles and ellipses with fill, border and shadow; pictures as the original files (cropped as the slide crops them); tables as tables; code as coloured monospace text. Whatever PowerPoint cannot draw (SVG, canvas, maths, diagrams, gradients, filters, decorations) is placed as a picture exactly where it stood, so nothing is lost. Speaker notes are attached.
  - **Markdown**: `--format md` writes a `.md` file with a picture of every page and each slide's notes under it.
  - **PDF bookmarks and metadata**: the PDF now opens with an outline built from the slide titles (vertical stacks and `level`s nested; `--no-with-toc` turns it off) and carries the deck's title, author and description.
  - **Flags on every format**: `--format`, `--range 1,3-5`, `--dark` / `--scheme`, `--with-clicks` / `--no-with-clicks`, `--omit-background` (transparent pages), `--per-slide`, `--timeout`, `--wait`, `--wait-until`, `--executable-path`, `--output`, `--port`. Slidev's spelling (`--with-clicks false`) works too.
  - **The browser exporter at `/export`**: every deck, hosted ones included, can be saved as a PDF (the browser's print), a zip of PNGs, an image PowerPoint file or Markdown, with a live preview, a range, click steps, colour scheme, notes, picture size, a transparent background, progress and Cancel — no Playwright needed.
  - **A Download button**: `download: true` in the headmatter shows one beside the theme menu and makes `kadal-deck build` print `dist/deck.pdf` for it (`kadal-deck build --download` does it without the key); without a built PDF it opens `/export`. `download: "talk.pdf"` links a file of your own. Hosts can switch it off or point it elsewhere through `window.__KADAL_DECK__.download`.
  - The print view takes `?range=`, `?clicks=`, `?notes=` and `?omit-background`, and any page `?scheme=light|dark`.
  - `pptxgenjs` is now a regular dependency (it was an optional peer), so PowerPoint export works out of the box; `pdf-lib` joins it for the PDF outline.
  - Fixed: the theme menu (and anything else in the corner) could not be clicked in the play view, because the confetti layer and the pause curtain took the clicks.

- 9d6191f: Eight new themes of Kadal's own, each an npm package with its own layouts and components, light and dark, print-safe and checked for contrast: **ocean** (Kadal's sea, calm gradients, a wave cover and depth-gauge section openers), **folio** (an editorial serif for essays and keynotes: pull-quotes, a drop-cap essay column, chapter openers), **swiss** (a strict grid, huge grotesk headings and one signal colour, with a running header), **terminal** (mono-forward and dark first, code blocks as editor windows, a `<Terminal>` session component), **lecture** (numbered sections, a course footer, theorem / definition / proof blocks, citations and a references slide), **brand** (colours, logo and footer from `themeConfig` alone, with title, agenda and metrics layouts), **crayon** (pastel stickers and speech bubbles for workshops and classrooms) and **neon** (synthwave for launches, with a solid print fallback). Install one and name it: `npm i @kadal/theme-ocean`, `theme: ocean`. The hosted player bundles them all.

  Also: a theme picked from the theme menu now loads its own fonts, instead of wearing the deck theme's.

- 6f74216: Presenting, on a par with Slidev and past it:

  - The presenter's timer is a stopwatch or a countdown (`timer: countdown`, `duration: 30min` — also `1h`, `90s`, `25:00` or minutes) that pauses, resumes and resets, fills a progress bar with a tick where this slide should be, and goes red in overtime. The pacing badge stays, and the phone remote and the room panel show the same timer (tap the remote's timer to pause it).
  - Speaker notes can be edited in the presenter view, on `/notes`, on the new `/overview` and on the new batch editor `/notes-edit` while `kadal-deck dev` runs: the dev server rewrites only that slide's notes in deck.mdx and the views update without a reload. Saves are conflict-safe. A built deck stays read-only; a host can pass `<Deck notesEditor>`.
  - `[click]` markers in notes are buttons that jump to their step, past/current/future parts are styled and the current one is kept in view — in the presenter, on `/notes`, `/overview` and the phone remote. `[click:N]` names a step.
  - `/overview`: every slide with a slider through its steps and its notes.
  - Display settings (`,`): brightness, contrast, saturation, sepia, hue and invert for the slides, per deck per browser, shared live between its windows.
  - A right-click context menu (`contextMenu: true | false | "dev" | "build"`), keyboard accessible, with custom items through `<Deck contextMenu>` or `deck.menu.add`.
  - Custom shortcuts: `<Deck shortcuts>`, `defineShortcuts`, `deck.shortcuts.add`, listed in the `?` sheet. The `keyboard: { KeyX: action | null }` map now works as documented.
  - Navigation direction: `data-nav-direction` on the root, stage and moving slides, `--deck-nav-sign`, `forward:` / `backward:` Tailwind variants in the starter and plain `deck-instant-back`-style classes. Tailwind utilities can now change a click's timing.
  - `useSlideEnter` / `useSlideLeave` (and `onSlideEnter` / `onSlideLeave`), `useIsSlideActive`, `useNavDirection`.

- 28b93c0: Import a Slidev deck in one command: `kadal-deck import slidev <slides.md | folder>` writes a new
  deck folder (the way `kadal-deck new` makes one) and an `IMPORT-REPORT.md` listing, slide by
  slide, whatever did not carry over exactly. It converts the headmatter (the theme to its Kadal
  port, colour scheme, transitions — Slidev's way out of a slide becomes Kadal's way in — drawings,
  canvas size, fonts, defaults, export options), every click directive and its component form
  (`v-click` with its values and modifiers, `v-after`, `v-clicks`, `v-switch`, `v-mark`, `v-motion`,
  `v-drag`), Slidev's components by their Kadal names, icons, Vue's template syntax (mustaches,
  bindings, the slide's `<script setup>` constants, `v-for` and `v-if` that can be decided at
  import, `$slidev.nav` click handlers), UnoCSS classes and attributify (written into
  `src/slidev.css` at Kadal's scale), and the project's Vue components, layouts and global layers
  as TSX. Nothing in the Slidev project is run. The converter is also a pure function,
  `convertSlidev` in the new `@kadal/deck/import` entry. Slidev's starter template converts with
  16 of its 17 slides needing nothing further.

  Also: `kadal-deck check` warns about Slidev syntax that compiles but does nothing (`<div v-click>`,
  `<v-clicks>`); a ` ```mermaid {alt: '…'} ` fence's `alt` labels the diagram for screen
  readers; ````md magic-move {lines: true}`numbers its lines;`<Click as="img">` (a void element)
  renders again; and the classic and seriph covers no longer pin a slide's own absolutely placed
  elements (`abs-br`) back into the flow when the cover has a picture.

- 9042c0b: Slidev's syntax works in deck.mdx as it is. HTML comments at the end of a slide are its speaker notes (other comments are dropped instead of breaking the slide), a ``yaml fence at the top of a slide is its frontmatter, `defaults:` in the headmatter applies to every slide, `src: ./more.mdx#2-5` includes only some slides, and a `<style>` block styles only its own slide (`<style global>` for the whole deck). ``mermaid fences take Slidev's options, ```plantuml fences render through a PlantUML server (`plantUmlServer`), `$$ {1|3|all}` lights maths lines one click at a time, and `notesAutoRuby` adds readings to words in the notes. `kadal-deck build --without-notes` and `publish --without-notes` leave the notes out. The Vite plugin and the browser compiler take `remarkPlugins`, `rehypePlugins`, `preprocess`, `katex` and `mermaid` (the last two also as headmatter keys). Custom transitions are now a supported contract: name keyframes under `transitions:` (or `registerTransition`), or style `.deck-stage[data-transition="name"]`; a name nothing defines is a clean cut. The linter knows all of it.
- e3e6cc8: Slidev's five official themes, ported as Kadal theme packages: `@kadal/theme-classic` (Slidev's default theme), `@kadal/theme-seriph`, `@kadal/theme-crisp`, `@kadal/theme-bricks` and `@kadal/theme-shibainu`. Each keeps its Slidev original's layouts with the same names, slots and frontmatter (crisp's `intro-image`, `3-images` and `bullets`; bricks' `items` and `<Polygon1>`–`<Polygon11>`; shibainu's fourteen backgrounds), its `themeConfig` (`primary`), colour schemes, fonts and Shiki themes, and Slidev's proportions exactly. Install one and write `theme: seriph`; the prebuilt shell bundles all five. Each package has a preview deck that reproduces the original theme's example deck. THEMES.md has the Slidev → Kadal name mapping, and the catalog lists the packages (`THEME_PACKAGES`, `kadal-deck info themes`).

  Fixed: slides now take the theme's text colour and body face. They used to inherit the base stylesheet's #111 and system-ui whatever the theme or the headmatter's `fonts` said, because html and body read those tokens before the theme's class applies.

- 1e304e3: Theme and addon packages. `theme: seriph` now finds a built-in theme, then `@kadal/theme-seriph`, then `kadal-theme-seriph`, then a package of that name, and `theme: ./theme` a folder beside deck.mdx; `addons: [qr]` does the same for addons. The Vite plugin imports their stylesheets and modules for you (no line in main.tsx), merges their layouts, components and layers under the deck's own, feeds a theme's Shiki themes to the highlighter, and fails with what it tried and the install command when one is missing. `themeConfig` keys become `--theme-<name>` CSS variables on the deck root; a theme's `defaults` and `config` sit under the deck's own. The prebuilt shell bundles every first-party theme package and falls back to minimal, with a dismissible notice, for a theme it does not have.

  Also new: global and slide layers (`global-top.tsx`, `global-bottom.tsx`, `slide-top.tsx`, `slide-bottom.tsx` beside deck.mdx, or `<Deck layers>`), drawn in play, print and export with the page number and click as props; `kadal-deck theme eject` to copy a theme (built-ins too) into the deck; `kadal-deck new --theme <name>` / `--addon <name>` and `npm create @kadal/deck -- --theme <name>` to scaffold a package ready to publish; `kadal-deck info themes` listing the installed ones; the `two-cols-header` layout; and Slidev's `fonts` object (`sans`, `serif`, `mono`, `weights`, `italic`, `provider: google | bunny | none`, `local`), which exports now wait for. The contract is in THEMES.md.

- cb39d7d: Editor tooling, on a par with Slidev's and past it in places.

  - **`kadal-deck format [files] [--check]`** formats `deck.mdx` and the files it includes: `---`/`----` separators and frontmatter tidied, the YAML formatted with its comments and key order kept, and every slide's Markdown formatted by Prettier — while code fences, `<Notes>` and comment notes, magic-move, `<style>`, maths, `::slot::` markers, code groups and `<<<` imports stay byte for byte. Each formatted slide is checked to mean the same (parsed again as CommonMark and as MDX); one that would not keeps its text and the command says why. `--check` exits 1 when a file would change. The deck's own Prettier config applies.
  - **`@kadal/prettier-plugin`** (new package): the same formatter for any editor or CI that runs Prettier. With the plugin loaded, `deck.mdx` and `slides.mdx` are formatted as decks by name; other files use `"parser": "kadal-deck"`.
  - **A side editor in `kadal-deck dev`**: press E (or `view.editor`, or "Edit slide source" in the right-click menu) to edit the current slide's whole source — frontmatter, body, notes — beside it in CodeMirror, and Cmd/Ctrl+S to save it into the deck file through `/__kadal/source`. Only that slide's lines change; a slide edited elsewhere meanwhile is a conflict to resolve, not an overwrite; unsaved text survives a reload. CodeMirror is never in a build.
  - **`kadal-deck dev --tunnel`** shares the dev server through a Cloudflare Quick Tunnel when `cloudflared` is installed (and says how to install it when not): the https address and a QR code in the terminal, and the phone remote pairs through it. **`--remote [password]`** serves on the network, and with a password the presenter, notes and overview pages and the dev endpoints ask anyone not on this computer for it. A tunnel always has a password (made up and printed when you give none), because the dev server can write your files.
  - Stopping `kadal-deck dev` or `build` with a signal now stops Vite as well.
  - A VS Code extension (Kadal Deck: slides outline with drag-to-reorder, a preview that follows the cursor, frontmatter IntelliSense, `check` as problems, formatting) lives in `packages/vscode`.

### Patch Changes

- fb92912: The pen, the laser and clicks work again on the main deck view: the confetti layer and the pause curtain, which cover the whole window, no longer catch the pointer.
- Updated dependencies [cb39d7d]
  - @kadal/prettier-plugin@0.4.0

## 0.3.6

### Patch Changes

- ebebf60: The ad frame. When the host's override says `ads`, the play view frames the deck's first and last slides:
  - **On a landscape screen:** the slide keeps its shape at 80% of its usual size, flush top-left. A tall ad takes the right-hand column, a wide ad the bottom row, and a QR code the corner, with no letterboxing.
  - **On a phone or portrait window:** the slide spans the top and the ads stack below it.
  - **Controls:** the arrows, slide number and progress bar move inside the slide's area, so none sits over an ad.

  The host answers `GET {api}/decks/{room}/ads` with what to show. Every link is the host's own tracked redirect, and only https links or paths on the host are followed. The engine reports each showing with `POST {api}/decks/{room}/ads/seen`. The frame never appears in the presenter view, the phone remote, the audience page, the overview, or print and its exports. Self-hosted decks have no frame.

- 7b95627: Free-plan watermark. When the host marks a deck as free-plan (the existing `badge` override), every slide carries a small "Made with Kadal Deck" mark in its top-right corner. It is part of the slide, so it scales with it and appears everywhere the slide is drawn: the live deck, the presenter's previews, the overview, thumbnails, and every export made from the print view (PDF, PNG, PPTX). In a PDF the mark stays a link. It replaces the old corner link, which showed only in the play window and was left out of exports. Self-hosted decks, and decks on paid plans, have no mark.
- 19a5946: The presenter's room panel is now a sidebar with tabs, and redesigned:

  - **Room:** the join QR sits on white with the link under it. The link wraps at its slashes instead of running off the edge, and has a Copy button. Below it: a Live / Connecting / Offline pill, tiles for watching, hands up and reactions, a pace gauge that says which way the audience leans, and reaction chips.
  - **Questions:** cards with a vote count and icon buttons to mark answered or delete.
  - **Polls:** cards with Open and Close buttons.
  - **Empty states:** each tab says what will appear there.
  - **Narrow columns:** the tabs not shown fold to icons.

  New `deck.panels` registry: a host can add its own tab to the sidebar (`register({ id, title, icon, mount(el) })`, `open(id)`). A panel is mounted the first time its tab is shown and kept through tab switches and folding. deck.kadal.cc uses it for the Copilot, which no longer floats over the presenter view.

## 0.3.5

### Patch Changes

- 8cc9f68: A deck with a presenter view now always serves the phone remote. Decks made before the remote existed passed only the presenter, audience, notes and stats pages to `<Deck pages>`. The presenter still showed the remote's QR code, and scanning it opened "This deck was built without the remote page". When `pages.remote` is missing, the engine now uses its own remote page. It is loaded in a separate chunk, only when a phone opens `/remote`, so the deck itself doesn't grow. A deck that passes its own remote page is unchanged.
- 13647a8: `export.thumbnail` no longer hangs when the page is in a background tab or a hidden window. It used to wait for the browser to draw a frame, and a hidden page draws none, so publishing from a tab you had just left saved no picture. Every later picture in that visit also queued behind the stuck one. Now a picture goes ahead without waiting for a frame. If one still takes more than 30 seconds, it fails and the next one runs.

## 0.3.4

### Patch Changes

- 5e52261: The narration timeline only moves forward while it plays, and reaches the end when the talk ends. Before, it jumped back for a moment at every new slide and stopped short of 100%.

  Every slide now has a small point on the timeline, and the chapter points stay. Hovering anywhere on the timeline shows a small picture of the slide.

  On the phone remote, the slide preview no longer picks up the remote's own dark styles, so code blocks and poll options look as they do on the big screen. In pen mode, Undo and Clear take the place of the "Hold to point" button, so the notes are no longer squeezed.

  New `export.thumbnail` command: it returns a PNG of one slide. `kadal-deck publish` now sends the host a picture of slide 1 after it publishes; use `--no-thumbnail` to skip it. A picture that can't be made never fails the publish.

  `check` and the builder now warn when a slide starts with settings such as `background: spotlight` but has no closing `---`. Without it, those lines show on the slide as text.

## 0.3.3

### Patch Changes

- 1cabea4: A clearer autoplay (narration) bar.

  - The timeline marks chapters, not every slide: a point at each `layout: section` slide (or at each column when a deck has no sections). Points fill in as the talk passes them, and the current one stands out. Hovering a point names the chapter, its slides and when it starts. Hovering anywhere else names the slide and its time. A click plays from there. From the keyboard, the arrow keys move a slide, Page Up/Down (or Shift+arrows) a chapter, and Home/End go to the ends.
  - Speed, voice and engine are the engine's own lists instead of the browser's selects, so they match every theme in light and dark. Voices are grouped (Kokoro, this browser), each option says what it is, and an engine that isn't installed shows as unavailable. They work with the keyboard: arrows, Home/End, typing to find, Enter, Escape.
  - A slimmer volume slider and evenly sized controls: playback and position on the left, settings on the right. Labels fold away on narrower screens, and on a phone the bar fits in two rows.
  - The phone remote's "Pointer" setting uses the same list, sized for a thumb.

## 0.3.2

### Patch Changes

- 11979f8: Zoom reaches the projector on a hosted deck. The presenter's zoom (Alt+click, or the phone remote's Zoom) now travels through the room like the spotlight. The projector window and every audience screen that follows the presenter zoom with it, and a screen browsing on its own keeps its own view. Before, it only zoomed the presenter view. Needs the matching room (deck.kadal.cc has it).

## 0.3.1

### Patch Changes

- bc47947: Phone remote: one phone at a time, paired by a code that keeps changing, and the air pointer on iPhone.

  - The QR holds a one-time pairing code, not the presenter's ticket. It changes every 30 seconds while the dialog is open (each code works for a minute), so a photo of the screen is soon worthless.
  - The newest phone to scan becomes the remote; any other is disconnected and says "Another phone took over as the remote." A paired phone keeps a lease for its tab, so a reload or a dropped connection reconnects without scanning again.
  - Disconnect drops the phone even while it is offline, voids its lease and changes the code.
  - iPhone: the air pointer asks for motion with a tap ("Tap to allow motion · then hold to point"). iOS only shows its prompt from a tap; asked on the press that starts a hold, it refused without asking ("Motion access was not allowed").
  - Rooms need the matching server (deck.kadal.cc has it). Against an older room the QR falls back to the presenter ticket.

## 0.3.0

### Minor Changes

- 1af5183: Commands: everything a person can do to a running deck is now a command in one registry —
  `deck.commands` (and `window.__deck.commands`), with stable ids (`nav.next`, `present.blackout`,
  `draw.shape`, `deck.slide` …), descriptions, and zod parameters exported as JSON Schema. The
  keyboard runs through it, so a phone remote or an AI agent can do exactly what the keys and
  buttons do. New commands aim the laser (`present.laserAt`), drive the pen from a touchpad
  (`draw.pen`), mark a region (`draw.shape`: circle, box, underline, arrow), zoom to a point, and
  read the deck (`deck.state`, `deck.outline`, `deck.slide`, `deck.search`). The manifest now
  carries each slide's speaker notes as plain text (`notesText`). `useCommand` registers your own.
- e960d13: Narration: rehearse with the deck reading its own notes. Each `[click]` part of a slide's
  `<Notes>` is spoken at its step, then the deck turns the page with `nav.next` — through the
  command registry, so the presenter window, a projector and the room follow. A bar at the bottom
  of the presenter view (and on the deck behind `?narrate`, or the new `R` key) has prev / play /
  next / stop, speed, mute and volume, voice and engine menus, "follow the narrator", and a
  timeline with a mark per slide to seek. Every control is a `narrate.*` command.

  Three voices behind one interface, picked per segment: baked clips from the new
  `kadal-deck narrate` (Kokoro-82M on the CPU, MP3/Opus via ffmpeg or WAV, indexed by SHA-256 in
  `public/narration.json`), Kokoro-82M in the browser in a Web Worker (WebGPU fp32 or WebAssembly
  q8, downloaded on the first play and cached), and the browser's `speechSynthesis`. Kokoro needs
  `kokoro-js`, a new optional peer dependency (`kadal-deck narrate --setup` installs it); without it
  nothing of it is built. Config: `narration: { enabled, engine, voice, rate, gap, silent, model,
  dtype }`; slide frontmatter `say:` and `narration: false`. Licences of the pieces it reaches for,
  including eSpeak NG (GPL-3.0-or-later) inside the phonemizer, are in `THIRD_PARTY_NOTICES.md`.

- 2473f77: Phone remote: the presenter view's new **Phone remote** button shows a QR, and the phone that
  scans it becomes a one-handed remote at `/<slug>/remote` (`RemotePage` from
  `@kadal/deck/remote`; add `remote: RemotePage` to `<Deck pages>`). It shows a live copy of the
  current slide, rendered by the deck's own components. Touch the slide to aim the laser or the
  spotlight, draw on it with the pen, or tap to zoom. Hold the air-pointer button and move the
  phone to point (DeviceOrientation with iOS's permission prompt, or a Gyroscope where there is one,
  smoothed by a One Euro filter). It also has next and back (or a swipe), blackout, focus labels, a
  slide list, the notes for the current click step, the timer with pacing, buzzes at chosen
  minutes, haptic ticks and a screen wake lock. Everything it does runs as a command in the
  presenting window.

  With a room, the phone is a presenter socket holding the ticket from the QR's fragment. The
  protocol gains `command`, `command:result`, `remote:state`, `remote:kick` and `remote:bye`, plus
  validators. Without a room, `kadal-deck dev` relays it over the dev server's HMR socket with a
  pairing code. `kadal-deck dev --https` serves a self-signed certificate so phones get motion
  sensors. In the presenter view without a room, the laser now shows on the current slide, and the
  remote's laser, ink and zoom reach the play window.

- 71ad8e8: The presenter gate follows the host: when it says the deck has no passcode (`passcode: false`) the
  gate stops asking for one, and when it gives a `signIn` URL it offers "Sign in as the author" —
  on its own, or below the passcode field. Only http(s) links are followed.
- 2d862df: Decks without a build. `@kadal/deck/runtime` compiles a deck from its text in the browser —
  the same remark/rehype passes, Shiki highlighting, notes, magic move and glossary as the Vite
  plugin (both now share `compiler/pipeline.ts`) — and returns diagnostics with lines instead of
  throwing. The new `@kadal/deck-shell` package is one prebuilt static page that runs any
  `deck.mdx` served beside it, under any path; with `?preview` it is an editor's live iframe,
  speaking a small `postMessage` protocol (source in; diagnostics, outline, position, command
  results and picked points out). `<Deck base>` sets the URL root explicitly. Slides compiled
  this way use the engine's components and cannot `import`.

### Patch Changes

- ac41497: A deck compiled again in the same page (an editor's live preview) now shows the new slides: the
  slide-module cache is keyed by each manifest entry's loader instead of the slide's index.

## 0.2.2

### Patch Changes

- 524ff4b: `kadal-deck export` makes a PDF that looks like the deck in every viewer. The browser's printer turned CSS effects into PDF features that viewers draw differently: Glass cards came out filled with their edge gradient, Preview and Quick Look painted grey slabs wherever a blurred shadow fell, and gradient text picked up hairlines. Now each page is a picture of the slide with its text hidden, with the text printed over it as text, so it stays sharp at any zoom and can still be selected and searched. The PDF is also about a third of the size. `--vector-pdf` prints with the browser alone, as before.
- 2d5f6da: Posters of maps show the map. `kadal-deck export` photographed embedded pages on software WebGL (SwiftShader), where a map is so slow that in ten seconds it had fetched almost none of its tiles, so the poster was the markers floating over an empty grid. Posters are now taken on the machine's GPU when it has one (SwiftShader remains the fallback, as on CI), only after the page's requests have gone quiet, and at 2× so they stay sharp in the PDF.

## 0.2.1

### Patch Changes

- 96d9a55: `<Youtube>` and `<Tweet>` get posters. `kadal-deck export --posters` now captures them, which it skipped before, so the print, the overview and the next-slide box showed an empty card. A video's poster is its player, opened with a referrer so YouTube draws the video instead of "Error 153". A post gets one per colour scheme, captured at the card's own width and painted to its edges. Both components also take a `poster` prop of their own.

## 0.2.0

### Minor Changes

- 64ac55f: First-class support for AI agents.

  - `kadal-deck mcp`: a Model Context Protocol server (stdio) with tools to look up the reference, scaffold a deck, outline it, edit single slides (only their lines change; each edit is linted), check, render slides to PNG for the agent to look at, preview, build, export and publish — plus the catalog, reference and guides as resources and `draft_deck` / `review_deck` prompts.
  - New commands: `kadal-deck check` (lint frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary and code fences, with file:line), `kadal-deck info` (the reference), `kadal-deck screenshot` (PNG per slide) and `kadal-deck new <dir>` (scaffold without questions).
  - Every command but dev/build/mcp takes `--json`; flags accept `--flag=value`; documented exit codes (0 ok, 1 failed, 2 usage, 3 not signed in, 4 missing prerequisite); `--dir`/`-C` runs in another folder.
  - `@kadal/deck/catalog` (everything a deck can use, as data, kept in sync with the engine by tests), `@kadal/deck/authoring` (outline, lint and edit a deck as text) and `@kadal/deck/schema/frontmatter.json` (JSON Schema).
  - The Agent Skill (`skills/kadal-deck`, also shipped in the package) and a Claude Code plugin marketplace in the repository; new decks get an `AGENTS.md`.
  - `splitDeck` reports each slide's exact line range and can collect YAML/include problems instead of throwing (`onError`).

- 6932451: Run safely in an opaque origin. A host may serve a deck with `Content-Security-Policy: sandbox`
  (no `allow-same-origin`) so the deck can't act as the visitor on the host's own origin; the
  engine now works there:

  - Storage (`localStorage`, `sessionStorage`) degrades to memory for the page instead of failing,
    and the anonymous viewer id stays the same for the page's beacons and reconnects.
  - The deck's windows (play, presenter view, share window) stay in step over a window bus:
    BroadcastChannel where it reaches, plus `postMessage` between a window and the windows it
    opened. A presenter view ignores navigation from the page that opened it.
  - Presenters prove themselves with a ticket the host issues, kept in memory: from the URL
    fragment (`#ticket=…`, wiped on arrival), from `window.__KADAL_DECK__.ticket`, or from the
    passcode form's answer. It rides on the room WebSocket (`?ticket=`) and on presenter calls
    (`x-deck-ticket`); the passcode form no longer reloads the page.
  - Host calls no longer send `credentials: "include"`; beacons go as `text/plain`.
  - A host can name a viewer-verification page (`window.__KADAL_DECK__.verify`) for Turnstile,
    which can't run inside an opaque origin.

### Patch Changes

- 0e16dbd: Fixes found while rebuilding the showcase: custom-element and React islands work in production
  builds; `layout: name` resolves a deck's own layouts; `transition: zoom-in fade-out` animates both
  halves; a slide's `autoSlide` works without a deck-wide one (and `A` works anywhere); print and
  export give one page per click step; `<Notes>` and magic-move examples inside code stay code;
  `<Clicks every>` groups within each list; `colorScheme` slides paint their scheme's background;
  autoFit ignores `<Background>`, `<Absolute>` and `<Arrow>`; the starfield no longer freezes;
  magic move uses the code font and honours `{lines: true}`; Typewriter and Encrypted print
  finished; renamed lucide icons resolve; icons stay inline under Tailwind; offline polls say
  "offline".

## 0.1.1

### Patch Changes

- a433d50: Ship the map-room and sign backgrounds. 0.1.0's build dropped `src/backgrounds/gis.tsx` and `sign.tsx`, which register themselves on import, because `sideEffects` named only `dist/` paths. So `background: globe` (and raster, choropleth, lattice, thiessen, voronoi, cells, compass, neatline, scan, track, plane, floor, signer, variants, handshapes, trails, window and embedding) showed "Unknown background" instead.
