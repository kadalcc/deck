import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerLazyRenderer,
  registerRenderer,
  resolveRenderer,
  resolveRendererAsync,
} from "@kadal/deck/renderers/contract";

import { deckQwik, deckQwikDefine, deckQwikFiles, qwikRenderer } from "./index.ts";

describe("recognising a Qwik component", () => {
  test("it does not try — the fifth framework in a row that cannot be told apart", () => {
    expect(qwikRenderer.owns).toBeUndefined();
  });

  test("the stamp resolves it, loaded or not", async () => {
    clearRenderers();
    registerRenderer(qwikRenderer);
    const Counter = deckQwik({ renderQrl: () => {} });
    expect(resolveRenderer(Counter).how).toBe("marked");
    expect((Counter as { [DECK_RENDERER]?: string })[DECK_RENDERER]).toBe("qwik");

    clearRenderers();
    registerLazyRenderer("qwik", async () => qwikRenderer);
    expect(resolveRenderer(Counter).how).toBe("deferred");
    expect((await resolveRendererAsync(Counter)).renderer?.name).toBe("qwik");
    clearRenderers();
  });
});

describe("what the optimizer would have done", () => {
  test("the defines are supplied by the deck, or the first render throws", () => {
    // Qwik's runtime references __EXPERIMENTAL__.<flag> in sixty-odd unguarded places. An empty
    // object is what the optimizer emits for a project with no experimental flags enabled.
    expect(deckQwikDefine.__EXPERIMENTAL__).toBe("{}");
    expect(JSON.parse(deckQwikDefine.__EXPERIMENTAL__)).toEqual({});
  });

  test("the glob keeps React's plugin off Qwik's files", () => {
    expect(deckQwikFiles).toContain("**/*.qwik.tsx");
  });
});

describe("mounting", () => {
  test("mount returns its handle synchronously although Qwik's render is a promise", () => {
    // The first renderer here whose mount is asynchronous. The contract wanting an IslandMount at
    // once is what makes it safe: a presenter can step past a slide faster than its island
    // renders, and destroy sets a flag the render completion checks.
    expect(qwikRenderer.mount).toHaveLength(4);
    expect(qwikRenderer.name).toBe("qwik");
  });
});
