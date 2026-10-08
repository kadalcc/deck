import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerLazyRenderer,
  registerRenderer,
  resolveRenderer,
  resolveRendererAsync,
} from "@kadal/deck/renderers/contract";

import { deckSolid, deckSolidFiles, solidRenderer } from "./index.ts";

describe("recognising a Solid component", () => {
  test("it does not try, because nothing could", () => {
    // A Solid component is a plain function returning DOM. A React component is a plain function
    // returning elements. A production-compiled Svelte component is a plain function too. Three
    // frameworks, one runtime shape — so the contract's rule holds: no answer beats a wrong yes.
    expect(solidRenderer.owns).toBeUndefined();
  });

  test("the stamp is what resolves it, loaded or not", async () => {
    clearRenderers();
    registerRenderer(solidRenderer);
    const Counter = deckSolid((props: { label: string }) => props.label);
    expect(resolveRenderer(Counter).renderer?.name).toBe("solid");
    expect(resolveRenderer(Counter).how).toBe("marked");
    expect((Counter as { [DECK_RENDERER]?: string })[DECK_RENDERER]).toBe("solid");

    clearRenderers();
    registerLazyRenderer("solid", async () => solidRenderer);
    expect(resolveRenderer(Counter).how).toBe("deferred");
    expect((await resolveRendererAsync(Counter)).renderer?.name).toBe("solid");
    clearRenderers();
  });

  test("a React component is never mistaken for it, in either direction", () => {
    clearRenderers();
    registerRenderer(solidRenderer);
    // Unstamped, it resolves to nothing at all rather than to Solid.
    const Reactish = (props: { label: string }) => props.label;
    const resolved = resolveRenderer(Reactish);
    expect(resolved.renderer).toBeNull();
    expect(resolved.how).toBe("unknown");
    clearRenderers();
  });
});

describe("sharing .tsx with React", () => {
  test("the convention is a glob the deck gives to both plugins", () => {
    // Both plugins claim .tsx and their transforms are mutually unintelligible, so one has to be
    // narrowed. This is the engine's answer, and it is a constant rather than a doc comment so a
    // deck's vite.config can import it and the two filters cannot drift apart.
    expect(deckSolidFiles).toContain("**/*.solid.tsx");
    expect(deckSolidFiles).toContain("**/*.solid.jsx");
  });
});
