import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createClickRegistry } from "../core/clicks.ts";
import { SlideContext, type SlideContextValue } from "../react/context.ts";
import { Clicks, Li, Ol, Ul, stepsItsOwnItems } from "./Click.tsx";

describe("a list inside <Clicks> steps its own items", () => {
  // The regression this guards: `<Clicks>` wrapped the list AND the `li` mapping stepped each
  // item, so the list spent a click on itself and every bullet landed one step behind its note.
  test("what MDX actually passes — the mapped components", () => {
    expect(stepsItsOwnItems(createElement(Ul, {}))).toBe(true);
    expect(stepsItsOwnItems(createElement(Ol, {}))).toBe(true);
  });

  test("a list written as HTML in the slide", () => {
    expect(stepsItsOwnItems(createElement("ul", {}))).toBe(true);
    expect(stepsItsOwnItems(createElement("ol", {}))).toBe(true);
    expect(stepsItsOwnItems(createElement("div", { className: "deck-list wide" }))).toBe(true);
  });

  test("anything else is a child to wrap, one click each", () => {
    expect(stepsItsOwnItems(createElement("div", {}))).toBe(false);
    expect(stepsItsOwnItems(createElement("p", { className: "lead" }))).toBe(false);
    expect(stepsItsOwnItems("a bare string")).toBe(false);
    expect(stepsItsOwnItems(null)).toBe(false);
  });
});

describe("<Clicks every>", () => {
  // `every={2}` pairs items within their own list. The index used to come from a counter kept
  // across every list ever rendered, so a list after one with an odd number of items paired the
  // wrong ones.
  const render = (lists: string[][], every: number) => {
    const registry = createClickRegistry();
    const slide = { registry, click: 0, active: true, preview: false } as unknown as SlideContextValue;
    const html = renderToStaticMarkup(
      createElement(
        SlideContext.Provider,
        { value: slide },
        lists.map((items, k) =>
          createElement(
            Clicks,
            { every, key: k },
            createElement(Ul, {}, items.map((t) => createElement(Li, { key: t }, t))),
          ),
        ),
      ),
    );
    return [...html.matchAll(/data-click-at="(\d+)"[^>]*>([^<]+)</g)].map((m) => `${m[2]}@${m[1]}`);
  };

  test("pairs items within their own list, whatever came before", () => {
    expect(render([["a"], ["b", "c", "d", "e"]], 2)).toEqual(["a@1", "b@2", "c@2", "d@3", "e@3"]);
  });

  test("every={1} is one item per step", () => {
    expect(render([["a", "b", "c"]], 1)).toEqual(["a@1", "b@2", "c@3"]);
  });
});

describe("<Click as> a void element", () => {
  test('renders with no children at all (Slidev\'s <img v-click> imports as <Click as="img">)', async () => {
    const { Click } = await import("./Click.tsx");
    const slide = {
      registry: createClickRegistry(),
      click: 0,
      active: true,
      preview: false,
    } as unknown as SlideContextValue;
    const html = (el: ReturnType<typeof createElement>) =>
      renderToStaticMarkup(createElement(SlideContext.Provider, { value: slide }, el));
    expect(html(createElement(Click, { as: "img", src: "/a.png", alt: "" }))).toContain(
      '<img src="/a.png" alt="" class="deck-click',
    );
    expect(html(createElement(Click, null, "hi"))).toContain(">hi</div>");
  });
});
