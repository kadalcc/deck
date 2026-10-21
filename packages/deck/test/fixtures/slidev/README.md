# Slidev decks, as importer inputs

Real Slidev projects, read (never installed or run) by the importer's tests
(`src/import/*.test.ts`) and kept as Slidev wrote them:

- `starter/` — the template `npm create slidev` makes (create-slidev 53.0.0): `slides.md`,
  `components/Counter.vue`, `pages/imported-slides.md`, `snippets/external.ts`, `package.json`.
- `composable-vue/` — the first part of Anthony Fu's "Composable Vue" talk (Slidev's
  `demo/composable-vue`): `slides.md` up to the "Connections" slides, and the components it uses.
- `apple-basic/` — `@slidev/theme-apple-basic`'s `example.md`, with `theme: ./` written as
  `theme: apple-basic` (the deck as a user of that theme has it).

All three are © Anthony Fu and the Slidev contributors, MIT licence
(https://github.com/slidevjs/slidev/blob/main/LICENSE,
https://github.com/slidevjs/themes/blob/main/LICENSE); see THIRD_PARTY_NOTICES.md.
