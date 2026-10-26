# @kadal/deck

## 0.7.1

### Patch Changes

- ddbbe62: `date:` (YYYY-MM-DD) is a known headmatter key, so `kadal-deck check` no longer warns about it. The
  deck doesn't show it; listings such as a showcase sort by it.
- fd65dde: The phone remote no longer shows a poll as "offline · 0 answers" while the room is answering it. A
  still copy of a slide with no room behind it (the remote's mirror, the overview, print and
  thumbnails) shows the poll's question and options without a status or counts; the slide itself,
  the presenter's preview and the audience page are unchanged.
- 223cc30: `kadal-deck thumbnail --all` (and the picture `publish` takes) no longer waits forever when the host
  never answers a premium picture: that request now gives up after a minute, and the local server
  stops waiting on what's still in flight after 5 seconds.
- @kadal/prettier-plugin@0.7.1

## 0.7.0

### Minor Changes

- 4137757: The audience page (`/join`) is redesigned to match Kadal Deck's own look, phone first. Its controls
  now use the product's palette, type, radii and focus rings in light and dark (the slide inside
  keeps the deck's theme), with the tabs in a bottom bar under the thumb, 44px targets and safe-area
  insets; on a tablet the panel sits beside the slide.

  - A header that says who and where: the deck, a live / waiting / reconnecting / offline / ended
    status, how many are here, and a banner when the room needs explaining.
  - Reactions pop where you tap and shake (instead of silently dropping) past the room's limit.
  - Polls show results once you have voted or the poll closes, mark your choice and say how to
    change it; closed polls keep their final results under "Earlier". Rating polls show an average,
    word clouds how many words you have left.
  - Quizzes have lettered answers, a countdown bar, "locked in", and a clear correct / not this time
    with the right answer and the top of the leaderboard. Your answer now survives the reveal.
  - Ask shows which questions are yours, which are answered and on which slide; Mine lists your
    bookmarks and your questions.
  - A one-time welcome asks for an optional name for the leaderboard; toasts confirm what you did
    and tell you when a poll opens while you are on another tab.
  - Full screen has a slide counter, arrows in landscape and a hint to turn the phone.

  Nothing changes on the wire: the page sends exactly the messages it did.

- fd6b6ea: The presenter view's rail and rehearsal bar. The rehearsal timeline at the bottom can be hidden — the × on the bar, "Show rehearsal timeline" in the new rehearsal menu (an arrow beside Start session, or a Rehearsal button without a live room, built as Camera's), Shift R, or the `narrate.timeline` command — and each deck remembers the choice in the browser. Hiding never stops narration: while it plays a small pill keeps pause and the way back. The menu also holds speed, voice, engine and follow, so the bar drops voice and engine in the presenter view. Rail tabs now show their names under the icons, and `deck.panels.register` takes `accent: "ai"` to dress a host panel's tab with the AI accent (iris-to-teal gradient sparkle, gradient hairline, AI ink label; a panel with the id "copilot" gets it by default, `accent: "none"` opts out). Hosts that set `window.__KADAL_DECK__.feedback` (a URL) get Report a bug, Request a feature and Send feedback in the rail: a small dialog that POSTs `{kind, title, description, severity?, screenshotDataUrl?, url, deck, slide, engine, userAgent}` with the presenter ticket and shows the host's `{id}`. The Vite plugin now defines `__KADAL_DECK_VERSION__` in every build so the engine knows its version.

### Patch Changes

- 31368f5: A deck's picture on the host now looks like its first slide as people see it. `kadal-deck publish`
  used to photograph slide 1 in light only and without the host's Pro library, so a deck with a
  `pro/` background showed the free fallback, and a dark visitor's slide looked nothing like it.
  The picture is now taken with the Pro library fetched through the host for the deck's workspace
  (a Free deck still gets the fallback, as it does live), in the deck's own `colorScheme` — and, for a
  deck that follows the viewer, in both light and dark (sent as `&scheme=dark`, then `&scheme=light`;
  a host that predates schemes keeps the light one). It
  waits for `pro/` items and the network to settle, and lays out slide 1 alone.

  New: `kadal-deck thumbnail [--slug s | --all] [--out dir]` takes the picture again for the version
  that is live, reading the build from the host, without publishing. `export.thumbnail` takes a
  `scheme` (an `auto` deck pictured in it without flipping the screen) and answers with `scheme` and
  `auto`; the print view (export, screenshots) waits for `pro/` items before it says it is ready.

- @kadal/prettier-plugin@0.7.0

## 0.6.5

### Patch Changes

