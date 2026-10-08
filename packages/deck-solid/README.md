# @kadal/deck-solid

```sh
npm install @kadal/deck-solid solid-js vite-plugin-solid
```

Part of [Kadal Deck](https://deck.kadal.cc/docs/) — see the islands guide for how a framework component lands on a slide.

Solid components on a deck slide.

```ts
// vite.config.ts — both plugins want .tsx, so each is told which files are whose
import { deckSolidFiles } from "@kadal/deck-solid";
import react from "@vitejs/plugin-react";
import solid from "vite-plugin-solid";

plugins: [react({ exclude: [...deckSolidFiles] }), solid({ include: [...deckSolidFiles] })];
```

```tsx
/** @jsxImportSource solid-js */
// chart.solid.tsx — the pragma is the type-level half of the same statement
export const Chart = deckSolid((props: { data: number[] }) => <svg>…</svg>);
```

```mdx
<Island load={() => import("./chart.solid.tsx").then((m) => m.Chart)} props={{ data }} />
```

## The .tsx collision

React's JSX transform and Solid's are mutually unintelligible, and both plugins claim `.tsx`. A deck
that uses both has to say which files belong to which — there is no detecting it, because the two
look identical until they are compiled. This engine's convention is `*.solid.tsx`, exported as
`deckSolidFiles` so a deck's Vite config imports one glob and hands it to both plugins, and the two
filters cannot drift apart.

The same collision exists at the type level: the deck's `tsconfig` points JSX at React, so a Solid
file opens with `/** @jsxImportSource solid-js */`. **Both are needed; neither implies the other.**
Astro avoids all of this by owning the file extension. A deck, whose slides are MDX and whose
components are the author's own, cannot.

## No owns(), and no plugin either

A Solid component is a plain function returning DOM. A React component is a plain function returning
elements. A production-compiled Svelte component is a plain function too. Nothing at runtime tells
them apart, so this renderer gives no answer — the contract's rule that a wrong yes is worse.

Unlike Svelte, there is no `deckSolidPlugin()`. `*.solid.tsx` is a naming convention rather than a
compiler output, so a plugin stamping it would be guessing from a filename. `deckSolid()` wraps the
component instead, which is one word at the definition and says exactly what is true.

## Props are getters, not values

A Solid component body runs **once**; what re-runs is the small reactive computation around each
value it read. Hand it a plain object and the island freezes at the props it was born with. The
renderer passes a `createStore` proxy, so `update` is a `reconcile` that touches only the keys that
actually changed — a component that read `step` re-runs only the expression that read `step`. This
is the cheapest island update of any framework here.

## No JSX in this package

Solid's JSX is a compiler that emits `createComponent` calls, and this package is plain TypeScript
nobody runs Babel over. It calls `createComponent` directly — the same thing, written out.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
