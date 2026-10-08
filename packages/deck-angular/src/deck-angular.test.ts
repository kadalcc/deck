import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerLazyRenderer,
  registerRenderer,
  resolveRenderer,
  resolveRendererAsync,
} from "@kadal/deck/renderers/contract";

import { deckAngularFiles, isDeckAngularFile } from "./build.ts";

// NOTE: `./index.ts` is not imported here. It loads @angular/compiler and @angular/platform-browser
// at module scope, which is a browser runtime; the behaviour that matters is checked in a browser
// against the built bundle by packages/deck/tools/verify-island.mjs. What is worth asserting in a
// unit test is the build surface — the half a Vite config touches, which must stay framework-free.

describe("the build surface, which a Vite config imports", () => {
  test("names the deck's Angular files and nothing else", () => {
    expect(deckAngularFiles).toContain("**/*.angular.ts");
    expect(isDeckAngularFile("", "/examples/showcase/src/chart.angular.ts")).toBe(true);
    expect(isDeckAngularFile("", "/examples/showcase/src/chart.angular.ts?used")).toBe(true);
    expect(isDeckAngularFile("", "/examples/showcase/src/main.tsx")).toBe(false);
    expect(isDeckAngularFile("", "/examples/showcase/src/ticker.svelte")).toBe(false);
  });

  test("it can be imported in Node without pulling Angular in", () => {
    // This is the whole reason build.ts exists. A Vite config is evaluated by Node before any
    // bundling, so a build helper that sits next to the renderer drags the framework into that
    // moment — and Angular, published partially compiled, fails outright there. This test passing
    // at all is the assertion: the import above did not reach @angular/core.
    expect(typeof isDeckAngularFile).toBe("function");
  });
});

describe("the stamp", () => {
  test("resolves an Angular component, loaded or not", async () => {
    const { deckAngular } = await import("./build.ts");
    clearRenderers();
    const fake = { name: "angular", mount: () => ({ destroy() {} }) };
    registerRenderer(fake);
    const Chart = deckAngular(class Chart {});
    expect((Chart as { [DECK_RENDERER]?: string })[DECK_RENDERER]).toBe("angular");
    expect(resolveRenderer(Chart).how).toBe("marked");

    clearRenderers();
    registerLazyRenderer("angular", async () => fake);
    expect(resolveRenderer(Chart).how).toBe("deferred");
    expect((await resolveRendererAsync(Chart)).renderer?.name).toBe("angular");
    clearRenderers();
  });
});
