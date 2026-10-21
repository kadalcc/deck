---
"@kadal/deck": minor
"@kadal/theme-classic": patch
"@kadal/theme-seriph": patch
---

Import a Slidev deck in one command: `kadal-deck import slidev <slides.md | folder>` writes a new
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
`<v-clicks>`); a ```` ```mermaid {alt: '…'} ```` fence's `alt` labels the diagram for screen
readers; ````md magic-move {lines: true}` numbers its lines; `<Click as="img">` (a void element)
renders again; and the classic and seriph covers no longer pin a slide's own absolutely placed
elements (`abs-br`) back into the flow when the cover has a picture.
