# @kadal/theme-neon

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. A theme is how your talk looks on the day, on the projector and on every phone in the room.
>
> [Take the tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Docs](https://deck.kadal.cc/docs/)

**Neon**, a theme for [Kadal Deck](https://deck.kadal.cc). A dark synthwave theme for meetups and launches. Midnight violet, a striped sunset sun over a grid that runs to the horizon, Orbitron for display, Space Grotesk for text, the Synthwave '84 code colours. The glows stay legible: the letters keep near white and only the halo takes the colour. Every glow, blur and animation is dropped on a still copy (the print view, an export, an overview tile), so a PDF gets solid colour and clean edges rather than grey halos. Dark only.

<p>
  <img src="https://deck.kadal.cc/themes/neon-dark-1.webp" alt="Neon: the cover, dark" width="49%">
  <img src="https://deck.kadal.cc/themes/neon-dark-2.webp" alt="Neon: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-neon)

## Use it

@kadal/deck ships this theme, so `theme: neon` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

```bash
npm install @kadal/theme-neon
```

```yaml
---
theme: neon
themeConfig:            # all optional
  primary: "#ff3ec8"
  secondary: "#2de2e6"
  grid: true
---
```

The deck plugin brings the stylesheet and the module in; nothing to import. The prebuilt shell (the hosted builder, published decks) bundles this theme already. Schemes: dark only. Fonts: Orbitron (headings), Space Grotesk (text), JetBrains Mono (code), loaded through the theme's `config.fonts`. Code colours: Shiki's synthwave-84 (both). Every deck's theme menu (<kbd>T</kbd>) offers it already; list it (`themes: [neon, minimal]`) to put it near the top, load its stylesheet with the deck, and give code its own colours when it is picked.

## themeConfig

Every key arrives on the deck root as a CSS variable (`accentDark` → `--theme-accent-dark`); the theme reads them with fallbacks, so set only what you change.

| key | type | default | what it does |
| --- | --- | --- | --- |
| `primary` | colour | `#ff3ec8` | Magenta: headings' glow, the accent. |
| `secondary` | colour | `#2de2e6` | Cyan: bullets, links, labels. |
| `grid` | boolean | `true` | `false` hides the floor grid on covers and the theme's layouts. |

## Layouts

Every built-in layout is styled (`default`, `center`, `cover`, `intro`, `section`, `end`, `fact`, `quote`, `statement`, `full`, `two-cols`, `two-cols-header`, `image`, `image-left`, `image-right`, `iframe`, `iframe-left`, `iframe-right`), and the theme adds:

| layout | what |
| --- | --- |
| `launch` | The title over the striped sun with the grid running to the horizon, and a pulsing chip above it (`chip: "Live · 24 Oct"`, or `date:`). |
| `horizon` | An ordinary content slide with the grid along its foot. |

## Components

| component | what |
| --- | --- |
| `<Glow tone>` | A word or phrase in neon: `tone` pink (default) · cyan · amber. |

## Preview

`preview/deck.mdx` walks through every layout and component (`theme: ../`). In this repository:

```bash
bun run --filter @kadal/theme-neon dev       # the preview deck, live
node tools/theme-shots.mjs neon               # screenshots in light and dark, contrast and overflow checks
```

## Accessibility and print

Body and muted text meet WCAG AA (4.5:1) on the page and on cards in every scheme the theme draws (checked by `tools/theme-shots.mjs`). Anything that moves stands still under `prefers-reduced-motion` and on a still copy; printed pages and exports drop shadows and glows.

## Licence

AGPL-3.0-or-later, like the engine (see LICENSE); a commercial licence is available — see [LICENSING](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
