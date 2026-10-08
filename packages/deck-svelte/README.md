# @kadal/deck-svelte

```sh
npm install @kadal/deck-svelte svelte @sveltejs/vite-plugin-svelte
```

Part of [Kadal Deck](https://deck.kadal.cc/docs/) — see the islands guide for how a framework component lands on a slide.

Svelte 5 components on a deck slide.

```ts
// vite.config.ts — deckSveltePlugin runs `enforce: "post"`, after svelte()
import { deckSveltePlugin } from "@kadal/deck-svelte";
import { svelte } from "@sveltejs/vite-plugin-svelte";

plugins: [deck({ entry: "deck.mdx" }), svelte(), deckSveltePlugin(), …];
```

```ts
// once, where the deck is created
registerLazyRenderer("svelte", () => import("@kadal/deck-svelte").then((m) => m.svelteRenderer));
```

```mdx
<Island load={() => import("./chart.svelte")} props={{ data }} client="slide" />
```

No `framework="svelte"`, no stamp written by hand. That is the plugin's whole job, and it exists
because of the next section.

## Why the build has to say so

Compile the same component twice:

```js
// dev
Probe[$.FILENAME] = "Probe.svelte";
export default function Probe($$anchor, $$props) { … }

// production
export default function Probe($$anchor, $$props) { … }
```

The only marker is a `Symbol` from `svelte/internal/client`, and it is gone from every build anyone
ships. A production Svelte component is a two-argument function, exactly like a React one — so this
renderer has **no `owns()`**, on purpose: the contract says a wrong yes is worse than no answer.

`deckSveltePlugin()` appends one line to each compiled `.svelte` module:

```js
try { Probe[Symbol.for("deck.renderer")] = "svelte"; } catch {}
```

`Symbol.for` is a global registry, so the plugin imports nothing from the engine and adds no edge to
the module graph. The line survives minification (the minifier renames the function and the stamp
follows it). If a future Svelte emits something the plugin does not recognise, it leaves the module
completely alone and the author falls back to `framework="svelte"` — worse, not broken.

## Props need a compiler

`mount(Component, { props })` hands the object over and the component reads `props.label` on every
render. Those reads are not tracked if the object is plain, so new props after mounting would change
nothing and the renderer's only recourse would be to remount — which costs the island whatever it
was holding.

Reactivity here is a compiler feature, so the bag cannot be written in a `.ts` file at all. Hence
`src/props.svelte.ts`, which the consumer's Svelte plugin compiles. Every compiler-target framework
will need its own version of that dance.

## Teardown is immediate

`unmount` plays outro transitions by default and resolves when they finish, which would leave the
old island in the DOM on top of the next slide. The renderer passes `{ outro: false }`.

## What it does not do

**No `ssr`.** `svelte/server` would pull a second compiler output into every deck with a Svelte
island, and the deck's print and export paths run a real browser. Same reasoning as Vue.

**No live cross-framework children.** `children` arrive as HTML and are passed as a `deckSlot` prop.
A React subtree cannot keep its state inside a Svelte component.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
