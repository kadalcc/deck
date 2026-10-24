# @kadal/theme-crayon

**Crayon**, a theme for [Kadal Deck](https://deck.kadal.cc). A playful pastel theme for workshops and classrooms. Fredoka for headings, Nunito for text, Fira Code for code; cream paper and plum ink, six pastels, chunky ink outlines and offset shadows that look like paper cut-outs. Callouts are stickers, a blockquote is a speech bubble, list bullets are coloured dots, a section title is a big sticker and a fact sits in a round one. The shadows are solid offsets, never blurred, so print and PDF look like the screen.

<p>
  <img src="https://deck.kadal.cc/themes/crayon-light-1.webp" alt="Crayon: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/crayon-dark-2.webp" alt="Crayon: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-crayon)

## Use it

@kadal/deck ships this theme, so `theme: crayon` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

```bash
npm install @kadal/theme-crayon
```

```yaml
---
theme: crayon
themeConfig:            # all optional
  tilt: true
  accent: "#c62f6b"
  accentDark: "#ff9cc2"
---
```

The deck plugin brings the stylesheet and the module in; nothing to import. The prebuilt shell (the hosted builder, published decks) bundles this theme already. Schemes: light and dark. Fonts: Fredoka (headings), Nunito (text), Fira Code (code), loaded through the theme's `config.fonts`. Code colours: Shiki's catppuccin-latte / catppuccin-macchiato. Every deck's theme menu (<kbd>T</kbd>) offers it already; list it (`themes: [crayon, minimal]`) to put it near the top, load its stylesheet with the deck, and give code its own colours when it is picked.

## themeConfig

Every key arrives on the deck root as a CSS variable (`accentDark` → `--theme-accent-dark`); the theme reads them with fallbacks, so set only what you change.

| key | type | default | what it does |
| --- | --- | --- | --- |
| `tilt` | boolean | `true` | `false` straightens every sticker. |
| `accent` | colour | `#c62f6b` | The light scheme's accent (berry). |
| `accentDark` | colour | `#ff9cc2` | The dark scheme's. Without it, a set `accent` is lifted towards white. |

## Layouts

Every built-in layout is styled (`default`, `center`, `cover`, `intro`, `section`, `end`, `fact`, `quote`, `statement`, `full`, `two-cols`, `two-cols-header`, `image`, `image-left`, `image-right`, `iframe`, `iframe-left`, `iframe-right`), and the theme adds:

| layout | what |
| --- | --- |
| `activity` | An exercise: a tag (`label:`, default "Activity"), a time chip (`time: 10 min`) and the slide's numbered list as step stickers (`columns:`, default 3). |
| `cards` | The slide's bullet list as a grid of pastel cards (`columns:`, default 3); a **bold** opening is the card's title. |

## Components

| component | what |
| --- | --- |
| `<Sticker tone tilt>` | Words on a pastel cut-out: `tone` pink · mint · sky · butter · lilac · peach (default butter), `tilt` in degrees (default -2). |
| `<Bubble from side>` | A speech bubble; `from` names the speaker, `side="right"` answers. |

## Preview

`preview/deck.mdx` walks through every layout and component (`theme: ../`). In this repository:

```bash
bun run --filter @kadal/theme-crayon dev       # the preview deck, live
node tools/theme-shots.mjs crayon               # screenshots in light and dark, contrast and overflow checks
```

## Accessibility and print

Body and muted text meet WCAG AA (4.5:1) on the page and on cards in every scheme the theme draws (checked by `tools/theme-shots.mjs`). Anything that moves stands still under `prefers-reduced-motion` and on a still copy; printed pages and exports drop shadows and glows.

## Licence

AGPL-3.0-or-later, like the engine (see LICENSE); a commercial licence is available — see [LICENSING](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
