import { describe, expect, test } from "bun:test";

import { isEmbedded, keyAllowed, keyboardConditionOf, usesHash } from "./embedding.ts";

const key = (code: string) => ({ code }) as KeyboardEvent;

describe("embedded decks", () => {
  test("embedded comes from the config or ?embedded", () => {
    expect(isEmbedded({ embedded: false }, { embedded: false })).toBe(false);
    expect(isEmbedded({ embedded: true }, { embedded: false })).toBe(true);
    expect(isEmbedded({ embedded: false }, { embedded: true })).toBe(true);
  });

  test("an embedded deck takes keys only while focused, unless keyboardCondition says otherwise", () => {
    expect(keyboardConditionOf({ keyboardCondition: null }, false)).toBeNull();
    expect(keyboardConditionOf({ keyboardCondition: null }, true)).toBe("focused");
    const fn = () => true;
    expect(keyboardConditionOf({ keyboardCondition: fn }, true)).toBe(fn);
    expect(keyboardConditionOf({ keyboardCondition: "focused" }, false)).toBe("focused");
  });

  test("the hash is the page's unless the deck set it", () => {
    expect(usesHash({ hash: true }, false, false)).toBe(true);
    expect(usesHash({ hash: true }, true, false)).toBe(false);
    expect(usesHash({ hash: true }, true, true)).toBe(true);
    expect(usesHash({ hash: false }, false, true)).toBe(false);
  });
});

describe("keyboardCondition", () => {
  test("null lets every key through", () => {
    expect(keyAllowed(null, key("ArrowRight"), false)).toBe(true);
  });

  test('"focused" follows the focus', () => {
    expect(keyAllowed("focused", key("ArrowRight"), true)).toBe(true);
    expect(keyAllowed("focused", key("ArrowRight"), false)).toBe(false);
  });

  test("a function decides, true letting the key through; a throw keeps it out", () => {
    const onlyArrows = (e: KeyboardEvent) => e.code.startsWith("Arrow");
    expect(keyAllowed(onlyArrows, key("ArrowRight"), false)).toBe(true);
    expect(keyAllowed(onlyArrows, key("KeyB"), true)).toBe(false);
    expect(
      keyAllowed(
        () => {
          throw new Error("x");
        },
        key("KeyB"),
        true,
      ),
    ).toBe(false);
  });
});
