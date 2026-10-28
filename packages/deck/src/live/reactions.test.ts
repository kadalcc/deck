import { describe, expect, test } from "bun:test";

import { EMPTY_ROOM } from "./protocol.ts";
import { MAX_FLOATS, reactionFloats } from "./reactions.ts";

describe("reaction floats", () => {
  test("each tap floats one emoji, however many came before it", () => {
    const seen: Record<string, number> = {};
    const floats = Array.from({ length: 10 }, (_, i) =>
      reactionFloats(seen, { type: "react", emoji: "🔥", n: i + 1 }),
    );
    // It used to float min(6, n): six for every tap from the sixth on.
    expect(floats).toEqual(Array(10).fill(1));
  });
  test("a late joiner floats the step from the welcome's totals, not the total", () => {
    const seen: Record<string, number> = {};
    reactionFloats(seen, {
      type: "welcome",
      role: "viewer",
      you: "v1",
      state: { ...EMPTY_ROOM, reactions: { "🔥": 40 } },
    });
    expect(reactionFloats(seen, { type: "react", emoji: "🔥", n: 41 })).toBe(1);
    expect(reactionFloats(seen, { type: "react", emoji: "👏", n: 1 })).toBe(1);
  });
  test("missed messages float the gap, capped; a tally or a reset only moves the count", () => {
    const seen: Record<string, number> = { "🔥": 2 };
    expect(reactionFloats(seen, { type: "react", emoji: "🔥", n: 5 })).toBe(3);
    expect(reactionFloats(seen, { type: "react", emoji: "🔥", n: 50 })).toBe(MAX_FLOATS);
    expect(reactionFloats(seen, { type: "state", patch: { reactions: { "🔥": 60 } } })).toBe(0);
    expect(reactionFloats(seen, { type: "react", emoji: "🔥", n: 61 })).toBe(1);
    // A new session starts the totals again; its first tap is still one.
    reactionFloats(seen, { type: "state", patch: { reactions: {} } });
    expect(reactionFloats(seen, { type: "react", emoji: "🔥", n: 1 })).toBe(1);
    // A message out of order still floats the one reaction it stands for.
    expect(reactionFloats(seen, { type: "react", emoji: "🔥", n: 1 })).toBe(1);
  });
});
