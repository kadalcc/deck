# @kadal/theme-bricks

**Bricks**, a theme for [Kadal Deck](https://deck.kadal.cc): Slidev's bricks theme, ported.
Building blocks in coral, butter, rose and sky on a cream page, a different arrangement behind
each layout, Sigmar One for headings and Signika Negative for words. Light only.

```bash
npm install @kadal/theme-bricks
```

```yaml
---
theme: bricks
---
```

## Layouts

| layout | frontmatter / slots | what |
|---|---|---|
| `cover` | | the title in the display face over a heap of blocks |
| `intro` | `::left::` | the title, big, in the right-hand column |
| `default` | | blocks in three corners, generous margins |
| `section` | `::right::` | the title low in the left column, the `right` slot centred in the other |
| `items` | `cols` (4), `::items::` | a title over a grid of items |
| `quote`, `fact`, `statement` | | a centred line among blocks |
| `blank` | | the bare page |

## Components

`<Polygon1 />` to `<Polygon11 />`: the blocks themselves. Size them as in Slidev,
`<Polygon7 w="20" h="20" m="auto" />` (Uno's spacing scale: 20 is 5rem), or with any CSS length,
`className` or `style`. Without an `aria-label` a block is decoration, hidden from screen readers.

## Develop

The preview deck (`preview/deck.mdx`) is the original theme's own example deck, slide for slide:

```bash
npm run dev      # the preview deck, live
npm run check    # lint it
```

## Licence and attribution

MIT. This package is a port of [`@slidev/theme-bricks`](https://github.com/slidevjs/themes), MIT License,
Copyright (c) 2021 Slidev.js Team (the theme by Inès Fendi). The look, the layouts and their frontmatter are
theirs; the React layouts and the stylesheet were rewritten for Kadal Deck. The full notice is in
[LICENSE](./LICENSE).
