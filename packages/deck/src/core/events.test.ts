import { describe, expect, test } from "bun:test";

import { stateChange, stateClasses, stateNames } from "./events.ts";

describe("slide state", () => {
  test("names split on spaces, once each", () => {
    expect(stateNames(["make-it-pop", "dim  quiet", "dim"])).toEqual([
      "make-it-pop",
      "dim",
      "quiet",
    ]);
    expect(stateNames(undefined)).toEqual([]);
  });

  test("each name goes on the root bare and as state-<name>", () => {
    expect(stateClasses(["pop"])).toEqual(["pop", "state-pop"]);
  });

  test("a move says what it turned on and off", () => {
    expect(stateChange(["a", "b"], ["b", "c"])).toEqual({ entered: ["c"], left: ["a"] });
    expect(stateChange([], [])).toEqual({ entered: [], left: [] });
  });
});
