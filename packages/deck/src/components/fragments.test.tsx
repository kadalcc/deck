import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createClickRegistry } from "../core/clicks.ts";
import { SlideContext, type SlideContextValue } from "../react/context.ts";
import { Click, stepClasses } from "./Click.tsx";

const at = (click: number, el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(
      SlideContext.Provider,
      {
        value: {
          registry: createClickRegistry(),
          click,
          active: true,
          preview: false,
        } as unknown as SlideContextValue,
      },
      el,
    ),
  );

const classes = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ");

describe("reveal.js's fragment classes ride along", () => {
  test("visible with is-shown, current-fragment with is-current, fragment always", () => {
    const hidden = classes(at(0, createElement(Click, {}, "x")));
    expect(hidden).toContain("fragment");
    expect(hidden).toContain("is-hidden");
    expect(hidden).not.toContain("visible");
    const current = classes(at(1, createElement(Click, {}, "x")));
    expect(current).toEqual(
      expect.arrayContaining(["is-shown", "visible", "is-current", "current-fragment"]),
    );
    const past = classes(at(2, createElement(Click, {}, "x")));
    expect(past).toEqual(expect.arrayContaining(["visible", "is-past"]));
    expect(past).not.toContain("current-fragment");
  });

  test("any effect name becomes a class; custom drops the default fade", () => {
    expect(classes(at(0, createElement(Click, { effect: "wobble" }, "x")))).toContain(
      "effect-wobble",
    );
    // reveal writes `class="fragment custom blur"`: the importer keeps `custom blur` as classes.
    const imported = stepClasses(
      "fade-in",
      { shown: false, current: false, past: false },
      "custom blur",
    );
    expect(imported.split(" ")).toEqual(
      expect.arrayContaining(["effect-custom", "custom", "blur"]),
    );
    expect(imported).not.toContain("effect-fade-in");
    expect(stepClasses("custom", { shown: true, current: false, past: false })).toContain(
      "effect-custom",
    );
  });
});

describe("<Click autoSlide>", () => {
  test("writes data-autoslide for auto-slide to read on that step", () => {
    expect(at(0, createElement(Click, { autoSlide: 1500 }, "x"))).toContain(
      'data-autoslide="1500"',
    );
    expect(at(0, createElement(Click, {}, "x"))).not.toContain("data-autoslide");
  });
});
