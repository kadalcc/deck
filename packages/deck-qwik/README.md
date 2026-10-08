# @kadal/deck-qwik

```sh
npm install @kadal/deck-qwik @qwik.dev/core
```

Part of [Kadal Deck](https://deck.kadal.cc/docs/) — see the islands guide for how a framework component lands on a slide.

Qwik components on a deck slide, with **no Qwik Vite optimizer**.

```ts
// vite.config.ts
import { deckQwikDefine, deckQwikFiles } from "@kadal/deck-qwik";

plugins: [react({ exclude: [...deckSolidFiles, ...deckPreactFiles, ...deckQwikFiles] }), …],
define: { ...deckQwikDefine },
```

```tsx
/** @jsxImportSource @qwik.dev/core */
// chart.qwik.tsx — component$ is required; see below
export const Chart = deckQwik(component$(({ data }: { data: Signal<number[]> }) => <svg>…</svg>));
```

## Resumability does not apply here

Qwik exists to serialise a rendered application on the server and resume it in the browser with no
hydration — the work never happens twice because it is never redone. **A deck island has no
server-rendered HTML to resume.** It does not exist until the slide it lives on is the slide being
shown, and then it renders client-side from scratch. What is left of Qwik in that setting is a good
fine-grained reactive framework, and that is what this renderer drives. Someone who wants
resumability wants a Qwik app, not a slide.

So the optimizer is skipped, and it turns out not to be needed. Three things it would have done have
to be replaced, and finding each one took running the thing.

## 1. `component$()` is not optional

The obvious shortcut — an *inline* component, a plain function returning JSX, which needs no QRL
extraction — **renders exactly once and is then inert.** Measured on the showcase deck: its signals
changed and the DOM never moved, with no error and no warning. Wrapping the identical function in
`component$()` fixed it outright, optimizer or not: `component$` falls back to an inline QRL and
gives the component a host of its own to subscribe. An inline component has no such host, so nothing
is listening.

## 2. `deckQwikDefine`

The runtime references `__EXPERIMENTAL__.<flag>` in sixty-odd places, unguarded, and the optimizer
substitutes them textually. Without a `define`, the first `render()` throws
`ReferenceError: __EXPERIMENTAL__ is not defined` before anything reaches the slide. An empty object
is the correct value — every flag reads `undefined`, which is what the optimizer emits for a project
that enabled none of them.

## 3. `useTask$`, never `useVisibleTask$`

`useVisibleTask$` waits for a `qvisible` event that Qwik's loader script fires from an
IntersectionObserver, and the optimizer injects that loader. It is not injected here — and it would
not help if it were: the loader scans the document on readystate change, so it would never see an
island that mounts on slide four. Nothing is lost. An island exists only while its slide is up, so
the deck has already decided the component is visible by the time it renders.

## Props are signals, visibly

The other renderers hide their update mechanism from the component author. This one cannot: Qwik's
reactivity is signal propagation, so the renderer creates one signal per prop and the component
reads `props.step.value`. A leak, Qwik's own idiom, and the price of a framework whose propagation
is the point.

## Mount is asynchronous

Qwik's `render()` returns a promise of a cleanup function — the first renderer here whose mount is
not synchronous. The contract wants an `IslandMount` returned at once, which turns out to be exactly
right: the handle comes back immediately and the teardown it closes over waits for the render to
land. A presenter stepping past a slide faster than its island renders is handled by `destroy`
setting a flag the render completion checks.

## Version

Built against `@qwik.dev/core` **2.0.0-rc.0**, which is the Qwik that supports Vite 8. Qwik 1
(`@builder.io/qwik`) is stable but caps at Vite 6.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
