# Theme and addon fixtures

Two small packages that exercise every part of the theme/addon contract (THEMES.md): the
resolution tests (src/theming/theming.test.ts) read them from disk, and a scratch deck can use
them by path (`theme: ../path/to/kadal-theme-fixture`) or copied into its node_modules
(`theme: fixture`). They are not workspace packages and never published.

- `kadal-theme-fixture`: a theme with a layout (`banner`), a component, a `global-bottom` footer
  layer, `themeConfig` defaults read as `--theme-*`, slide `defaults`, headmatter `config` and
  Shiki themes.
- `kadal-addon-fixture`: an addon with a component (`Stamp`), a `slide-top` layer, a stylesheet
  and a `setup` that registers a command and a shortcut.

`slidev/` holds Slidev decks the importer (`kadal-deck import slidev`, src/import/) is tested
against; its README says where each came from.

`reveal/demo/` is a reveal.js deck for `kadal-deck import reveal` (src/import/reveal.test.ts and
src/cli/import.test.ts): written for these tests after reveal.js's own demo page — every slide
kind the converter handles (stacks, fragment styles and indexes, background colour, gradient,
image, video and iframe, notes, auto-animate, stepped code, inline and external Markdown, a table,
maths, a script handler to report) — with no reveal.js files of its own.
