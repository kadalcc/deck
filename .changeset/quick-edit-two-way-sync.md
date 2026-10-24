---
"@kadal/deck": minor
---

Edit a CLI deck on the web, and bring the edits back.

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
