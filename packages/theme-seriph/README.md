# @kadal/theme-seriph

**Seriph**, a theme for [Kadal Deck](https://deck.kadal.cc): Slidev's seriph theme, ported. PT
Serif for everything, PT Mono for code, headings in the primary colour (a slate teal) except on
the cover, and a centred cover over a dimmed background picture. Light and dark.

<p>
  <img src="https://deck.kadal.cc/themes/seriph-light-1.webp" alt="Seriph: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/seriph-dark-2.webp" alt="Seriph: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-seriph)

```bash
npm install @kadal/theme-seriph
```

```yaml
---
theme: seriph
layout: cover
background: /cover.jpg
themeConfig:
  primary: "#5d8392"    # → --theme-primary: the headings, links on hover, the progress bar
---
```

## Layouts

Every engine layout is styled. The theme's own:

| layout | frontmatter | what |
|---|---|---|
| `cover` | `background` | the title centred; a picture background gets Slidev's dim and white words |

`intro`, `section`, `statement`, `fact` and `quote` keep their Slidev look. Slidev's seriph
falls back to a random picture from source.unsplash.com when a cover names none; that service no
longer exists, so a cover without `background:` here is simply plain.

## Develop

The preview deck (`preview/deck.mdx`) is the original theme's own example deck, slide for slide:

```bash
npm run dev      # the preview deck, live
npm run check    # lint it
```

## Licence and attribution

MIT. This package is a port of [`@slidev/theme-seriph`](https://github.com/slidevjs/themes), MIT License,
Copyright (c) 2021 Slidev.js Team (the theme by Anthony Fu). The look, the layouts and their frontmatter are
theirs; the React layouts and the stylesheet were rewritten for Kadal Deck. The full notice is in
[LICENSE](https://github.com/kadalcc/deck/blob/main/packages/theme-seriph/LICENSE).
