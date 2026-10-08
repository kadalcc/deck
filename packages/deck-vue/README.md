# @kadal/deck-vue

```sh
npm install @kadal/deck-vue vue
```

Part of [Kadal Deck](https://deck.kadal.cc/docs/) — see the islands guide for how a framework component lands on a slide.

Vue 3 components on a deck slide.

```ts
// once, where the deck is created
import { registerLazyRenderer } from "@kadal/deck";

registerLazyRenderer("vue", () => import("@kadal/deck-vue").then((m) => m.vueRenderer));
```

```mdx
<Island
  framework="vue"
  load={() => import("./chart.ts").then((m) => m.Chart)}
  props={{ data }}
  client="slide"
/>
```

Registered by name and loaded on arrival, neither Vue's runtime nor the component is in the deck's
first chunk — measured at 64 kB off the showcase deck's opening load, which matters once a deck can
reach for ten frameworks and uses one.

A component written as options is recognised on its own. A **functional** Vue component is a plain
function, indistinguishable from a React or Solid one, so it has to say so:

```ts
import { deckVue } from "@kadal/deck-vue";

export const Chart = deckVue((props) => h("div", props.label));
```

or `framework="vue"` on the island, which the example above already does.

## What it does with props

`createApp(Component, props)` takes its props once; handing it new ones later does nothing. So the
app is mounted around a `reactive` bag the render function reads, and new props mutate that bag in
place. The island is re-rendered, not rebuilt — a chart keeps its animation, a half-typed form keeps
what you typed. Without this the renderer would have to remount on every click of the slide.

## What it does not do

**No `ssr`.** It would pull `@vue/server-renderer` into every deck with a Vue island, and the deck's
print and export paths run a real browser, where islands hydrate like anywhere else. It goes in when
a surface appears that genuinely cannot run JS.

**No live cross-framework children.** `children` arrive as HTML and go in as the default slot's
markup. A React subtree cannot keep its state inside a Vue component, and pretending otherwise
produces bugs nobody can explain. Interactivity inside an island belongs to that island.

**No `.vue` files yet.** A single-file component needs `@vitejs/plugin-vue` in the deck's Vite
config; the renderer handles what that plugin produces (it looks for `__vccOpts` and `__file`), but
wiring the plugin into the deck's own Vite plugin is still to do.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
