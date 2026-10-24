# @kadal/theme-seriph

## 0.4.10

### Patch Changes

- Updated dependencies [3e06c60]
  - @kadal/deck@0.4.10

## 0.4.9

### Patch Changes

- Updated dependencies [258c229]
  - @kadal/deck@0.4.9

## 0.4.8

### Patch Changes

- a3db811: Every deck's theme menu (T) now offers all sixteen first-party themes, whatever the deck declares.

  - **Nothing to install.** @kadal/deck ships a copy of each of the thirteen theme packages
    (`dist/themes/<name>`), so a deck with only the engine installed can pick any of them, or name
    one (`theme: ocean`). An installed `@kadal/theme-<name>` still wins over the copy.
  - **`themes:` orders the menu; it does not narrow it.** The deck's `theme` comes first, then its
    `themes` in order, then every first-party theme it did not name.
  - **No heavier first paint.** A theme the deck did not name loads its stylesheet and layouts only
    when someone picks it (or points at its row). Its code keeps the deck's colours; name it in
    `themes:` to give its code its own Shiki colours.
  - **Swatches before the CSS.** Theme packages gain `kadal.theme.swatch`, two colours the menu
    paints before the theme's stylesheet has loaded.
  - The prebuilt shell (the builder) offers all sixteen too.

- Updated dependencies [a3db811]
- Updated dependencies [cc70774]
- Updated dependencies [dd72e9b]
  - @kadal/deck@0.4.8

## 0.4.7

### Patch Changes

- Updated dependencies [0be7311]
  - @kadal/deck@0.4.7

## 0.4.6

### Patch Changes

- Updated dependencies [3183122]
  - @kadal/deck@0.4.6

## 0.4.5

### Patch Changes

- Updated dependencies [2416c3a]
- Updated dependencies [2aa06ab]
  - @kadal/deck@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [1bab109]
- Updated dependencies [1bab109]
- Updated dependencies [1bab109]
- Updated dependencies [1bab109]
  - @kadal/deck@0.4.4

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

- 28b93c0: Import a Slidev deck in one command: `kadal-deck import slidev <slides.md | folder>` writes a new
  deck folder (the way `kadal-deck new` makes one) and an `IMPORT-REPORT.md` listing, slide by
  slide, whatever did not carry over exactly. It converts the headmatter (the theme to its Kadal
  port, colour scheme, transitions — Slidev's way out of a slide becomes Kadal's way in — drawings,
  canvas size, fonts, defaults, export options), every click directive and its component form
  (`v-click` with its values and modifiers, `v-after`, `v-clicks`, `v-switch`, `v-mark`, `v-motion`,
  `v-drag`), Slidev's components by their Kadal names, icons, Vue's template syntax (mustaches,
  bindings, the slide's `<script setup>` constants, `v-for` and `v-if` that can be decided at
  import, `$slidev.nav` click handlers), UnoCSS classes and attributify (written into
  `src/slidev.css` at Kadal's scale), and the project's Vue components, layouts and global layers
  as TSX. Nothing in the Slidev project is run. The converter is also a pure function,
  `convertSlidev` in the new `@kadal/deck/import` entry. Slidev's starter template converts with
  16 of its 17 slides needing nothing further.

  Also: `kadal-deck check` warns about Slidev syntax that compiles but does nothing (`<div v-click>`,
  `<v-clicks>`); a ` ```mermaid {alt: '…'} ` fence's `alt` labels the diagram for screen
  readers; ````md magic-move {lines: true}`numbers its lines;`<Click as="img">` (a void element)
  renders again; and the classic and seriph covers no longer pin a slide's own absolutely placed
  elements (`abs-br`) back into the flow when the cover has a picture.

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
