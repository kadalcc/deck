# @kadal/theme-crisp

**Crisp**, a theme for [Kadal Deck](https://deck.kadal.cc): plain black on white. Helvetica
Neue, bold titles over a bold subtitle, pictures set inside a margin, and layouts for title
pictures and photo grids. Light and dark. A port of a Slidev theme (see the attribution below),
with its layout names and frontmatter, so a Slidev deck moves over unchanged.

```bash
npm install @kadal/theme-crisp
```

```yaml
---
theme: crisp
layout: intro-image
image: /title.jpg
---
```

## Layouts

Every engine layout is styled. The theme's own:

| layout | frontmatter | what |
|---|---|---|
| `intro-image` | `image` | the picture fills the slide; the words, white, sit on it |
| `intro-image-right` | `image` | a title block centred on the left, the picture in a margin on the right |
| `image-right` | `image` | the words from the top on the left, the picture in a margin on the right (replaces the engine's) |
| `3-images` | `imageLeft`, `imageTopRight`, `imageBottomRight` | one tall picture and two stacked |
| `bullets` | | a list without a title, hung below the top |

An `image` that starts with `#`, `rgb` or `hsl` paints a colour instead, as in Slidev. `intro`,
`section`, `statement`, `fact` and `quote` keep their Slidev look.

## Develop

The preview deck (`preview/deck.mdx`) is the original theme's own example deck, slide for slide:

```bash
npm run dev      # the preview deck, live
npm run check    # lint it
```

## Licence and attribution

MIT. This package is a port of [`@slidev/theme-apple-basic`](https://github.com/slidevjs/themes), MIT License,
Copyright (c) 2021 Slidev.js Team (the theme by Jeremy Meissner). The look, the layouts and their frontmatter are
theirs; the React layouts and the stylesheet were rewritten for Kadal Deck. The full notice is in
[LICENSE](./LICENSE).
