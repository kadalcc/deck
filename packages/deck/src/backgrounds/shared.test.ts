import { describe, expect, test } from "bun:test";

import { frameDelta } from "./shared.ts";

describe("frameDelta", () => {
  test("is the seconds between frames", () => {
    expect(frameDelta(1016, 1000)).toBeCloseTo(0.016);
  });
  test("never runs backwards: a frame stamped before the loop began is a zero step", () => {
    expect(frameDelta(995, 1000)).toBe(0);
  });
  test("never jumps: a tab coming back steps a twentieth of a second", () => {
    expect(frameDelta(9000, 1000)).toBe(0.05);
  });
});
