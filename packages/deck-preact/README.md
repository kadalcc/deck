# @kadal/deck-preact

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. This package is part of building it: a live Preact component on a slide, so your demo runs in front of the room, not in a screenshot.
>
> [Take the tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Docs](https://deck.kadal.cc/docs/)

The Preact renderer for [Kadal Deck](https://deck.kadal.cc), presentations written in MDX: Preact code as an island on a slide, loaded only when its slide appears.

[Preact islands guide](https://deck.kadal.cc/docs/islands/preact/) · [Islands in any framework](https://deck.kadal.cc/docs/islands/) · [Docs](https://deck.kadal.cc/docs/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/deck-preact)

```sh
npm install @kadal/deck-preact preact
```

Preact components on a deck slide. The shortest renderer in the engine, and the smallest amount of
configuration of any of them.

```ts
// vite.config.ts — no Preact plugin. Just keep React's off these files.
import { deckPreactFiles } from "@kadal/deck-preact";

plugins: [react({ exclude: [...deckSolidFiles, ...deckPreactFiles] }), …];
```

```tsx
/** @jsxImportSource preact */
// chart.preact.tsx
export const Chart = deckPreact(({ data }: { data: number[] }) => <svg>…</svg>);
```

```mdx
<Island load={() => import("./chart.preact.tsx").then((m) => m.Chart)} props={{ data }} />
```

## Why there is no plugin

Solid needs its own Vite plugin because its JSX compiles to something structurally different.
Preact's compiles to the same shape as React's with a different import source — and the JSX
transform already supports naming that per file. So the pragma is the entire configuration, and the
deck's only job is to keep React's plugin from claiming the file first.

## Why `update` is one line

Vue needed a `reactive` bag, Svelte needed `$state` in a compiled companion module, Solid needed a
store — each because the component reads its props once and something has to make later reads
happen. A React-shaped framework has no such problem: **re-rendering is the update mechanism.**
Rendering into the same container diffs against what is already there, so component state and the
DOM survive, and `update` is simply `mount` again. `destroy` is `render(null, host)`, Preact's own
documented unmount.

Four frameworks, four completely different answers to one optional contract method. `update(props)`
saying nothing whatever about *how* has now been tested against every mechanism these frameworks
have, and has not had to change.

## No `owns()`

A Preact component is a plain function returning vnodes — identical in shape to React, Solid, and a
production-compiled Svelte component. A Preact component and a React component can be the same
source text. Only the stamp separates them.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
