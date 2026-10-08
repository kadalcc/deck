import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { Ol, Ul, stepsItsOwnItems } from "./Click.tsx";

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
