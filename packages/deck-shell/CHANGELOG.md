# @kadal/deck-shell

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.3

No changes in this release.

## 0.8.2

No changes in this release.

## 0.8.1

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- fd6b6ea: The presenter view's rail and rehearsal bar. The rehearsal timeline at the bottom can be hidden — the × on the bar, "Show rehearsal timeline" in the new rehearsal menu (an arrow beside Start session, or a Rehearsal button without a live room, built as Camera's), Shift R, or the `narrate.timeline` command — and each deck remembers the choice in the browser. Hiding never stops narration: while it plays a small pill keeps pause and the way back. The menu also holds speed, voice, engine and follow, so the bar drops voice and engine in the presenter view. Rail tabs now show their names under the icons, and `deck.panels.register` takes `accent: "ai"` to dress a host panel's tab with the AI accent (iris-to-teal gradient sparkle, gradient hairline, AI ink label; a panel with the id "copilot" gets it by default, `accent: "none"` opts out). Hosts that set `window.__KADAL_DECK__.feedback` (a URL) get Report a bug, Request a feature and Send feedback in the rail: a small dialog that POSTs `{kind, title, description, severity?, screenshotDataUrl?, url, deck, slide, engine, userAgent}` with the presenter ticket and shows the host's `{id}`. The Vite plugin now defines `__KADAL_DECK_VERSION__` in every build so the engine knows its version.

## 0.6.5

No changes in this release.

## 0.6.4

### Patch Changes

- 17ded02: Drawn backgrounds look the same at every size. The background stack covers the stage's box in screen pixels, and component backgrounds drew in those pixels — aurora's swell and blur, waves' strokes, the mesh's and glows' `vmax` blobs — so a small preview (the builder's, a thumbnail, the presenter's) showed bands twice as tall and twice as soft as the full window. Component and `pro/` backgrounds now lay out at the deck's own size and are scaled to cover their box, as the stage is; canvas blurs follow the bitmap's scale (`ctx.filter` and `shadowBlur` are in bitmap pixels); the mesh and glows size their blobs off their own box (`cqmax`). Colours, gradients, images and video are unchanged.
- 17ded02: The builder's preview no longer replays the slide's entrance on every recompile. Each compile mounts a new runtime, which landed on the hash's slide and then moved to the editor's `at` — a move, so the slide slid in again on every keystroke and every tweak. A recompile now opens on the slide being edited as a cut (`<Deck startAt>`), and the slide (and background) a deck mounts on cuts in, at #/5 too. Moving to another slide keeps its transition.

## 0.6.3

### Patch Changes

- 531428e: A host can ask where placed elements start. The new `layout.frame` command (advertised as `"frame"` in the preview's `ready.features`) answers `{ slide, x, y, unit, width, height }` for the slide shown: where `x`/`y` of `<Sticker>`, `<Arrow>` and `<Drag>` start, in stage pixels. Those are positioned inside the slide's layout box (the theme's padding, a layout's own, a slide's `zoom`), not on the stage, so an editor that places something where a person dropped it converts a stage point P to `(P − x) / unit`. It is measured in the page, so it is right for any theme, including a deck's own. Nothing about how decks render changes.

## 0.6.2

### Patch Changes

- 8a2019c: An editor's preview can hide the deck's own chrome. The preview bridge gains `{type:"chrome", on}` (advertised as `"chrome"` in `ready.features`; on by default, so editors that never send it see no change): off hides the arrows pill with the slide number, the corner tools, the progress bar, the notes footer, the theme button and the unknown-theme notice, for an editor whose stage has its own controls, and stays off across recompiles. The free plan's watermark and ads, the premium notice, and what a key or the slide opens (help, jump-to, search, pause, toasts, confetti) stay. `<Deck chrome={false}>` does the same for any host. Published decks are unchanged.

## 0.6.1

### Patch Changes

- 15ba20e: Editing in place in an editor's preview. The preview bridge (`@kadal/deck/runtime`) gains `{type:"edit", on}`: while it is on, the shell outlines the element under the pointer, reports a click as `located` (file, line, column and offset in the source the editor sent), and lets a double-click retype a heading, paragraph, list item or table cell whose text is one plain run of the source. Enter or leaving the element posts `edited` (file, `from`–`to` UTF-16 offsets, `before`, `after`); Esc puts it back. The shell never changes the deck: the editor applies the edit and sends the source again. Offsets are into each file exactly as sent — headmatter, frontmatter, CRLF line ends and included `pages/*.mdx` files included — and an element whose text cannot be mapped exactly says "Edit in source" instead. `ready` now carries `features: ["edit"]`, so an editor offers this only to shells that have it. Only `?preview` compiles tag elements with their positions (`compileDeck({ editable: true })`); published decks are unchanged.

## 0.6.0

### Minor Changes

- f5aae0a: Eight backgrounds are removed: the six sign-language ones (`signer`, `variants`, `handshapes`, `trails`, `window`, `embedding`) and the map backgrounds `lattice` and `track`. Each was drawn for one talk and is too particular for the engine. The other 28 built-in backgrounds are unchanged.

  If your deck uses one, copy it into your deck: take its source from https://deck.kadal.cc/docs/backgrounds/#removed-in-06, put it in `src/components.tsx` (or a file beside it) and register it under the same name with `registerBackground("signer", Signer)` from `@kadal/deck`. The slide then looks exactly as before. Until you do, a published deck shows the theme's own background on that slide, and `kadal-deck dev`, a builder preview and `kadal-deck check` say the name was removed in 0.6 and link to the source.

  An unknown background name no longer shows its red "Unknown background" notice in a published deck: the slide keeps the theme's background, as it does for a `pro/` item it cannot load. The notice still shows to the author on the dev server and in a builder preview.

  The READMEs, the reference and the agent skill now lead with the Pro library — 95 backgrounds and layouts in 15 genres (`background: pro/<slug>`, `layout: pro/<slug>`), rendered on decks published to deck.kadal.cc from a Pro or Team workspace and falling back to the theme's background and the default layout anywhere else — and show a few of the free built-in backgrounds.

## 0.5.3

No changes in this release.

## 0.5.2

No changes in this release.

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

## 0.5.0

### Minor Changes

- 453585a: Remote packs: `pro/` backgrounds and layouts from the host's library. A `pro/<name>` in
  `background:`, `layout:` or `<Background name>` resolves through `window.__KADAL_DECK__.premium`
  (a new `HostOverride` field, http(s) only): the engine fetches the host's `catalog.json` once,
  only when a slide uses such a name, and `import()`s the item's module, which borrows the engine's
  React through the new `window.__KADAL_DECK_RUNTIME__` global (`{ contract, version, React, jsx,
  components, hooks }`). Without a host — or when the host refuses — the slide keeps the theme's
  own background and the default layout, silently in a published deck; under `kadal-deck dev` and
  in a builder preview a dismissible "Pro background — available on Kadal Deck Pro" chip says
  why. An item's static `poster` is used in print, export, thumbnails and with reduced motion.

## 0.4.10

No changes in this release.

## 0.4.9

No changes in this release.

## 0.4.8

No changes in this release.

## 0.4.7

No changes in this release.

## 0.4.6

No changes in this release.

## 0.4.5

No changes in this release.

## 0.4.4

No changes in this release.

## 0.4.3

No changes in this release.
