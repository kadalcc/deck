# The theme gallery

Kadal's eight first-party themes on one deck: ocean, folio, swiss, terminal, lecture, brand,
crayon and neon (and the built-in minimal). Every slide uses only the built-in layouts, so the
same words appear in each theme; press <kbd>T</kbd> to switch, <kbd>D</kbd> for dark.

```bash
bun install && bun run build      # at the repository root
bun run --filter kadal-deck-themes dev
```

Each theme's own layouts and components are in its preview deck:
`packages/theme-<name>/preview/deck.mdx` (`bun run --filter @kadal/theme-<name> dev`).
`node tools/theme-shots.mjs` screenshots every preview deck in light and dark and checks
contrast and overflow.
