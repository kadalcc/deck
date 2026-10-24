# @kadal/prettier-plugin

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

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

### Patch Changes

- 75231f0: A Comark block's YAML props (`---` lines straight after `::card`) no longer cut the slide in two. The splitter, and the Prettier plugin's copy of it, skip `---` inside a Comark block that is closed; a block left open still ends at the next separator.
- ece124f: Refresh READMEs and package metadata: each package page says what the package is, how to install and use it, and links its docs; theme pages show the theme; the author is now Kadal (hello@kadal.cc), with homepages pointing at each package's own docs page.

## 0.4.2

No changes in this release.

## 0.4.1

No changes in this release.

## 0.4.0

### Minor Changes

- cb39d7d: Editor tooling, on a par with Slidev's and past it in places.

  - **`kadal-deck format [files] [--check]`** formats `deck.mdx` and the files it includes: `---`/`----` separators and frontmatter tidied, the YAML formatted with its comments and key order kept, and every slide's Markdown formatted by Prettier — while code fences, `<Notes>` and comment notes, magic-move, `<style>`, maths, `::slot::` markers, code groups and `<<<` imports stay byte for byte. Each formatted slide is checked to mean the same (parsed again as CommonMark and as MDX); one that would not keeps its text and the command says why. `--check` exits 1 when a file would change. The deck's own Prettier config applies.
  - **`@kadal/prettier-plugin`** (new package): the same formatter for any editor or CI that runs Prettier. With the plugin loaded, `deck.mdx` and `slides.mdx` are formatted as decks by name; other files use `"parser": "kadal-deck"`.
  - **A side editor in `kadal-deck dev`**: press E (or `view.editor`, or "Edit slide source" in the right-click menu) to edit the current slide's whole source — frontmatter, body, notes — beside it in CodeMirror, and Cmd/Ctrl+S to save it into the deck file through `/__kadal/source`. Only that slide's lines change; a slide edited elsewhere meanwhile is a conflict to resolve, not an overwrite; unsaved text survives a reload. CodeMirror is never in a build.
  - **`kadal-deck dev --tunnel`** shares the dev server through a Cloudflare Quick Tunnel when `cloudflared` is installed (and says how to install it when not): the https address and a QR code in the terminal, and the phone remote pairs through it. **`--remote [password]`** serves on the network, and with a password the presenter, notes and overview pages and the dev endpoints ask anyone not on this computer for it. A tunnel always has a password (made up and printed when you give none), because the dev server can write your files.
  - Stopping `kadal-deck dev` or `build` with a signal now stops Vite as well.
  - A VS Code extension (Kadal Deck: slides outline with drag-to-reorder, a preview that follows the cursor, frontmatter IntelliSense, `check` as problems, formatting) lives in `packages/vscode`.
