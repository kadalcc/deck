# @kadal/create-deck

## 0.4.1

No changes in this release.

## 0.4.0

### Minor Changes

- 1e304e3: Theme and addon packages. `theme: seriph` now finds a built-in theme, then `@kadal/theme-seriph`, then `kadal-theme-seriph`, then a package of that name, and `theme: ./theme` a folder beside deck.mdx; `addons: [qr]` does the same for addons. The Vite plugin imports their stylesheets and modules for you (no line in main.tsx), merges their layouts, components and layers under the deck's own, feeds a theme's Shiki themes to the highlighter, and fails with what it tried and the install command when one is missing. `themeConfig` keys become `--theme-<name>` CSS variables on the deck root; a theme's `defaults` and `config` sit under the deck's own. The prebuilt shell bundles every first-party theme package and falls back to minimal, with a dismissible notice, for a theme it does not have.

  Also new: global and slide layers (`global-top.tsx`, `global-bottom.tsx`, `slide-top.tsx`, `slide-bottom.tsx` beside deck.mdx, or `<Deck layers>`), drawn in play, print and export with the page number and click as props; `kadal-deck theme eject` to copy a theme (built-ins too) into the deck; `kadal-deck new --theme <name>` / `--addon <name>` and `npm create @kadal/deck -- --theme <name>` to scaffold a package ready to publish; `kadal-deck info themes` listing the installed ones; the `two-cols-header` layout; and Slidev's `fonts` object (`sans`, `serif`, `mono`, `weights`, `italic`, `provider: google | bunny | none`, `local`), which exports now wait for. The contract is in THEMES.md.

## 0.3.6

No changes in this release.

## 0.3.5

No changes in this release.

## 0.3.4

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.2

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- 64ac55f: First-class support for AI agents.

  - `kadal-deck mcp`: a Model Context Protocol server (stdio) with tools to look up the reference, scaffold a deck, outline it, edit single slides (only their lines change; each edit is linted), check, render slides to PNG for the agent to look at, preview, build, export and publish — plus the catalog, reference and guides as resources and `draft_deck` / `review_deck` prompts.
  - New commands: `kadal-deck check` (lint frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary and code fences, with file:line), `kadal-deck info` (the reference), `kadal-deck screenshot` (PNG per slide) and `kadal-deck new <dir>` (scaffold without questions).
  - Every command but dev/build/mcp takes `--json`; flags accept `--flag=value`; documented exit codes (0 ok, 1 failed, 2 usage, 3 not signed in, 4 missing prerequisite); `--dir`/`-C` runs in another folder.
  - `@kadal/deck/catalog` (everything a deck can use, as data, kept in sync with the engine by tests), `@kadal/deck/authoring` (outline, lint and edit a deck as text) and `@kadal/deck/schema/frontmatter.json` (JSON Schema).
  - The Agent Skill (`skills/kadal-deck`, also shipped in the package) and a Claude Code plugin marketplace in the repository; new decks get an `AGENTS.md`.
  - `splitDeck` reports each slide's exact line range and can collect YAML/include problems instead of throwing (`onError`).

## 0.1.1

No changes in this release.
