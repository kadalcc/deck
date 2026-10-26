# @kadal/theme-bricks

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. A theme is how your talk looks on the day, on the projector and on every phone in the room.
>
> [Take the tour](https://decks.kadal.cc/@pmithunish/tour/) · [Docs](https://deck.kadal.cc/docs/)

**Bricks**, a theme for [Kadal Deck](https://deck.kadal.cc): Slidev's bricks theme, ported.
Building blocks in coral, butter, rose and sky on a cream page, a different arrangement behind
each layout, Sigmar One for headings and Signika Negative for words. Light only.

<p>
  <img src="https://deck.kadal.cc/themes/bricks-light-1.webp" alt="Bricks: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/bricks-light-2.webp" alt="Bricks: a content slide, light" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-bricks)

@kadal/deck ships this theme, so `theme: bricks` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

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
[LICENSE](https://github.com/kadalcc/deck/blob/main/packages/theme-bricks/LICENSE).
