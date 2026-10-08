# @kadal/deck-fresh

Fresh islands on a deck slide.

```ts
registerLazyRenderer("fresh", () => import("@kadal/deck-fresh").then((m) => m.freshRenderer));
```

```tsx
/** @jsxImportSource preact */
// counter.fresh.tsx — a Fresh island, unchanged
import { useSignal } from "@preact/signals";
export const Counter = deckFresh(({ start = 0 }) => { … });
```

## This is the Preact renderer with a different name, and that is the finding

**Fresh's client runtime is Preact.** A Fresh island *is* a Preact component; `useSignal` is
`@preact/signals`; there is no Fresh client framework underneath to drive. What Fresh actually
contributes is a server — file-system routing, partials, server-rendered pages with islands
hydrated selectively, and a Deno-specific build. Every one of those is about **delivering a page**,
and a deck slide is not delivered: it is already in the browser by the time the island is asked for.

So there was nothing to implement, and writing a second Preact renderer to look busy would have been
worse than saying so.

What this package does provide is real: the **name**. A deck can register `"fresh"`, an island can
say `framework="fresh"`, and a Fresh island's source moves onto a slide unchanged — which is the
whole compatibility claim, and it holds. The showcase's Fresh island is written exactly as a Fresh
island is written, signals and all, and passes the same verifier as the other seven.

The practical difference from writing `framework="preact"` is documentation. An author who brought a
Fresh island should see Fresh in the deck, and should also see this page explaining which half of
Fresh came with it.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
