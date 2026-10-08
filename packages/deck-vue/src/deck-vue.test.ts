import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  resolveRenderer,
  registerRenderer,
  clearRenderers,
} from "@kadal/deck/renderers/contract";
import { defineComponent, h } from "vue";

import { deckVue, vueRenderer } from "./index.ts";

describe("recognising a Vue component", () => {
  test("claims options objects — written by hand or left by the compiler", () => {
    expect(vueRenderer.owns?.(defineComponent({ render: () => h("p") }))).toBe(true);
    expect(vueRenderer.owns?.({ setup: () => () => h("p") })).toBe(true);
    expect(vueRenderer.owns?.({ template: "<p/>" })).toBe(true);
    expect(vueRenderer.owns?.({ __vccOpts: {} })).toBe(true);
    expect(vueRenderer.owns?.({ __file: "Counter.vue" })).toBe(true);
  });

  test("refuses every function, including Vue's own functional components", () => {
    // The whole reason the contract has a stamp: this is a legitimate Vue component, and it is
    // indistinguishable from a React or Solid one. Claiming it would take theirs away from them.
    const functional = (props: { label: string }) => h("p", props.label);
    expect(vueRenderer.owns?.(functional)).toBe(false);
    expect(vueRenderer.owns?.(() => null)).toBe(false);
    expect(vueRenderer.owns?.(class {})).toBe(false);
  });

  test("refuses things that are not components at all", () => {
    expect(vueRenderer.owns?.(null)).toBe(false);
    expect(vueRenderer.owns?.("my-chart")).toBe(false);
    expect(vueRenderer.owns?.({})).toBe(false);
    expect(vueRenderer.owns?.(42)).toBe(false);
  });
});

describe("resolution", () => {
  test("a stamped functional component resolves to vue, which owns() could never do", () => {
    clearRenderers();
    registerRenderer(vueRenderer);
    const functional = deckVue((props: { label: string }) => h("p", props.label));
    expect(vueRenderer.owns?.(functional)).toBe(false);
    const resolved = resolveRenderer(functional);
    expect(resolved.renderer?.name).toBe("vue");
    expect(resolved.how).toBe("marked");
    clearRenderers();
  });

  test("the stamp is the symbol the engine looks for", () => {
    const marked = deckVue({ render: () => h("p") }) as Record<symbol, unknown>;
    expect(marked[DECK_RENDERER]).toBe("vue");
  });

  test("an options object still resolves with no stamp at all", () => {
    clearRenderers();
    registerRenderer(vueRenderer);
    const resolved = resolveRenderer(defineComponent({ render: () => h("p") }));
    expect(resolved.renderer?.name).toBe("vue");
    expect(resolved.how).toBe("owned");
    clearRenderers();
  });
});
