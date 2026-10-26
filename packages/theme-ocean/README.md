# @kadal/theme-ocean

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. A theme is how your talk looks on the day, on the projector and on every phone in the room.
>
> [Take the tour](https://decks.kadal.cc/@pmithunish/tour/) · [Docs](https://deck.kadal.cc/docs/)

**Ocean**, a theme for [Kadal Deck](https://deck.kadal.cc). Kadal's own theme. *Kadal* is Tamil for the sea, and the palette is the one [kadal.cc](https://kadal.cc) dives through: sunlit shallows in the light scheme (foam, sky and deep-sea ink), midnight water in the dark one (twilight blue, bioluminescent cyan, lure amber). Calm gradients for the page, Catamaran for type, Night Owl for code. Made to be a good default for a new deck.

<p>
  <img src="https://deck.kadal.cc/themes/ocean-light-1.webp" alt="Ocean: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/ocean-dark-2.webp" alt="Ocean: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-ocean)

## Use it

@kadal/deck ships this theme, so `theme: ocean` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

```bash
npm install @kadal/theme-ocean
```

```yaml
---
theme: ocean
themeConfig:            # all optional
  accent: "#1d63a8"
  accentDark: "#5ff7ff"
  waves: true
---
```

The deck plugin brings the stylesheet and the module in; nothing to import. The prebuilt shell (the hosted builder, published decks) bundles this theme already. Schemes: light and dark. Fonts: Catamaran (text and headings), JetBrains Mono (code), loaded through the theme's `config.fonts`. Code colours: Shiki's night-owl-light / night-owl. Every deck's theme menu (<kbd>T</kbd>) offers it already; list it (`themes: [ocean, minimal]`) to put it near the top, load its stylesheet with the deck, and give code its own colours when it is picked.

## themeConfig

Every key arrives on the deck root as a CSS variable (`accentDark` → `--theme-accent-dark`); the theme reads them with fallbacks, so set only what you change.

| key | type | default | what it does |
| --- | --- | --- | --- |
| `accent` | colour | `#1d63a8` | The accent in the light scheme (links, bullets, the progress bar). |
| `accentDark` | colour | `#5ff7ff` | The accent in the dark scheme. Without it, a set `accent` is lifted towards white. |
| `waves` | boolean | `true` | `false` hides the swells along the cover's foot. |

## Layouts

Every built-in layout is styled (`default`, `center`, `cover`, `intro`, `section`, `end`, `fact`, `quote`, `statement`, `full`, `two-cols`, `two-cols-header`, `image`, `image-left`, `image-right`, `iframe`, `iframe-left`, `iframe-right`), and the theme adds:

| layout | what |
| --- | --- |
| `waves` | A cover with the sea moving along the bottom edge. `align: center` centres it. The swells stand still under `prefers-reduced-motion` and in print. |
| `depth` | A section opener: its number (counted, or `n:`), a label (`depth: "200 m · twilight"`) and a sounding line down the side marking how far into the deck it is. |

## Components

| component | what |
| --- | --- |
| `<Wave />` | A single swell as a divider, in the accent colour; `flip` turns it over. |

## Preview

`preview/deck.mdx` walks through every layout and component (`theme: ../`). In this repository:

```bash
bun run --filter @kadal/theme-ocean dev       # the preview deck, live
node tools/theme-shots.mjs ocean               # screenshots in light and dark, contrast and overflow checks
```

## Accessibility and print

Body and muted text meet WCAG AA (4.5:1) on the page and on cards in every scheme the theme draws (checked by `tools/theme-shots.mjs`). Anything that moves stands still under `prefers-reduced-motion` and on a still copy; printed pages and exports drop shadows and glows.

## Licence

AGPL-3.0-or-later, like the engine (see LICENSE); a commercial licence is available — see [LICENSING](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
