# @kadal/theme-swiss

**Swiss**, a theme for [Kadal Deck](https://deck.kadal.cc). The International Typographic Style for design talks. Huge Inter Tight headings set tight and flush left on a twelve-column grid, heavy black rules, and one signal colour used sparingly. Facts, statements and quotes sit flush left, not centred; a section is the signal colour edge to edge; a running header carries the deck's title, the current section and the page.

<p>
  <img src="https://deck.kadal.cc/themes/swiss-light-1.webp" alt="Swiss: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/swiss-dark-2.webp" alt="Swiss: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-swiss)

## Use it

```bash
npm install @kadal/theme-swiss
```

```yaml
---
theme: swiss
themeConfig:            # all optional
  header: true
  signal: "#d70017"
  signalDark: "#ff3b2f"
---
```

The deck plugin brings the stylesheet and the module in; nothing to import. The prebuilt shell (the hosted builder, published decks) bundles this theme already. Schemes: light and dark. Fonts: Inter Tight (headings), Inter (text), JetBrains Mono (code), loaded through the theme's `config.fonts`. Code colours: Shiki's min-light / vesper. To show it beside other themes in the theme menu (<kbd>T</kbd>), list it: `themes: [swiss, minimal]`.

## themeConfig

Every key arrives on the deck root as a CSS variable (`accentDark` → `--theme-accent-dark`); the theme reads them with fallbacks, so set only what you change.

| key | type | default | what it does |
| --- | --- | --- | --- |
| `header` | boolean | `true` | The running header on content slides. `false` turns it off; `header: false` in a slide's frontmatter hides it on that slide. |
| `signal` | colour | `#d70017` | The one colour (light scheme), and the section slides' ground. |
| `signalDark` | colour | `#ff3b2f` | The signal on the dark page. Without it, a set `signal` is lifted towards white. |

## Layouts

Every built-in layout is styled (`default`, `center`, `cover`, `intro`, `section`, `end`, `fact`, `quote`, `statement`, `full`, `two-cols`, `two-cols-header`, `image`, `image-left`, `image-right`, `iframe`, `iframe-left`, `iframe-right`), and the theme adds:

| layout | what |
| --- | --- |
| `poster` | One word or number as large as the slide allows (`size: 15em`, `signal: true` for the signal colour); `::meta::` is small print in the top right. |
| `index` | The slide's list as a grid of numbered cells (`columns:`, default 3). A **bold** opening is the cell's title. |
| `grid` | A header across, then each named slot a column under a heavy rule; the columns follow the number of slots (2 to 5), or `columns:`. |

## Components

| component | what |
| --- | --- |
| `<Rule label right signal />` | A heavy rule with a label on the left and one on the right; `signal` colours it. |

## Preview

`preview/deck.mdx` walks through every layout and component (`theme: ../`). In this repository:

```bash
bun run --filter @kadal/theme-swiss dev       # the preview deck, live
node tools/theme-shots.mjs swiss               # screenshots in light and dark, contrast and overflow checks
```

## Accessibility and print

Body and muted text meet WCAG AA (4.5:1) on the page and on cards in every scheme the theme draws (checked by `tools/theme-shots.mjs`). Anything that moves stands still under `prefers-reduced-motion` and on a still copy; printed pages and exports drop shadows and glows.

## Licence

AGPL-3.0-or-later, like the engine (see LICENSE); a commercial licence is available — see [LICENSING](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
