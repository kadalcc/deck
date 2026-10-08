import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerRenderer,
  resolveRenderer,
} from "@kadal/deck/renderers/contract";

import { PYODIDE_INDEX_URL, PYODIDE_VERSION, deckPython } from "./build.ts";

describe("a Python island is source text", () => {
  test("which is why the contract's component type is `unknown`", () => {
    // Every other component in the engine is a value the bundler produced. Python has no build
    // step: CPython compiled to WebAssembly reads source at runtime. So <Island> is handed a
    // string, and the engine never looking inside a component is what makes that legal.
    const island = deckPython("def deck_mount(host, props): ...");
    expect(island.source).toContain("deck_mount");
    expect(island[DECK_RENDERER]).toBe("python");
  });

  test("the interpreter is pinned, because one that moves breaks a talk on stage", () => {
    expect(PYODIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PYODIDE_INDEX_URL).toContain(PYODIDE_VERSION);
    expect(PYODIDE_INDEX_URL.startsWith("https://")).toBe(true);
  });
});

describe("recognition", () => {
  test("recognisable, like WASM, because the shape is the engine's own", async () => {
    const { pythonRenderer } = await import("./index.ts");
    clearRenderers();
    registerRenderer(pythonRenderer);
    expect(pythonRenderer.owns?.(deckPython("x = 1"))).toBe(true);
    expect(pythonRenderer.owns?.({ deckMount: () => {} })).toBe(false);
    expect(pythonRenderer.owns?.("def deck_mount(): ...")).toBe(false);
    expect(resolveRenderer(deckPython("x = 1")).how).toBe("marked");
    clearRenderers();
  });
});
