# @kadal/theme-classic

**Classic**, a theme for [Kadal Deck](https://deck.kadal.cc): Slidev's default theme, ported.
Avenir Next (Nunito Sans where it is not installed), light headings, square bullets, dashed
links, a cyan primary, and a cover that dims a background picture. Light and dark.

```bash
npm install @kadal/theme-classic
```

```yaml
---
theme: classic
layout: cover
background: /cover.jpg      # a picture is dimmed and the words turn white, as in Slidev
themeConfig:
  primary: "#3ab9d5"        # → --theme-primary: links on hover, the quote's rule, the progress bar
---
```

## Layouts

Every engine layout is styled. The theme's own:

| layout | frontmatter | what |
|---|---|---|
| `cover` | `background` | the title, vertically centred; a picture background gets Slidev's dim |

`intro`, `section`, `statement`, `fact` and `quote` keep their Slidev look (a big centred
section title, a bold statement, a huge fact over a bold caption).

Fonts load through the fonts mechanism (`config.fonts` in package.json): Avenir Next is used
when installed, Nunito Sans from Google Fonts otherwise, Fira Code for code. Code is coloured with
Shiki's `vitesse-light` / `vitesse-dark`, Slidev's own.

## Develop

The preview deck (`preview/deck.mdx`) is the original theme's own example deck, slide for slide:

```bash
npm run dev      # the preview deck, live
npm run check    # lint it
```

## Licence and attribution

MIT. This package is a port of [`@slidev/theme-default`](https://github.com/slidevjs/themes), MIT License,
Copyright (c) 2021 Slidev.js Team (the theme by Anthony Fu). The look, the layouts and their frontmatter are
theirs; the React layouts and the stylesheet were rewritten for Kadal Deck. The full notice is in
[LICENSE](./LICENSE).
