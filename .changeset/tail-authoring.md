---
"@kadal/deck": patch
---

Slidev's authoring leftovers, natively:

- **Comark (formerly MDC) syntax**, opt-in with `comark: true` (or Slidev's `mdc: true`), in both the Vite plugin and the in-browser compiler: `:badge[New]{tone="good"}` inline components, `[text]{.class style="…"}` spans, `{…}` after bold, code, links and images, and `::name{props}` … `::` blocks with YAML props, `#slot` sections that arrive as props, and nesting by colons. `::right::` slot markers, `::code-group` and MDX `{expressions}` keep their meaning; `kadal-deck check` checks Comark components like JSX ones, and `kadal-deck import slidev` now carries `comark: true` over instead of reporting it.
- **`custom-nav-controls` layer**: `custom-nav-controls.tsx` beside deck.mdx (or a theme's or addon's `layers`) adds buttons beside the controls in play and to the presenter's toolbar. Slidev's `custom-nav-controls.vue` imports to it.
- **`<ClickCount>` and `useClicks()`**: the slide's click count (Slidev's `$clicks`), with `when={(c) => c > 2}` for click-dependent content. The importer maps `{{ $clicks }}`, `$clicksContext.current/total` and `v-if="$clicks > n"` chains to it.
- **Dragged positions sync live**: a `<Drag>` or `<DragArrow>` moved under `kadal-deck dev` follows in every other open window (presenter, second screen, projector) as it moves, with no reload.
- **Pages of the deck's own**: `routes.tsx` beside deck.mdx (or `setup/routes.ts`), `<Deck routes>`, a package's `routes` or `api.addRoute()` add pages at `<base><path>` inside the deck's providers, with `:params`; the build copies index.html to each plain path for static hosts.
