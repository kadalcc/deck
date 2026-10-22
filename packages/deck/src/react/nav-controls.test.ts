import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClickCount, useClicks } from "../components/ClickCount.tsx";
import { createClickRegistry } from "../core/clicks.ts";
import { createStore } from "../core/store.ts";
import { LAYER_NAMES, type LayerProps } from "../theming/contract.ts";
import { mergeLayers } from "../theming/merge.ts";
import { deckPackageSet, layerFiles, packagesCode } from "../vite/packages.ts";
import { DeckContext, type DeckRuntime, SlideContext, type SlideContextValue } from "./context.ts";
import { NavControlsLayer } from "./Layers.tsx";

/** Just enough of a running deck for layers and the click count. */
function fakeDeck(over: Partial<DeckRuntime> = {}): DeckRuntime {
  const slide = { index: 0, id: "a", title: "A", frontmatter: {} };
  return {
    columns: [{ h: 0, slides: [slide, { ...slide, index: 1 }] }],
    options: new Map([["0,1", { layout: "center" }]]),
    nav: createStore({ h: 0, v: 1, click: 2, totals: { "0,0": 3, "0,1": 4 }, overview: false }),
    mode: "play",
    projector: false,
    layers: mergeLayers([], [], null),
    ...over,
  } as unknown as DeckRuntime;
}

const html = (deck: DeckRuntime, node: ReactNode, slide?: Partial<SlideContextValue>) =>
  renderToStaticMarkup(
    createElement(
      DeckContext.Provider,
      { value: deck },
      slide
        ? createElement(
            SlideContext.Provider,
            {
              value: {
                h: 0,
                v: 0,
                click: 1,
                registry: createClickRegistry(),
                ...slide,
              } as SlideContextValue,
            },
            node,
          )
        : node,
    ),
  );

describe("the custom-nav-controls layer", () => {
  const Next = (p: LayerProps) =>
    createElement("button", { type: "button", "data-view": p.view }, `next ${p.page}/${p.total}`);

  test("is one of the layers, the topmost", () => {
    expect(LAYER_NAMES[LAYER_NAMES.length - 1]).toBe("custom-nav-controls");
  });

  test("draws its components as a toolbar, with the current slide's props", () => {
    const deck = fakeDeck({ layers: mergeLayers([{ "custom-nav-controls": Next }], [], null) });
    const out = html(deck, createElement(NavControlsLayer));
    expect(out).toBe(
      '<div class="deck-nav-custom is-stage" role="toolbar" aria-label="Deck controls"><div class="deck-layer deck-layer-custom-nav-controls" data-layer="custom-nav-controls"><button type="button" data-view="play">next 2/2</button></div></div>',
    );
    expect(html(deck, createElement(NavControlsLayer, { placement: "toolbar" }))).toContain(
      'class="deck-nav-custom is-toolbar"',
    );
  });

  test("themes and addons add theirs, under the deck's; nothing drawn without any", () => {
    const Theme = () => createElement("i", null, "t");
    const Addon = () => createElement("i", null, "a");
    const layers = mergeLayers(
      [{ "custom-nav-controls": Next }],
      [{ layers: { "custom-nav-controls": Addon } }],
      { layers: { "custom-nav-controls": Theme } },
    );
    expect(layers["custom-nav-controls"]).toEqual([Theme, Addon, Next]);
    expect(html(fakeDeck(), createElement(NavControlsLayer))).toBe("");
    // a projector takes no input: no buttons there
    expect(html(fakeDeck({ layers, projector: true }), createElement(NavControlsLayer))).toBe("");
  });

  test("custom-nav-controls.tsx beside deck.mdx (or in src/) is found by the Vite plugin", () => {
    const dir = mkdtempSync(join(tmpdir(), "kadal-nav-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "custom-nav-controls.tsx"), "export default () => null;\n");
      expect(layerFiles(dir)).toEqual({
        "custom-nav-controls": join(dir, "src", "custom-nav-controls.tsx"),
      });
      const code = packagesCode(deckPackageSet({}, dir));
      // a default export, or the named one: CustomNavControls
      expect(code.value).toMatch(
        /"custom-nav-controls": __kadal_pkg_\d+\.default \?\? __kadal_pkg_\d+\["CustomNavControls"\]/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the click count", () => {
  const Probe = () => {
    const c = useClicks();
    return createElement("i", null, `${c.click}/${c.total}@${c.h},${c.v}`);
  };

  test("on a slide: that slide's click and total", () => {
    const deck = fakeDeck();
    expect(html(deck, createElement(Probe), { click: 1 })).toBe("<i>1/3@0,0</i>");
    expect(html(deck, createElement(ClickCount), { click: 1 })).toBe(
      '<span class="deck-click-count" data-click="1" data-clicks="3">1</span>',
    );
    expect(html(deck, createElement(ClickCount, { total: true }), { click: 1 })).toContain(">3<");
    expect(html(deck, createElement(ClickCount, { offset: 1 }), { click: 1 })).toContain(">2<");
  });

  test("outside a slide: the current slide's, from the navigation", () => {
    expect(html(fakeDeck(), createElement(Probe))).toBe("<i>2/4@0,1</i>");
  });

  test("when: the children only while it holds; a function child gets the count", () => {
    const deck = fakeDeck();
    const when = (n: number) =>
      html(deck, createElement(ClickCount, { when: (c: number) => c >= 2 }, "late"), { click: n });
    expect(when(1)).toBe("");
    expect(when(2)).toBe("late");
    expect(
      html(
        deck,
        createElement(ClickCount, null, (c: number, t: number) => `${c} of ${t}`),
        {
          click: 2,
        },
      ),
    ).toBe("2 of 3");
  });

  test("reading the count registers no click step", () => {
    const registry = createClickRegistry();
    html(fakeDeck(), createElement(ClickCount), { registry });
    expect(registry.total()).toBe(0);
  });
});
