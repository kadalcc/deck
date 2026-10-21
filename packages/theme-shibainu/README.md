# @kadal/theme-shibainu

**Shibainu**, a theme for [Kadal Deck](https://deck.kadal.cc): Slidev's shibainu theme, ported.
Soft blobs and paw-print dots in a shiba's browns, Titillium Web, and fourteen layouts that are
each a different arrangement of the blobs. Dark only.

```bash
npm install @kadal/theme-shibainu
```

```yaml
---
theme: shibainu
layout: cover
themeConfig:
  primary: "#402312"    # the deep brown of the words on the light layouts
---
```

## Layouts

| layout | what |
|---|---|
| `cover` | the title on tan, in deep brown |
| `default` | the words in the left 70% |
| `center` | a centred column on tan |
| `section`, `section-2`, `section-3` | three section pages |
| `default-2` … `default-7` | the words in a box placed clear of each page's blobs |
| `right` | the words right-aligned on the right |
| `quote` | a big centred line |

The engine's other layouts sit on the coat brown with pale words.

## Develop

The preview deck (`preview/deck.mdx`) is the original theme's own example deck, slide for slide:

```bash
npm run dev      # the preview deck, live
npm run check    # lint it
```

## Licence and attribution

MIT. This package is a port of [`@slidev/theme-shibainu`](https://github.com/slidevjs/themes), MIT License,
Copyright (c) 2021 Slidev.js Team (the theme by Inès Fendi). The look, the layouts and their frontmatter are
theirs; the React layouts and the stylesheet were rewritten for Kadal Deck. The full notice is in
[LICENSE](./LICENSE).