- b35fa9f: README and listing copy: the whole-talk story. Every package page now opens with "Build it. Rehearse it. Own the room." and what the package does for the talk (a theme is how it looks on the day, a renderer puts a live demo on a slide), with links to the tour and the docs. The engine's description and keywords cover rehearsal (narration, the teleprompter), the phone remote and the live room; the VS Code extension's Marketplace and Open VSX description says you build the talk there, then rehearse and present it from the same deck. No code changes.
- @kadal/prettier-plugin@0.6.5

## 0.6.4

### Patch Changes

- 17ded02: Drawn backgrounds look the same at every size. The background stack covers the stage's box in screen pixels, and component backgrounds drew in those pixels — aurora's swell and blur, waves' strokes, the mesh's and glows' `vmax` blobs — so a small preview (the builder's, a thumbnail, the presenter's) showed bands twice as tall and twice as soft as the full window. Component and `pro/` backgrounds now lay out at the deck's own size and are scaled to cover their box, as the stage is; canvas blurs follow the bitmap's scale (`ctx.filter` and `shadowBlur` are in bitmap pixels); the mesh and glows size their blobs off their own box (`cqmax`). Colours, gradients, images and video are unchanged.
- 17ded02: The builder's preview no longer replays the slide's entrance on every recompile. Each compile mounts a new runtime, which landed on the hash's slide and then moved to the editor's `at` — a move, so the slide slid in again on every keystroke and every tweak. A recompile now opens on the slide being edited as a cut (`<Deck startAt>`), and the slide (and background) a deck mounts on cuts in, at #/5 too. Moving to another slide keeps its transition.
- @kadal/prettier-plugin@0.6.4

## 0.6.3

### Patch Changes

