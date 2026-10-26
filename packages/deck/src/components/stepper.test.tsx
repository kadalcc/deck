import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createClickRegistry } from "../core/clicks.ts";
import { SlideContext, type SlideContextValue } from "../react/context.ts";
import { Stepper } from "./Stepper.tsx";

const STEPS = ["Build", "Rehearse", "Present", "Own the room"];

const inSlide = (
  click: number,
  el: ReturnType<typeof createElement>,
  rails?: SlideContextValue["rails"],
) =>
  renderToStaticMarkup(
    createElement(
      SlideContext.Provider,
      {
        value: {
          registry: createClickRegistry(),
          click,
          active: true,
          preview: false,
          rails,
        } as unknown as SlideContextValue,
      },
      el,
    ),
  );

/** Each step's state, in order: "done", "current" or "next". */
const states = (html: string) =>
  [...html.matchAll(/deck-stepper-step is-(done|current|next)/g)].map((m) => m[1]);

describe("<Stepper>", () => {
  test("current marks the steps before it done and after it next", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { steps: STEPS, current: 2 }));
    expect(states(html)).toEqual(["done", "current", "next", "next"]);
    expect(html).toContain('aria-current="step"');
    // One number drives the cells and the bar: nothing else changes with the step.
    expect(html).toContain("--stepper-n:4");
    expect(html).toContain("--stepper-at:2");
  });

  test("every state has the same markup, so no step is a different size", () => {
    const shape = (html: string) =>
      html.replace(/is-(done|current|next)/g, "").replace(/ aria-current="step"/g, "");
    const a = renderToStaticMarkup(createElement(Stepper, { steps: STEPS, current: 1 }));
    const b = renderToStaticMarkup(createElement(Stepper, { steps: STEPS, current: 4 }));
    expect(shape(a).replace(/--stepper-at:\d/, "")).toBe(shape(b).replace(/--stepper-at:\d/, ""));
  });

  test("follow walks the steps with the slide's clicks, step 1 before them", () => {
    const at = (click: number) =>
      states(inSlide(click, createElement(Stepper, { steps: STEPS, follow: true })));
    expect(at(0)).toEqual(["current", "next", "next", "next"]);
    expect(at(1)).toEqual(["done", "current", "next", "next"]);
    expect(at(3)).toEqual(["done", "done", "done", "current"]);
    expect(at(9)).toEqual(["done", "done", "done", "current"]);
  });

  test("on a rail it waits for the rail in a slide, and flows inline outside one", () => {
    const placed = createElement(Stepper, { steps: STEPS, current: 1, place: "top" as const });
    expect(inSlide(0, placed, { top: null, bottom: null })).toBe("");
    expect(renderToStaticMarkup(placed)).toContain("on-rail is-top");
  });
});
