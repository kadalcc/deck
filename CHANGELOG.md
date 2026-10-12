# Changelog

Per-package changelogs live next to each package (`packages/*/CHANGELOG.md`) and are written by
Changesets on release. Each version is also a [GitHub release](https://github.com/kadalcc/deck/releases),
and the hosted service's changes are on [deck.kadal.cc/changelog](https://deck.kadal.cc/changelog/).

## 0.1.0

The first public release: `@kadal/deck` (engine, Vite plugin, runtime, live client, export, the
`kadal-deck` CLI), nine framework renderers, and `@kadal/create-deck`.

- **The engine**, under the AGPL-3.0-or-later or a commercial licence: the MDX compiler and Vite
  plugin, the React runtime, components, layouts, three themes and thirty backgrounds.
- **The views**: the presenter view, the audience page, the notes page and the stats page.
- **Framework islands** through one renderer contract, with packages for Vue, Svelte, Solid,
  Preact, Qwik, Angular, Fresh, WebAssembly (Rust) and Python.
- **Export** to PDF, PNG and PPTX, with posters for embedded pages.
- **`@kadal/create-deck`** to start a deck, and the `kadal-deck` CLI: `dev`, `build`, `export`,
  `login`, `logout`, `whoami` and `publish`.