- 531428e: A host can ask where placed elements start. The new `layout.frame` command (advertised as `"frame"` in the preview's `ready.features`) answers `{ slide, x, y, unit, width, height }` for the slide shown: where `x`/`y` of `<Sticker>`, `<Arrow>` and `<Drag>` start, in stage pixels. Those are positioned inside the slide's layout box (the theme's padding, a layout's own, a slide's `zoom`), not on the stage, so an editor that places something where a person dropped it converts a stage point P to `(P − x) / unit`. It is measured in the page, so it is right for any theme, including a deck's own. Nothing about how decks render changes.
- @kadal/prettier-plugin@0.6.3

## 0.6.2

### Patch Changes

- 8a2019c: An editor's preview can hide the deck's own chrome. The preview bridge gains `{type:"chrome", on}` (advertised as `"chrome"` in `ready.features`; on by default, so editors that never send it see no change): off hides the arrows pill with the slide number, the corner tools, the progress bar, the notes footer, the theme button and the unknown-theme notice, for an editor whose stage has its own controls, and stays off across recompiles. The free plan's watermark and ads, the premium notice, and what a key or the slide opens (help, jump-to, search, pause, toasts, confetti) stay. `<Deck chrome={false}>` does the same for any host. Published decks are unchanged.
- @kadal/prettier-plugin@0.6.2

## 0.6.1

### Patch Changes

- 15ba20e: Editing in place in an editor's preview. The preview bridge (`@kadal/deck/runtime`) gains `{type:"edit", on}`: while it is on, the shell outlines the element under the pointer, reports a click as `located` (file, line, column and offset in the source the editor sent), and lets a double-click retype a heading, paragraph, list item or table cell whose text is one plain run of the source. Enter or leaving the element posts `edited` (file, `from`–`to` UTF-16 offsets, `before`, `after`); Esc puts it back. The shell never changes the deck: the editor applies the edit and sends the source again. Offsets are into each file exactly as sent — headmatter, frontmatter, CRLF line ends and included `pages/*.mdx` files included — and an element whose text cannot be mapped exactly says "Edit in source" instead. `ready` now carries `features: ["edit"]`, so an editor offers this only to shells that have it. Only `?preview` compiles tag elements with their positions (`compileDeck({ editable: true })`); published decks are unchanged.
- @kadal/prettier-plugin@0.6.1

## 0.6.0

### Minor Changes

- f5aae0a: Eight backgrounds are removed: the six sign-language ones (`signer`, `variants`, `handshapes`, `trails`, `window`, `embedding`) and the map backgrounds `lattice` and `track`. Each was drawn for one talk and is too particular for the engine. The other 28 built-in backgrounds are unchanged.

  If your deck uses one, copy it into your deck: take its source from https://deck.kadal.cc/docs/backgrounds/#removed-in-06, put it in `src/components.tsx` (or a file beside it) and register it under the same name with `registerBackground("signer", Signer)` from `@kadal/deck`. The slide then looks exactly as before. Until you do, a published deck shows the theme's own background on that slide, and `kadal-deck dev`, a builder preview and `kadal-deck check` say the name was removed in 0.6 and link to the source.

  An unknown background name no longer shows its red "Unknown background" notice in a published deck: the slide keeps the theme's background, as it does for a `pro/` item it cannot load. The notice still shows to the author on the dev server and in a builder preview.

  The READMEs, the reference and the agent skill now lead with the Pro library — 95 backgrounds and layouts in 15 genres (`background: pro/<slug>`, `layout: pro/<slug>`), rendered on decks published to deck.kadal.cc from a Pro or Team workspace and falling back to the theme's background and the default layout anywhere else — and show a few of the free built-in backgrounds.

### Patch Changes

- f5aae0a: The "Pro … available on Kadal Deck Pro" chip an author sees on a slide whose `pro/` item did not load now sits at the bottom centre of the slide, clear of the slide number, the navigation pill, the theme menu and the back-to-start button in the play view, the presenter view and a builder preview.
- f5aae0a: `starfield` and `sweep` read on a light page. On a light slide the starfield draws ink-coloured stars whose trails fade into the page, instead of painting the slide black under a dark title; the sweep's default palette becomes pale blues and teal. Dark slides look as before, and colours you set yourself are used as given in both schemes. Every component background now also receives the slide's `scheme` ("light" or "dark").
- @kadal/prettier-plugin@0.6.0

## 0.5.3

### Patch Changes

- a1603e7: A title too long for its slide no longer runs off the top. Centred and bottom-aligned layouts (cover, intro, section, end, fact, quote, statement, and swiss's and folio's bottom-aligned covers) now let overflowing content grow downwards, where the automatic fit sees it and scales the slide down; before, the part above the top edge was cut off and never measured. Swiss's and folio's covers also keep their title below the accent square and the masthead rule.
- @kadal/prettier-plugin@0.5.3

## 0.5.2

### Patch Changes

- 0dd7ae0: A slide with a background of its own now shows it on every layout. Themes that decorate a layout — brand's coloured cover, neon's sun and grid, crayon's shapes, bricks' and shibainu's blocks, swiss's section ground, ocean's waves, the black end slide — step aside on a slide that sets `background:`, instead of painting over it (a background on a brand cover rendered as nothing) or stacking a second set of art on it. A library background drawn for one scheme, like a chalkboard, also gives its slide that scheme unless the slide chooses its own, so a light deck's dark text never lands on a dark board.
- @kadal/prettier-plugin@0.5.2

## 0.5.1

### Patch Changes

- d100cb4: Quick edit and sync fixes from end-to-end testing:

  - A deck's editing kit now carries the files its `<<<` snippet imports read (`<<< @/snippets/tide.ts#model`), so the web builder shows them and a deck published from the builder no longer loses them. A snippet the last CLI build did not read says so plainly, as an unknown import does.
  - `mergeMdx` pairs a slide with the base slide in the same place when its neighbours line up, so a short slide edited on both sides (`# Hi` to `# Hello` and to `# Hey`) is a conflict instead of two slides. A slide added on both sides at the same place still keeps both.
  - `kadal-deck pull` (and the MCP `deck_pull`) downloads the library media a quick edit added (`assets/media/<hash>.<ext>`, a sticker or an image picked in the builder) into the project's `public/assets/media/`, checked against its hash, so `kadal-deck dev` shows it and the next publish carries it. What the host does not have is a note, never a failed pull.
  - The runtime compiler (the prebuilt shell, and every deck's editing kit) names the Shiki grammars it loads one by one instead of importing Shiki's whole bundle, which put all ~230 grammars in every kit although only the defaults were ever loaded. A deck's kit adds the languages its `deck({ shiki: { langs } })` lists, so the builder now highlights what the build did (the tour's `mdx` blocks). The tour's kit goes from 38.5 MB in 761 files to 32.4 MB in 549, the starter's from 22.6 MB in 631 files to 16.5 MB in 420.
  - `kadal-deck status` no longer reports a file whose only difference from the synced version is its line endings (a CRLF checkout of a pulled file), and `pull --dry-run` prints whole words ("would add", "would delete", "would download") with the paths spaced out, and says nothing was written.
  - When `publish` is refused because the deck moved (exit 4, and the MCP `deck_publish` diverged result), the message now says what moved it: "changed on the web" for a quick edit or an agent, "was published from another copy" for a teammate's or another machine's CLI publish, "was rolled back" for a rollback, and "This folder has never synced with the published deck" when there is no `.kadal-deck/sync.json`. The advice is the same each time: `pull` to merge, or `--force` to replace (the replaced version stays in the history).

  A `pro/` layout that loads after the slide first renders is now fitted like any other: a slide whose library layout was taller than the canvas used to overflow instead of scaling down.

- @kadal/prettier-plugin@0.5.1

## 0.5.0

### Minor Changes

- 453585a: Stickers, emoji, GIFs and memes. `<Sticker src x y size rotate flip shadow />` places an image (animated GIF/WebP/APNG too) over the slide and is draggable in `kadal-deck dev` like `<Drag>` (the first move writes `pos`). `<Emoji name|char set size />` draws one emoji from an open set — Fluent 3D/Color/Flat, Noto, Noto Animated, Twemoji — served from `https://decks.kadal.cc/emoji` or the host's `window.__KADAL_DECK__.emoji`; Noto Animated is a still under reduced motion and in print. `<Gif provider="klipy" src title />` hot-links a provider's GIF with a credit on hover, and every export (PDF, PNG, PPTX) draws a card with the title and the link instead of the media. `<Meme src template captions />` sets image-macro captions in Anton (loaded through the font system, waited for by print) with the "Template via imgflip.com" link back. `<Drag place>` gives an element a starting box while `pos` is unset. New CLI commands: `kadal-deck media list` and `kadal-deck media add <id|name> [--to public/stickers/]` download from the workspace's media library. Crayon's `<Sticker>` with a `src` is the engine's image sticker; without one it is the pastel cut-out as before.
- 453585a: Remote packs: `pro/` backgrounds and layouts from the host's library. A `pro/<name>` in
  `background:`, `layout:` or `<Background name>` resolves through `window.__KADAL_DECK__.premium`
  (a new `HostOverride` field, http(s) only): the engine fetches the host's `catalog.json` once,
  only when a slide uses such a name, and `import()`s the item's module, which borrows the engine's
  React through the new `window.__KADAL_DECK_RUNTIME__` global (`{ contract, version, React, jsx,
  components, hooks }`). Without a host — or when the host refuses — the slide keeps the theme's
  own background and the default layout, silently in a published deck; under `kadal-deck dev` and
  in a builder preview a dismissible "Pro background — available on Kadal Deck Pro" chip says
  why. An item's static `poster` is used in print, export, thumbnails and with reduced motion.
- 453585a: Edit a CLI deck on the web, and bring the edits back.

  - `kadal-deck publish` now uploads the deck's editable source (deck.mdx, pages, slides, YAML,
    data, drawings), kept private to your workspace, and an editing kit (`__kadal/kit/`: your
    components, styles, config, themes and every module your MDX imports) so the web builder can
    quick-edit the deck as you built it. `--no-source` keeps the source on your machine.
  - It publishes only if the deck has not changed on the web since your last sync; otherwise it
    stops (exit 4) and says who changed what. `--force` replaces those edits (they stay in the
    version history). `--showcase` / `--no-showcase` list the deck in the public showcase or not.
  - New: `kadal-deck pull` merges the web's edits into your files slide by slide (backing up what
    it changes), `kadal-deck status` shows where you stand, and `kadal-deck resolve` settles
    conflicts — kept as git-style markers, exit 5, never silently dropped.
  - New `@kadal/deck/sync`: the slide-aware three-way merge (`mergeDeckSource`, `mergeMdx`,
    `resolveConflict`, `sourceHash`…) that the CLI, the MCP server and the web builder share.
  - Conflict markers are caught by `kadal-deck check`, refused by a build, and shown under
    `kadal-deck dev` and in the builder as a "Yours / Web" card with Keep buttons.
  - MCP: `deck_sync_status`, `deck_pull`, `deck_conflicts`, `deck_resolve`; `deck_publish` answers
    "diverged" with next steps instead of failing; edit tools won't half-edit a conflicted slide.
  - The presenter view shows an Edit button (and `present.edit`) when the host offers quick edit.

