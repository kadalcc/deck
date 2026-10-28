import { describe, expect, test } from "bun:test";

import {
  actionFromConfig,
  createShortcutRegistry,
  keyboardMap,
  keyFromConfig,
} from "./shortcuts.ts";

const ev = (code: string) =>
  ({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }) as KeyboardEvent;

describe("the keyboard map in reveal.js's form", () => {
  test("numeric keyCodes are the physical keys they name", () => {
    expect(keyFromConfig("13")).toBe("Enter");
    expect(keyFromConfig("32")).toBe("Space");
    expect(keyFromConfig("27")).toBe("Escape");
    expect(keyFromConfig("37")).toBe("ArrowLeft");
    expect(keyFromConfig("40")).toBe("ArrowDown");
    expect(keyFromConfig("48")).toBe("Digit0");
    expect(keyFromConfig("57")).toBe("Digit9");
    expect(keyFromConfig("65")).toBe("KeyA");
    expect(keyFromConfig("90")).toBe("KeyZ");
    expect(keyFromConfig("191")).toBe("Slash");
    expect(keyFromConfig("116")).toBe("F5");
    expect(keyFromConfig("KeyQ")).toBe("KeyQ");
    expect(keyFromConfig("999")).toBeNull();
  });

  test("reveal's method names alias Kadal's actions; a dotted name is a command", () => {
    expect(actionFromConfig("toggleOverview")).toEqual({ action: "overview" });
    expect(actionFromConfig("togglePause")).toEqual({ action: "pause" });
    expect(actionFromConfig("toggleHelp")).toEqual({ action: "help" });
    expect(actionFromConfig("toggleAutoSlide")).toEqual({ action: "autoSlide" });
    expect(actionFromConfig("navigateNext")).toEqual({ action: "next" });
    expect(actionFromConfig("next")).toEqual({ action: "next" });
    expect(actionFromConfig("overview")).toEqual({ action: "overview" });
    expect(actionFromConfig("view.overview")).toEqual({ command: "view.overview" });
    // reveal-only, or nothing at all: no binding rather than a silent dead key
    expect(actionFromConfig("slide")).toBeNull();
    expect(actionFromConfig("toString")).toBeNull();
    expect(actionFromConfig("nonsense")).toBeNull();
  });

  test("reveal's own example map binds, unbinds and runs", () => {
    const calls: string[] = [];
    const reg = createShortcutRegistry();
    reg.configure({
      keyboard: {
        13: "next",
        32: null,
        79: "toggleOverview",
        66: "togglePause",
        27: function shout() {
          calls.push("escape");
        },
        86: "slide",
      },
    });
    expect(reg.match(ev("Enter"))?.action).toBe("next");
    expect(reg.match(ev("Space"))).toBeNull();
    expect(reg.match(ev("KeyO"))?.action).toBe("overview");
    expect(reg.match(ev("KeyB"))?.action).toBe("pause");
    const esc = reg.match(ev("Escape"))!;
    esc.run!(ev("Escape"));
    expect(calls).toEqual(["escape"]);
    expect(esc.description).toBe("shout()");
    // an unknown name leaves the key as it was (V: the camera)
    expect(reg.match(ev("KeyV"))?.action).toBe("camera");
  });

  test("Kadal's own form is unchanged", () => {
    expect(keyboardMap({ KeyQ: "overview", KeyD: null })).toEqual([
      { keys: ["KeyQ"], action: "overview", description: "Overview" },
      { keys: ["KeyD"], action: null, description: "" },
    ]);
  });
});
