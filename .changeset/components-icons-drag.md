---
"@kadal/deck": minor
---

Slidev's built-in components, and every icon.

- **Any Iconify icon**: `<Icon name="mdi:account" />`, or Slidev's tag form `<mdi-account />`, `<logos-vue class="text-3xl" />` (and UnoCSS's `<div class="i-carbon-logo-github" />`). Lucide names keep working. `kadal-deck dev` and `build` bundle the drawings from the deck's own `@iconify-json/<set>` (or `@iconify/json`) packages, so a built deck needs no network; the hosted player fetches them from the Iconify API once and keeps them, and shows a dashed box offline. `kadal-deck check` names a misspelt icon (with the nearest names) and the set to install.
- **Elements placed by hand**: `<Drag pos="x,y,w,h,rotation">` or `<Drag pos="name">` with `dragPos:` in the slide's frontmatter, and `<DragArrow pos="x,y,dx,dy" />`; Slidev's `v-drag`, `<v-drag>` and `<v-drag-arrow>` compile to them. In `kadal-deck dev`, double-click one to move, resize, turn and nudge it with the arrow keys; the position is saved into deck.mdx and nothing else in the file changes, without reloading the page.
- **`<Mark>`** draws every rough-notation type — underline, box, circle, highlight, strike-through, crossed-off and bracket — as a hand-drawn stroke on its click, with `strokeWidth`, `padding`, `iterations`, `multiline`, `brackets`, `duration`, `delay` and `opacity`. The wobble is the same on every screen and in the PDF.
- **`<Switch>`** with `<Case>`s shows one block per click (Slidev's v-switch), in one spot so nothing below jumps.
- **`<Video>`** follows the clicks: `at`, `pauseAt`, `steps` (play, pause, rewind or jump at a click), plus Slidev's `autoplay="once"`, `autoreset`, `timestamp`, `printPoster` and `printTimestamp`; inside a `<Click>` it starts when revealed.
- **`<LightOrDark>`, `<RenderWhen context>`, `<SlideCurrentNo>`, `<SlidesTotal>`, `<TitleRenderer>`** and **`<BlueSky>`** (a Bluesky post in the deck's colour scheme, with export posters).