### Patch Changes

- @kadal/prettier-plugin@0.5.0

## 0.4.10

### Patch Changes

- 3e06c60: A teleprompter for the presenter view. The new **Teleprompter** button (or Shift T, or the `present.teleprompter` command) opens your speaker notes alone, big, in a window of their own that follows your slide and click step. In Chrome and Edge the button lists your screens by name and size, opens the teleprompter filling the one you pick, and remembers it for next time; in other browsers you get a window to drag where you want it. The current part of the notes sits on a reading line a third of the way down, earlier parts are dimmed, and the next slide's first lines wait underneath. You can change the text size and line width, mirror it for a prompter's glass, show a reading guide, let it scroll by itself (Space to start and stop, the arrow keys for speed), switch light or dark, and go fullscreen. A strip along the top shows the slide, your timer with its pacing, and, with a live room, raised hands, the pace votes, viewers and open questions. It does not count as a viewer, and its keys never move the deck. The presenter view keeps its own notes.

  The presenter view's timer is now two compact rows: the time with its paused or over tag, then play/pause, reset, settings, the pacing badge and the clock. Long deck titles stop at two lines, with the whole title on hover.

- @kadal/prettier-plugin@0.4.10

## 0.4.9

### Patch Changes

- 258c229: The export page (`/export`) is redrawn. Each format is a card with an icon and the file it makes. Colours, speaker notes and picture size are segmented choices; there are no dropdowns. The button stays pinned under the options with the page count and size beside it. A bar over the preview says how many pages will come out. It still wears the deck's own theme in light and dark, and a phone keeps one column with the button pinned to the bottom.
- @kadal/prettier-plugin@0.4.9

