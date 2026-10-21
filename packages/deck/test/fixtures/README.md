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
