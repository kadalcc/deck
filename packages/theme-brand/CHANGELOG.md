# @kadal/theme-brand

## 0.10.0

### Patch Changes

- Updated dependencies [757a966]
  - @kadal/deck@0.10.0

## 0.9.2

### Patch Changes

- Updated dependencies [e3d511f]
- Updated dependencies [352fd42]
  - @kadal/deck@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [2ef85a1]
- Updated dependencies [dfac505]
  - @kadal/deck@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [abc3029]
- Updated dependencies [cc8fd19]
  - @kadal/deck@0.9.0

## 0.8.3

### Patch Changes

- Updated dependencies [0049919]
  - @kadal/deck@0.8.3

## 0.8.2

### Patch Changes

- Updated dependencies [f8a3c75]
- Updated dependencies [c5dd044]
  - @kadal/deck@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies [6b6adca]
  - @kadal/deck@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [3af5efa]
- Updated dependencies [ba29413]
- Updated dependencies [d51d260]
  - @kadal/deck@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [ddbbe62]
- Updated dependencies [fd65dde]
- Updated dependencies [223cc30]
  - @kadal/deck@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [4137757]
- Updated dependencies [fd6b6ea]
- Updated dependencies [31368f5]
  - @kadal/deck@0.7.0

## 0.6.5

### Patch Changes

- Updated dependencies [b35fa9f]
  - @kadal/deck@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [17ded02]
- Updated dependencies [17ded02]
  - @kadal/deck@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [531428e]
  - @kadal/deck@0.6.3

## 0.6.2

### Patch Changes

- Updated dependencies [8a2019c]
  - @kadal/deck@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [15ba20e]
  - @kadal/deck@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [f5aae0a]
- Updated dependencies [f5aae0a]
- Updated dependencies [f5aae0a]
  - @kadal/deck@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [a1603e7]
  - @kadal/deck@0.5.3

## 0.5.2

### Patch Changes

- 0dd7ae0: A slide with a background of its own now shows it on every layout. Themes that decorate a layout — brand's coloured cover, neon's sun and grid, crayon's shapes, bricks' and shibainu's blocks, swiss's section ground, ocean's waves, the black end slide — step aside on a slide that sets `background:`, instead of painting over it (a background on a brand cover rendered as nothing) or stacking a second set of art on it. A library background drawn for one scheme, like a chalkboard, also gives its slide that scheme unless the slide chooses its own, so a light deck's dark text never lands on a dark board.
- Updated dependencies [0dd7ae0]
  - @kadal/deck@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [d100cb4]
  - @kadal/deck@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [453585a]
- Updated dependencies [453585a]
- Updated dependencies [453585a]
  - @kadal/deck@0.5.0

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

- 9d6191f: Eight new themes of Kadal's own, each an npm package with its own layouts and components, light and dark, print-safe and checked for contrast: **ocean** (Kadal's sea, calm gradients, a wave cover and depth-gauge section openers), **folio** (an editorial serif for essays and keynotes: pull-quotes, a drop-cap essay column, chapter openers), **swiss** (a strict grid, huge grotesk headings and one signal colour, with a running header), **terminal** (mono-forward and dark first, code blocks as editor windows, a `<Terminal>` session component), **lecture** (numbered sections, a course footer, theorem / definition / proof blocks, citations and a references slide), **brand** (colours, logo and footer from `themeConfig` alone, with title, agenda and metrics layouts), **crayon** (pastel stickers and speech bubbles for workshops and classrooms) and **neon** (synthwave for launches, with a solid print fallback). Install one and name it: `npm i @kadal/theme-ocean`, `theme: ocean`. The hosted player bundles them all.

  Also: a theme picked from the theme menu now loads its own fonts, instead of wearing the deck theme's.

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
