# This is a Kadal Deck

A presentation written in MDX. The slides are in `deck.mdx`; the engine is `@kadal/deck`.

## Commands

```sh
npm run dev                      # live preview at http://localhost:5173 (? = keys, S = presenter view)
npx kadal-deck check             # lint: frontmatter, layouts, MDX, components, assets (exit 1 on errors)
npx kadal-deck screenshot        # PNG of every slide in screenshots/ (needs: npm i -D playwright && npx playwright install chromium)
npx kadal-deck info components   # what is built in; also: layouts, backgrounds, slide, deck, keys
npx kadal-deck build             # static site in dist/
npx kadal-deck export --png      # PDF (+ PNGs) in export/
npx kadal-deck publish           # live URL with an audience room (the user runs `npx kadal-deck login` first)
```

Add `--json` to any of them (except dev/build) for machine-readable output.

## Files

- `deck.mdx` — the slides. `---` starts a slide, `----` a slide beneath the previous one. YAML
  after a separator (closed by `---`) is that slide's frontmatter; the YAML at the top is the
  headmatter (deck settings + the first slide).
- `deck.config.ts` — engine settings; they override the headmatter. Do not set the same key in both.
- `src/components.tsx` — the deck's own components (usable in slides without imports) and custom
  layouts (`"layout:name"` keys).
- `src/styles.css` — custom CSS; use the theme tokens (`var(--deck-accent)`, `--deck-fg`, …).
- `public/` — images and videos, referenced as `/file.png`.

## Conventions

- Look up a component, layout or background (`npx kadal-deck info …`) before using it.
- MDX: blank lines between JSX tags and Markdown inside them; `className`, not `class`;
  `{`, `}` and `<` in prose go in backticks.
- One idea per slide; reveal steps with `<Clicks>`/`<Click>`; speaker notes in `<Notes>` with
  `[click]` markers on every slide.
- After editing: `npx kadal-deck check`, then `npx kadal-deck screenshot` and look at the
  pictures before saying the deck is done.

Full guide for agents: `node_modules/@kadal/deck/skill/SKILL.md` (and its `references/`).
Docs: https://deck.kadal.cc/docs/