## 0.4.8

### Patch Changes

- a3db811: Every deck's theme menu (T) now offers all sixteen first-party themes, whatever the deck declares.

  - **Nothing to install.** @kadal/deck ships a copy of each of the thirteen theme packages
    (`dist/themes/<name>`), so a deck with only the engine installed can pick any of them, or name
    one (`theme: ocean`). An installed `@kadal/theme-<name>` still wins over the copy.
  - **`themes:` orders the menu; it does not narrow it.** The deck's `theme` comes first, then its
    `themes` in order, then every first-party theme it did not name.
  - **No heavier first paint.** A theme the deck did not name loads its stylesheet and layouts only
    when someone picks it (or points at its row). Its code keeps the deck's colours; name it in
    `themes:` to give its code its own Shiki colours.
  - **Swatches before the CSS.** Theme packages gain `kadal.theme.swatch`, two colours the menu
    paints before the theme's stylesheet has loaded.
  - The prebuilt shell (the builder) offers all sixteen too.

- cc70774: On the export page (`/export`, also reached from the right-click menu), the options panel stays fixed and only the pages scroll. The panel was meant to stick but scrolled away with the pages. On a phone the page still scrolls as one column, and printing still prints every page.
- dd72e9b: Every deck now has a **back to the start** button. In the play view it sits above the theme button at the bottom-left, from the second slide on, beside any buttons of the deck's own. In the presenter view it is in the toolbar as Start. Home does the same from the keyboard. The tour's own custom buttons are now just its ↗ Source link.
- @kadal/prettier-plugin@0.4.8

## 0.4.7

### Patch Changes

- 0be7311: The presenter view, two small things:

  - **Time line marker:** the line under the presenter's bar marks this slide's slot in the plan, from when the talk should reach it to when it should leave it. The old tick marked only the slot's start, so it sat exactly on the start on the first slide but a whole slide short of the end on the last. Now it ends at the very end there.
  - **Layouts:** there are two, notes and next on the left (the default) or on the right. The third, a big next slide, squeezed the current slide into a short, pillarboxed strip, so it was removed. A window that had it saved opens with notes on the left.

- @kadal/prettier-plugin@0.4.7

## 0.4.6

### Patch Changes

- 3183122: The timeline's slide preview now draws over everything else. In the presenter view the theme button and its menu, on the current slide just above the bar, covered it; in the play view's narration dock, so did the corner buttons.
- @kadal/prettier-plugin@0.4.6

## 0.4.5

### Patch Changes

- 2416c3a: The narration timeline, fixed in three ways.

  - **The bar reaches the end on the last slide.** The bar now ends where the last slide starts, so that slide's point sits at the far right, and once you are on the last slide the bar is full, whether it is playing, paused or stopped. Before this, the bar stopped at about 88% with grey track after it. Every other point, and where a hover or a click lands, uses the same scale. The time beside the bar ("0:40 / 0:46") is still the real time of the talk. In a one-slide deck the bar fills across that slide's own talk.
  - **Clicking the timeline no longer starts the voice.** A click on the bar, or the arrow, Page, Home and End keys on it, moves the deck to that slide and leaves play alone. Paused or stopped stays that way, and Play starts from there. If it was playing, it plays on from the new slide. A click after the end waits there too, and Play goes on from that slide instead of starting the talk over. Agents can do the same with the new `narrate.seek` command (`{ to }`, a 0-based slide index).
  - **The hover card.** It is now a fixed width: the picture of the slide with the same padding on every side, however long the title is. The slide number ("7.") and the time ("0:36 ·") stay put. A title or chapter name that is too long ends in an ellipsis, then slowly slides along to show the rest, waits, and slides back. With reduced motion it keeps the ellipsis and does not move. The picture is now drawn exactly as the stage draws the slide: the card's own text styles no longer reach into it, so a paragraph that wraps on the slide wraps in the picture too, instead of staying on one cut-off line.

