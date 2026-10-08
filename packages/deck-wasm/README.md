# @kadal/deck-wasm

```sh
npm install @kadal/deck-wasm
```

Part of [Kadal Deck](https://deck.kadal.cc/docs/) — see the islands guide for how a framework component lands on a slide.

Islands whose component is not JavaScript.

```ts
registerLazyRenderer("wasm", () => import("@kadal/deck-wasm").then((m) => m.wasmRenderer));
```

```mdx
<Island framework="wasm" load={() => import("./chart.ts")} props={{ data }} />
```

## This renderer drives an agreement, not a framework

Every other renderer in the engine drives a framework. Once the component stops being JavaScript
there is nothing left to drive: **a WebAssembly module cannot reach the DOM**, because the host
object graph is not addressable from linear memory. So every WASM UI framework already ships a
JavaScript shim, and that shim is the only thing a renderer can hold. Leptos, Dioxus and Yew all
produce one through `wasm-bindgen`; Pyodide produces one of its own shape. What differs between them
is spelling — so the engine writes the spelling down and asks each language to meet it.

## The agreement

A module exports `deckMount`, and may export a `default` initialiser (which is exactly what
`wasm-bindgen --target web` generates). The renderer awaits the initialiser, then calls `deckMount`
with the element and the props, and gets back a handle:

```ts
export interface WasmIslandModule {
  default?: () => Promise<unknown>;
  deckMount(host: Element, props: IslandProps): WasmIslandHandle | Promise<WasmIslandHandle>;
}

export interface WasmIslandHandle {
  update?(props: IslandProps): void;
  destroy(): void;
  free?(): void;   // wasm-bindgen's, called after destroy when present
}
```

In Rust that is one attribute:

```rust
#[wasm_bindgen(js_name = deckMount)]
pub fn deck_mount(host: HtmlElement, props: JsValue) -> TickerHandle { … }
```

## Two things the agreement has to say out loud

**Props cross a wall.** Everywhere else `update` hands over a live JavaScript object; here it
crosses into another language's memory. So the agreement is **plain JSON-shaped values only** —
strings, numbers, booleans, null, and arrays and objects of those. A function or a DOM node would
have to be proxied, and every WASM language proxies differently. Unserialisable props are dropped
with a warning rather than thrown: one bad prop should not take the slide down. Saying this in the
contract is cheaper than discovering it in four languages.

**Mount is asynchronous.** Instantiating a module is. This is the second renderer with an async
mount, after Qwik, and the contract's synchronous `IslandMount` handles it the same way: the handle
comes back at once, and a presenter who steps past the slide before the module instantiates gets no
island built at all — the cost is one wasted instantiation, not a leaked timer.

## The one renderer that *can* recognise its own

Every other renderer refuses `owns()`: a Vue options object was the last thing identifiable
honestly. Here the shape is the engine's own, so a module exporting a function called `deckMount`
said so on purpose. Nothing arrives at that name by accident.

## Rust, through wasm-bindgen

`wasm-bindgen --target web` emits a module exporting `deckMount` — **the ABI as written**, with one
attribute on the Rust side and no adapter in between:

```rust
#[wasm_bindgen(js_name = deckMount)]
pub fn deck_mount(host: Element, props: JsValue) -> TickerHandle { … }
```

```tsx
<Island framework="wasm" load={() => import("./chart.js").then(wasmBindgenModule)} />
```

`wasmBindgenModule` is not a convenience. `<Island load={…}>` takes the `default` export of whatever
the thunk resolves to, because for Vue, Svelte, Solid and Preact the default export *is* the
component. **A wasm-bindgen module's `default` is its initialiser.** Without the adapter the island
received `__wbg_init`, called it, and then called the *raw* WebAssembly export `deckMount(a, b)`
with a DOM element and an object where it wanted two integers. The Rust ran, the island reported
itself mounted, no DOM appeared, and nothing threw. The engine could guess its way out of that and
the guess would be wrong eventually, so the author says it instead.

The showcase's island is Leptos 0.8 CSR: `examples/showcase/rust-ticker/`, built by `bun run rust`,
**107 kB of wasm** (down from 1,156 kB — `opt-level = "z"` plus LTO plus wasm-bindgen). Two things
in it are not what a Leptos tutorial shows, and both come from being driven from outside rather than
by a router: `ArcRwSignal` rather than `RwSignal`, because the arena kind belongs to a reactive
owner and these signals outlive the mount closure; and `Box<dyn Any>` for the unmount handle,
because `mount_to` returns `UnmountHandle<N::State>` and a `#[wasm_bindgen]` struct cannot carry a
generic. Dropping the box still runs the real `Drop`.

## `free()`, which is the same problem as Pyodide's

`wasm-bindgen` gives every exported struct a `free()`, because the JavaScript object is a pointer
into linear memory and the JavaScript collector does not know what it points at. Newer versions
register a `FinalizationRegistry`, but "eventually" on a deck means the island's bytes sit there for
the rest of the talk. The renderer calls `free()` after `destroy()` when the handle has one.

## The demo island

`examples/showcase/src/wasm-ticker.wat` is thirty lines of hand-written WebAssembly text, assembled to
**195 bytes** by `bun run wat` (using `wabt`, which is pure JavaScript, so it needs no system
toolchain). The module holds the state and does the arithmetic; the shim beside it owns the element
and the interval. That division is not a simplification for the demo — it is exactly what
`wasm-bindgen` generates, written out by hand so the seam is visible.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
