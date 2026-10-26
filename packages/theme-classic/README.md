# @kadal/theme-classic

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. A theme is how your talk looks on the day, on the projector and on every phone in the room.
>
> [Take the tour](https://decks.kadal.cc/@pmithunish/tour/) · [Docs](https://deck.kadal.cc/docs/)

**Classic**, a theme for [Kadal Deck](https://deck.kadal.cc): Slidev's default theme, ported.
Avenir Next (Nunito Sans where it is not installed), light headings, square bullets, dashed
links, a cyan primary, and a cover that dims a background picture. Light and dark.

<p>
  <img src="https://deck.kadal.cc/themes/classic-light-1.webp" alt="Classic: the cover, light" width="49%">
  <img src="https://deck.kadal.cc/themes/classic-dark-2.webp" alt="Classic: a content slide, dark" width="49%">
</p>

[All 16 themes](https://deck.kadal.cc/themes/) · [Themes and backgrounds](https://deck.kadal.cc/docs/themes-and-backgrounds/) · [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/theme-classic)

@kadal/deck ships this theme, so `theme: classic` works with nothing else installed. Install the
package only to give the deck a copy of its own, at a version you pick:

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
[LICENSE](https://github.com/kadalcc/deck/blob/main/packages/theme-classic/LICENSE).