- 2aa06ab: The presenter view and the play view's corners, tidied:

  - **Presenter layout.** The presenter view now opens with the notes and the next slide on the left and the current slide beside them. A switch in the top bar picks between that, notes on the right, and a big next slide; L still steps through them, and each window remembers its choice.
  - **Overview in every deck.** The presenter toolbar has its own Overview button. It used to come only from a deck's own nav-controls layer, so most decks had none.
  - **Theme button.** In the presenter view it sits at the bottom-left of the current slide, as it does in the play view, and over the overview it moves to the window's bottom-left. It no longer floats above the overview from the toolbar.
  - **Arrows.** The 3 × 3 cross of chevrons is now one pill in the bottom-right corner — ‹ 5 / 138 › — the same height, line and look as the theme button opposite. Up and down join it only on slides with a stack, and the number opens jump-to. `controlsLayout: "edges"` is unchanged.
  - **Focus labels (F).** Every control gets a label: the deck's nav-controls buttons, "Follow the presenter", the narration bar, the notes tools, the layout switch and the presenter's timer were missed.
  - **Centring.** The stage is laid out on whole device pixels, so the bars either side of a slide are exactly the same width. They could differ by a pixel before. The same holds in the presenter's panes.
  - **Follow the presenter** sits on the same middle line as the corner buttons.

- @kadal/prettier-plugin@0.4.5

## 0.4.4

### Patch Changes

- 1bab109: The audience page (`/join`) keeps the tab the viewer was on and the question they had not sent yet when the page reloads, as a phone often does when it wakes and reconnects. It used to come back on Pace with the draft gone. Both are kept in session storage for that browser tab only.
- 1bab109: A magic-move block counts its clicks on a cold load. When the block's steps arrived after the slide's first render (opening a deck straight onto a magic-move slide, most often in a tall window), the slide registered 0 clicks: the block showed its last step at once and Next skipped past it. The click registry now lays the slide out again when an element asks for different steps, and the elements after it move along.
- 1bab109: `kadal-deck publish` prints the full address of the published deck. A host that answers with only a path (`/@ana/talk/`) got that path printed on its own; it is now resolved against https://decks.kadal.cc for the default host, or against the host's own origin for a self-hosted one.
- 1bab109: `kadal-deck screenshot` and the MCP server's `slide_render` no longer leave a 1px grey line along an edge of each picture. The print view's 16px gaps and page shadow landed a fraction of a pixel inside the picture at most widths (1280, the default, included); the pages are now butted together at the left edge while the pictures are taken.
- @kadal/prettier-plugin@0.4.4

## 0.4.3

### Patch Changes

- 75231f0: The audience page (`/join`) numbers slides as the deck does. When a viewer was not following the presenter, the bar showed the column (Slide 11 of 115) instead of the slide's place in the deck (29 of 115).
- 75231f0: The catalog (`kadal-deck info`, the MCP server, the VS Code extension) lists `<FlipBoard>`, which is now a built-in component (still exported from `@kadal/deck/backgrounds` as well). Summaries describe what each component and key does without naming other tools; the importer and the migration notes keep the names where they matter.
- 75231f0: `kadal-deck check` knows the deck's own code runners. A `{monaco-run}` block in a language registered in `setup/code-runners.ts` or with `registerCodeRunner(...)` is no longer reported as having no runner; the check and the runner registry now share one list of built-in languages and aliases.
- 75231f0: `kadal-deck check` reads the headmatter as the deck's settings. A key both the deck and a slide take is checked against the deck's meaning at the top of deck.mdx, so `narration: { engine: browser, rate: 1.1 }` (or `zoom: true`) no longer fails as "expected false".
- 75231f0: A Comark block's YAML props (`---` lines straight after `::card`) no longer cut the slide in two. The splitter, and the Prettier plugin's copy of it, skip `---` inside a Comark block that is closed; a block left open still ends at the next separator.
- 75231f0: `kadal-deck import slidev` fixes:

  - With `mdc: true` (or `comark: true`), Comark attribute lists such as `[text]{.red}`, `**bold**{.accent}` and `:badge[New]{tone="good"}` are kept as written instead of escaped into text.
  - `mdc`, `monacoTypesSource`, `monacoTypesAdditionalPackages` and `monacoTypesIgnorePackages` are translated (to `comark`, `monacoTypes`, `monacoPackages`, `monacoTypesIgnore`) and no longer copied as well, so `check` has nothing to flag in the converted headmatter.
  - A `{monaco-run}` block that imports a package is no longer reported: the runner fetches packages from the deck's `monacoRunImports` CDN. Imports of the deck's own files and of Node's modules are still reported, since those do fail.

