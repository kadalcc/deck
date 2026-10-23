# @kadal/theme-brand

**Brand**, a theme for [Kadal Deck](https://deck.kadal.cc). A corporate theme a company makes its own without writing CSS. Everything that says "us" comes from `themeConfig`: the primary and secondary colours, the logo (and a version for dark slides), the company's name and the footer line. The rest is built to be trusted: Plus Jakarta Sans, a white page, generous cards, quiet hairlines, numbers that line up. The cover is the brand's colour edge to edge; content slides carry the logo and a footer with the page.

<p>
  <img src="https://deck.kadal.cc/themes/brand-light-1.webp" alt="Brand: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/brand-dark-2.webp" alt="Brand: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-brand)

## Use it

```bash
npm install @kadal/theme-brand
```

```yaml
---
theme: brand
themeConfig:            # all optional
  primary: "#2453d4"
  secondary: "#0f9d8a"
  primaryInk: "#ffffff"
  logoPosition: top-right
---
```

The deck plugin brings the stylesheet and the module in; nothing to import. The prebuilt shell (the hosted builder, published decks) bundles this theme already. Schemes: light and dark. Fonts: Plus Jakarta Sans (text and headings), JetBrains Mono (code), loaded through the theme's `config.fonts`; a deck's own `fonts:` swaps in the brand's typeface. Code colours: Shiki's github-light-default / github-dark-default. To show it beside other themes in the theme menu (<kbd>T</kbd>), list it: `themes: [brand, minimal]`.

## themeConfig

Every key arrives on the deck root as a CSS variable (`accentDark` → `--theme-accent-dark`); the theme reads them with fallbacks, so set only what you change.

| key | type | default | what it does |
| --- | --- | --- | --- |
| `primary` | colour | `#2453d4` | The brand's main colour: the cover, links, numbers, the accent. Lifted towards white on dark slides. |
| `secondary` | colour | `#0f9d8a` | The second colour: gradients, the second series, shapes on the cover. |
| `primaryInk` | colour | `#ffffff` | Text on the primary colour (the cover). |
| `primaryDark` | colour | — | The accent on dark slides, when the lifted primary is not right. |
| `secondaryDark` | colour | — | The same for the secondary. |
| `logo` | URL | — | The logo, an image URL (`./logo.svg` from the deck's public folder). Without one, the company's name is set as a wordmark. |
| `logoDark` | URL | — | The logo for dark slides. |
| `company` | string | — | The company's name: the wordmark, the logo's alt text, and the footer's default. |
| `footer` | string · `false` | the company | The footer line ("Confidential · Q3 review"); `false` hides the footer. |
| `logoPosition` | string | `top-right` | `top-right` · `top-left` · `bottom-right` · `none`. |

## Layouts

Every built-in layout is styled (`default`, `center`, `cover`, `intro`, `section`, `end`, `fact`, `quote`, `statement`, `full`, `two-cols`, `two-cols-header`, `image`, `image-left`, `image-right`, `iframe`, `iframe-left`, `iframe-right`), and the theme adds:

| layout | what |
| --- | --- |
| `title-logo` | The opening slide: the logo large, the title, `presenter:` and `date:` underneath, a panel in the brand's colours on the right. |
| `agenda` | The slide's list as numbered cards in two columns. |
| `metrics` | A heading and a row of `<Metric>` figures, centred on the slide; other text spans the row. |

## Components

| component | what |
| --- | --- |
| `<Metric value label delta />` | One figure in a card; a `delta` starting with `-` or `−` reads as down. |
| `<Logo />` | The configured logo (or the wordmark), anywhere. |

## Preview

`preview/deck.mdx` walks through every layout and component (`theme: ../`). In this repository:

```bash
bun run --filter @kadal/theme-brand dev       # the preview deck, live
node tools/theme-shots.mjs brand               # screenshots in light and dark, contrast and overflow checks
```

## Accessibility and print

Body and muted text meet WCAG AA (4.5:1) on the page and on cards in every scheme the theme draws (checked by `tools/theme-shots.mjs`). Anything that moves stands still under `prefers-reduced-motion` and on a still copy; printed pages and exports drop shadows and glows.

## Licence

AGPL-3.0-or-later, like the engine (see LICENSE); a commercial licence is available — see [LICENSING](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
