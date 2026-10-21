import { describe, expect, test } from "bun:test";

import { resolveConfig } from "./model.ts";
import {
  isKnownTransition,
  registerTransition,
  transitionAnimation,
  transitionNames,
} from "./transitions.ts";

describe("custom transitions", () => {
  const deck = {
    flip: {
      in: "flip-in",
      out: "flip-out",
      back: { in: "flip-in-back" },
      up: { out: "flip-up-out" },
    },
  };

  test("a deck's transitions name keyframes per direction, falling back to forward", () => {
    expect(transitionAnimation("flip", "in", "forward", deck)).toBe("flip-in");
    expect(transitionAnimation("flip", "in", "back", deck)).toBe("flip-in-back");
    expect(transitionAnimation("flip", "out", "back", deck)).toBe("flip-out");
    expect(transitionAnimation("flip", "out", "up", deck)).toBe("flip-up-out");
    expect(transitionAnimation("flip", "in", "up", deck)).toBe("flip-in-back");
    expect(transitionAnimation("flip", "in", "down", deck)).toBe("flip-in");
    // Built-ins and unknown names are the stylesheet's business.
    expect(transitionAnimation("slide", "in", "forward", deck)).toBeNull();
    expect(transitionAnimation("nope", "in", "forward", deck)).toBeNull();
  });

  test("keyframe names are checked: no CSS can be injected through them", () => {
    expect(transitionAnimation("x", "in", "forward", { x: { in: "a; color: red" } })).toBeNull();
  });

  test("registerTransition makes a name known everywhere; the deck's own wins", () => {
    registerTransition("warp", { in: "warp-in", out: "warp-out" });
    expect(isKnownTransition("warp")).toBe(true);
    expect(transitionNames()).toContain("warp");
    expect(transitionAnimation("warp", "in", "forward")).toBe("warp-in");
    expect(transitionAnimation("warp", "in", "forward", { warp: { in: "mine" } })).toBe("mine");
    expect(isKnownTransition("fade")).toBe(true);
    expect(isKnownTransition("never-defined")).toBe(false);
  });

  test("transitions from a theme's config and the headmatter merge", () => {
    const config = resolveConfig(
      { transitions: { flip: { in: "a", out: "b" } } },
      { transitions: { spin: { in: "c" } } },
    );
    expect(Object.keys(config.transitions).sort()).toEqual(["flip", "spin"]);
  });
});
