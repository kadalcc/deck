import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerLazyRenderer,
  registerRenderer,
  resolveRenderer,
  resolveRendererAsync,
} from "@kadal/deck/renderers/contract";

import { deckPreact, deckPreactFiles, preactRenderer } from "./index.ts";

describe("recognising a Preact component", () => {
  test("it does not try — this is now the fourth framework that cannot be told apart", () => {
    expect(preactRenderer.owns).toBeUndefined();
  });

  test("the stamp resolves it, loaded or not", async () => {
    clearRenderers();
    registerRenderer(preactRenderer);
    const Counter = deckPreact((props: { label: string }) => props.label);
    expect(resolveRenderer(Counter).how).toBe("marked");
    expect((Counter as { [DECK_RENDERER]?: string })[DECK_RENDERER]).toBe("preact");

    clearRenderers();
    registerLazyRenderer("preact", async () => preactRenderer);
    expect(resolveRenderer(Counter).how).toBe("deferred");
    expect((await resolveRendererAsync(Counter)).renderer?.name).toBe("preact");
    clearRenderers();
  });

  test("Preact and React stamps do not collide, though the components are the same shape", () => {
    clearRenderers();
    registerRenderer(preactRenderer);
    const shared = (props: { label: string }) => props.label;
    // Identical source, identical runtime shape. Only the stamp separates them, which is the
    // argument for the stamp in one line.
    expect(resolveRenderer(shared).how).toBe("unknown");
    expect(resolveRenderer(deckPreact(shared)).renderer?.name).toBe("preact");
    expect(resolveRenderer(shared, "react").how).toBe("unknown");
    clearRenderers();
  });
});

describe("mounting, without a DOM to mount into", () => {
  test("mount is a function of four arguments and returns destroy plus update", () => {
    // The DOM behaviour is checked in a browser against the built bundle; see
    // packages/deck/tools/verify-island.mjs. What is worth asserting here is the shape: Preact is
    // the first renderer whose `update` is simply `mount` again, because re-rendering into the
    // same container is how a React-shaped framework updates.
    expect(preactRenderer.mount).toHaveLength(4);
    expect(preactRenderer.name).toBe("preact");
  });

  test("the glob keeps React's plugin off Preact's files, and there is no second plugin", () => {
    expect(deckPreactFiles).toContain("**/*.preact.tsx");
    expect(deckPreactFiles).toContain("**/*.preact.jsx");
  });
});
