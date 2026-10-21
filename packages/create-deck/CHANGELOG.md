# @kadal/create-deck

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