- 75231f0: The MCP server's instructions name the design guide by the URI it is served at, `kadal-deck://guide/design-guide`.
- 3baec91: Presenter-view fixes from launch testing.

  - **Drawings stay.** A stroke or shape now stays on the slide until it is erased or cleared, in the presenter view, the play window and on every phone. It used to fade a few seconds after it was drawn unless the pin on the toolbar was on, which looked like changing the colour or the tool had wiped the slide. The pin still turns strokes into fading scribbles, and that choice is remembered.
  - **Typing in a text field never drives the deck.** Single-key shortcuts (L, T, D, C, the arrows…) were taken from a field inside a shadow root, such as a host's side panel, because the deck looked only at the event's target. It now looks at where the key was really typed.
  - **The pen's toolbar sits above the narration bar** in the presenter view instead of covering the play and seek controls.
  - **Escape closes the theme menu while the pen is on**, instead of turning the pen off and leaving the menu open.
  - **The overview opens in the presenter view.** Esc, O and an Overview button used to change a state nothing showed (and Space then closed it instead of moving on). It is the presenter's own: the audience keeps the current slide until a tile is picked.
  - **The spotlight works without the laser.** The Spotlight button on its own lit nothing; it now follows the cursor on the presenter's screen and every follower's. Under the spotlight the lit circle is the pointer.
  - **The window that opens the presenter view follows it**, even after it had been moved by hand first. Before, a deck you had clicked through and then pressed S on stayed where it was while you presented.
  - **`/stats` opened in a new tab** shows the presenter's sign-in (the passcode, or the author's sign-in) in the deck's styling, and the stats once it is passed, instead of a line of unstyled text.
  - The current part of the speaker notes is marked with a light wash and an underline rather than a selection-blue block, and notes without `[click]` markers are not marked at all.

- ece124f: Refresh READMEs and package metadata: each package page says what the package is, how to install and use it, and links its docs; theme pages show the theme; the author is now Kadal (hello@kadal.cc), with homepages pointing at each package's own docs page.
- 75231f0: `kadal-deck screenshot --slide` counts from 1, as `export --range` and the deck's own slide counter do, and takes ranges (`--slide 2-4`) and ids. Files are named from 1 too (`slide-001.png` is the first slide) and `--json` reports the same numbers. `--slide 0` is still read as the first slide, with a note. Both commands' help says how they count.
- 75231f0: A relative import inside a slide (`import data from "./data.ts"` in deck.mdx) resolves from the file the slide is written in: deck.mdx, or the file a `src:` include brings in. It used to fail the build with `UNRESOLVED_IMPORT`, because a slide is compiled as a virtual module with no folder of its own.
- ece124f: The starter deck says to press S for the presenter view (P goes back a slide), and its README lists what each file is for and how to ship the deck.
- 75231f0: `npm run typecheck` passes in a new deck. The starter's `vite.config.ts` read `process.env`, which needs `@types/node`, and a fresh scaffold does not have it; it now reads the environment through Vite's `loadEnv(mode, false, "")`.
- 6c20c1b: Transition, navigation and room fixes, found by stepping the tour's transitions frame by frame.

  - **Stepping back a click no longer replays the slide's entrance.** The stage's direction followed every click, the arriving slide's animation is keyed on it, and a changed animation restarts, so a click back made the whole slide slide in again (and so did the first click forward after arriving backward). The slide's direction now changes only when the slide does; the background layer follows the same rule.
  - **Up a stack, a slide no longer flashes all its steps.** The slide above waits pre-rendered at its last step; `up` lands on its first, and the steps used to fade out under the transition. A slide now takes the step it arrived at at once.
  - **`view-transition` leaves nothing behind.** The slide that left stayed visible under the new one for the length of a transition (and played its own fade afterwards); now it's gone at once, as with `none`.
  - **Backgrounds follow the slide.** A slide that cuts in (`transition: none`) or uses `view-transition` changes its background with it instead of cross-fading under it; `backgroundTransition: zoom` zooms (it used to slide sideways); a slide's `transitionSpeed` applies to its background; and a sliding background moves up and down a stack instead of sideways.
  - **`clicksStart` works.** A slide with `clicksStart: 1` opens at step 1, stepping back stops there, and print, export and the scroll view start from it. Before, the slide opened at 0 and its first step showed nothing.
  - **`<Toc mode="onlySiblings">`** lists the current slide's own branch: its ancestors, their siblings and its children. It used to list every entry at its level across the whole deck. Depth limits now apply after the tree is worked out, so `minDepth={2}` with `onlySiblings` lists the slides of the current chapter.
  - **A presenter view forgotten in a background tab stops presenting.** After 15 minutes hidden, with no session running and no phone remote paired, it reconnects to the room as a viewer, so viewers stop being offered to follow it and new viewers no longer land on its slide. It becomes the presenter again the moment it's shown, or when a phone pairs or a session starts.
  - **/stats and /export no longer join the room**, and only the deck itself and /join count as views: a visit to the stats used to count as a view of the deck.
  - **A link to a slide's id with a step (`#/slide-id/3`) lands on that step.** The deck writes such links itself (`fragmentInURL`, ids), but reading one dropped the step.
  - The `blur` click effect is in the catalog and the `ClickEffect` type (it was in the stylesheet only).

