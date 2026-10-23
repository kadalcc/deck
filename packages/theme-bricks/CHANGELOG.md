# @kadal/theme-bricks

## 0.4.3

### Patch Changes

- ece124f: Refresh READMEs and package metadata: each package page says what the package is, how to install and use it, and links its docs; theme pages show the theme; the author is now Kadal (hello@kadal.cc), with homepages pointing at each package's own docs page.
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [3baec91]
- Updated dependencies [ece124f]
- Updated dependencies [75231f0]
- Updated dependencies [75231f0]
- Updated dependencies [ece124f]
- Updated dependencies [75231f0]
- Updated dependencies [6c20c1b]
- Updated dependencies [75231f0]
  - @kadal/deck@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [78a0bc9]
  - @kadal/deck@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [fa42a5d]
- Updated dependencies [1c4dc5e]
  - @kadal/deck@0.4.1

## 0.4.0

### Minor Changes

- e3e6cc8: Slidev's five official themes, ported as Kadal theme packages: `@kadal/theme-classic` (Slidev's default theme), `@kadal/theme-seriph`, `@kadal/theme-crisp`, `@kadal/theme-bricks` and `@kadal/theme-shibainu`. Each keeps its Slidev original's layouts with the same names, slots and frontmatter (crisp's `intro-image`, `3-images` and `bullets`; bricks' `items` and `<Polygon1>`–`<Polygon11>`; shibainu's fourteen backgrounds), its `themeConfig` (`primary`), colour schemes, fonts and Shiki themes, and Slidev's proportions exactly. Install one and write `theme: seriph`; the prebuilt shell bundles all five. Each package has a preview deck that reproduces the original theme's example deck. THEMES.md has the Slidev → Kadal name mapping, and the catalog lists the packages (`THEME_PACKAGES`, `kadal-deck info themes`).

  Fixed: slides now take the theme's text colour and body face. They used to inherit the base stylesheet's #111 and system-ui whatever the theme or the headmatter's `fonts` said, because html and body read those tokens before the theme's class applies.

### Patch Changes

- Updated dependencies [e08452a]
- Updated dependencies [fb92912]
- Updated dependencies [f78ff3e]
- Updated dependencies [e42ad6a]
- Updated dependencies [479e4ae]
- Updated dependencies [62d24fc]
- Updated dependencies [9d6191f]
- Updated dependencies [6f74216]
- Updated dependencies [28b93c0]
- Updated dependencies [9042c0b]
- Updated dependencies [e3e6cc8]
- Updated dependencies [1e304e3]
- Updated dependencies [cb39d7d]
  - @kadal/deck@0.4.0
