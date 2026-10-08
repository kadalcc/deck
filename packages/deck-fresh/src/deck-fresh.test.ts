import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerRenderer,
  resolveRenderer,
} from "@kadal/deck/renderers/contract";
import { preactRenderer } from "@kadal/deck-preact";

import { deckFresh, deckFreshFiles, freshRenderer } from "./index.ts";

describe("Fresh is Preact under another name", () => {
  test("it says so, rather than reimplementing it", () => {
    // Fresh's client runtime is Preact: an island is a Preact component and useSignal is
    // @preact/signals. What Fresh adds — file-system routing, partials, server-rendered pages,
    // the Deno build — is all about delivering a page, and a slide is already in the browser.
    expect(freshRenderer.mount).toBe(preactRenderer.mount);
    expect(freshRenderer.name).toBe("fresh");
    expect(preactRenderer.name).toBe("preact");
  });

  test("both names resolve, and to their own renderer", () => {
    clearRenderers();
    registerRenderer(preactRenderer);
    registerRenderer(freshRenderer);
    const Island = deckFresh(() => null);
    expect((Island as { [DECK_RENDERER]?: string })[DECK_RENDERER]).toBe("fresh");
    expect(resolveRenderer(Island).renderer?.name).toBe("fresh");
    expect(resolveRenderer({}, "preact").renderer?.name).toBe("preact");
    clearRenderers();
  });

  test("the glob keeps React's plugin off Fresh's files", () => {
    expect(deckFreshFiles).toContain("**/*.fresh.tsx");
  });
});