- 75231f0: A video background loops by default, as documented (`background: /clip.mp4`). `{ video, loop: false }` or `backgroundVideoLoop: false` plays it once.
- Updated dependencies [75231f0]
- Updated dependencies [ece124f]
  - @kadal/prettier-plugin@0.4.3

## 0.4.2

### Patch Changes

- 78a0bc9: The phone remote now works for a deck built with `kadal-deck build` and served from any static host (GitHub Pages, Netlify, S3, a plain file server): run `kadal-deck relay` (add `--tunnel` for a `wss://` address) and point the deck at it with `remote: { relay: "wss://…" }` or `?relay=` on the presenter view's address. Pairing is the same rotating QR code as `kadal-deck dev`, and the presenter view asks once for the relay's password.
- @kadal/prettier-plugin@0.4.2

## 0.4.1

### Patch Changes

- fa42a5d: Three code-toolkit follow-ups.

  **Magic move highlights.** The inner fences of a `md magic-move block take highlight steps,
  Slidev's way: ` ```ts {*|2|4-5} ```` lights all lines, then line 2, then lines 4–5, a click
  each, before the next morph. Lines outside the step dim, on screen, in print (a page per step) and
  in PPTX. The morph also animates again: without a `{duration}` the animation's timing was
  "undefinedms" and every transition was switched off; it now uses the block's `{duration}`, else
  the deck's `magicMoveDuration` (800 ms). Under `prefers-reduced-motion` the steps change at once.

  **Code follows the theme menu.** Picking another theme from the menu (T) now recolours code in
  that theme's own Shiki pair (`kadal.theme.shiki`): plain blocks, notation marks, TwoSlash, magic
  move and Monaco editors, in light and dark, on screen and in exports. The build highlights each
  token once with every distinct Shiki theme the menu needs, as CSS variables, plus a few rules in
  the deck's stylesheet; a deck whose menu shares one pair (the default menu) builds exactly as
  before. A slide that forces a colour scheme now also gets that scheme's code colours (a light
  slide in a dark deck used to keep the dark ones). The hosted shell's editors wear the deck's
  theme too, not always GitHub's.

  **Monaco types for imported packages.** `{monaco}` and `{monaco-run}` editors get the
  declarations of the npm packages they import, so hovers, completions and errors are the
  package's own: bundled from the deck's node_modules by `kadal-deck build` (offline), else fetched
  from jsDelivr (only declaration files, the ones the imports reach, within size limits, cached in
  the browser). `monacoTypes: auto | local | cdn | none`, `monacoPackages` (names, or versions to
  pin), `monacoTypesIgnore`; Slidev's `monacoTypesSource`, `monacoTypesAdditionalPackages` and
  `monacoTypesIgnorePackages` are read too, and the importer carries them over. Offline with
  nothing cached, editors behave as before. A `{monaco-run}` bare import (`import { z } from
  "zod"`) now loads from esm.sh at the pinned version (`monacoRunImports`: another CDN or template,
  or `false` for the old error).

- 1c4dc5e: Slidev's authoring leftovers, natively:

  - **Comark (formerly MDC) syntax**, opt-in with `comark: true` (or Slidev's `mdc: true`), in both the Vite plugin and the in-browser compiler: `:badge[New]{tone="good"}` inline components, `[text]{.class style="…"}` spans, `{…}` after bold, code, links and images, and `::name{props}` … `::` blocks with YAML props, `#slot` sections that arrive as props, and nesting by colons. `::right::` slot markers, `::code-group` and MDX `{expressions}` keep their meaning; `kadal-deck check` checks Comark components like JSX ones, and `kadal-deck import slidev` now carries `comark: true` over instead of reporting it.
  - **`custom-nav-controls` layer**: `custom-nav-controls.tsx` beside deck.mdx (or a theme's or addon's `layers`) adds buttons beside the controls in play and to the presenter's toolbar. Slidev's `custom-nav-controls.vue` imports to it.
  - **`<ClickCount>` and `useClicks()`**: the slide's click count (Slidev's `$clicks`), with `when={(c) => c > 2}` for click-dependent content. The importer maps `{{ $clicks }}`, `$clicksContext.current/total` and `v-if="$clicks > n"` chains to it.
  - **Dragged positions sync live**: a `<Drag>` or `<DragArrow>` moved under `kadal-deck dev` follows in every other open window (presenter, second screen, projector) as it moves, with no reload.
  - **Pages of the deck's own**: `routes.tsx` beside deck.mdx (or `setup/routes.ts`), `<Deck routes>`, a package's `routes` or `api.addRoute()` add pages at `<base><path>` inside the deck's providers, with `:params`; the build copies index.html to each plain path for static hosts.

- @kadal/prettier-plugin@0.4.1

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
