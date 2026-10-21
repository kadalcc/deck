import { describe, expect, test } from "bun:test";

import {
  formatArrowPos,
  formatDragPos,
  parseArrowPos,
  parseDragPos,
  resizeBox,
  rotateTowards,
} from "./drag-geometry.ts";
import { MARK_TYPES, markPadding, markShapes, normaliseMarkType } from "./mark-geometry.ts";
import { switchRanges } from "./Switch.tsx";
import { playingAt, seekCrossing } from "./Video.tsx";

describe("drag positions", () => {
  test("read and written Slidev's way", () => {
    expect(parseDragPos("10,20,300,200")).toEqual({ x: 10, y: 20, w: 300, h: 200, r: 0 });
    expect(parseDragPos("10, 20, 300, _, 15")).toEqual({ x: 10, y: 20, w: 300, h: null, r: 15 });
    expect(parseDragPos("1,2,3,NaN")?.h).toBeNull();
    expect(parseDragPos("logo")).toBeNull();
    expect(parseDragPos("a,b,c")).toBeNull();
    expect(formatDragPos({ x: 10.4, y: 20.6, w: 300, h: null, r: 0 })).toBe("10,21,300,_");
    expect(formatDragPos({ x: 0, y: 0, w: 1, h: 1, r: 350 })).toBe("0,0,1,1,-10");
    expect(parseArrowPos("100,100,300,-50")).toEqual({ x1: 100, y1: 100, x2: 400, y2: 50 });
    expect(formatArrowPos({ x1: 100, y1: 100, x2: 400, y2: 50 })).toBe("100,100,300,-50");
  });

  const box = { x: 100, y: 100, w: 200, h: 100, r: 0 };
  test("a corner resize keeps the opposite corner where it was", () => {
    const out = resizeBox(box, 1, 1, { x: 400, y: 260 });
    expect(out).toEqual({ x: 100, y: 100, w: 300, h: 160, r: 0 });
    const nw = resizeBox(box, -1, -1, { x: 50, y: 80 });
    expect(nw.x + nw.w).toBeCloseTo(300);
    expect(nw.y + nw.h).toBeCloseTo(200);
  });

  test("an edge resize changes one side; Shift keeps the proportions", () => {
    expect(resizeBox(box, 1, 0, { x: 500, y: 9999 })).toEqual({
      x: 100,
      y: 100,
      w: 400,
      h: 100,
      r: 0,
    });
    const kept = resizeBox(box, 1, 1, { x: 500, y: 150 }, { ratio: true });
    expect(kept.w / kept.h).toBeCloseTo(2);
  });

  test("on a turned box, the fixed corner stays put on the stage", () => {
    const turned = { ...box, r: 90 };
    // Turned 90° about its centre (200, 150): the local top-left corner sits at (250, 50).
    const out = resizeBox(turned, 1, 1, { x: 100, y: 400 });
    const cx = out.x + out.w / 2;
    const cy = out.y + out.h / 2;
    const rad = (90 * Math.PI) / 180;
    const ax = cx + (-out.w / 2) * Math.cos(rad) - (-out.h / 2) * Math.sin(rad);
    const ay = cy + (-out.w / 2) * Math.sin(rad) + (-out.h / 2) * Math.cos(rad);
    expect(ax).toBeCloseTo(250);
    expect(ay).toBeCloseTo(50);
  });

  test("turning points the top at the pointer, snapping to right angles", () => {
    expect(rotateTowards(box, { x: 400, y: 150 })).toBe(90);
    expect(rotateTowards(box, { x: 202, y: 0 })).toBe(0);
    expect(rotateTowards(box, { x: 300, y: 60 }, true) % 15).toBe(0);
  });
});

describe("<Mark> geometry", () => {
  const rect = [{ x: 0, y: 0, w: 200, h: 40 }];
  test("every rough-notation type draws, and Slidev's aliases resolve", () => {
    for (const t of MARK_TYPES) expect(markShapes(t, rect).length).toBeGreaterThan(0);
    expect(normaliseMarkType("strike")).toBe("strike-through");
    expect(normaliseMarkType("crossed")).toBe("crossed-off");
    expect(normaliseMarkType("nonsense")).toBe("underline");
  });

  test("the same text gives the same wobble; other text another", () => {
    const a = markShapes("circle", rect, { seed: "forty-two" });
    expect(markShapes("circle", rect, { seed: "forty-two" })).toEqual(a);
    expect(markShapes("circle", rect, { seed: "forty-three" })).not.toEqual(a);
  });

  test("iterations, brackets and padding", () => {
    expect(markShapes("underline", rect, { iterations: 3 })).toHaveLength(3);
    expect(markShapes("crossed-off", rect, { iterations: 1 })).toHaveLength(2);
    expect(
      markShapes("bracket", rect, { iterations: 1, brackets: ["left", "right"] }),
    ).toHaveLength(2);
    expect(markPadding("2 4")).toEqual([2, 4, 2, 4]);
    expect(markPadding([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(markPadding(undefined, 5)).toEqual([5, 5, 5, 5]);
  });

  test("a highlight is as tall as the line", () => {
    const [s] = markShapes("highlight", rect, { iterations: 1 });
    expect(s!.width).toBeCloseTo(36);
  });
});

describe("<Switch> ranges", () => {
  test("cases follow each other; the last stays", () => {
    expect(switchRanges([{}, {}, {}])).toEqual([
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: Number.POSITIVE_INFINITY },
    ]);
  });
  test("Slidev's numbers and ranges", () => {
    expect(switchRanges([{ at: 1 }, { at: 2 }, { at: "5-7" }])).toEqual([
      { start: 1, end: 2 },
      { start: 2, end: 5 },
      { start: 5, end: 7 },
    ]);
    expect(switchRanges([{ at: 0 }, {}])[0]).toEqual({ start: 0, end: 1 });
    expect(switchRanges([{ at: [2, 4] }])[0]).toEqual({ start: 2, end: 4 });
  });
});

describe("<Video> click plan", () => {
  const plan = {
    events: [
      { click: 1, action: "play" as const },
      { click: 3, action: 42 },
      { click: 4, action: "pause" as const },
      { click: 6, action: "rewind" as const },
    ],
  };
  test("plays from its click until it is paused", () => {
    expect(playingAt(plan, 0)).toBe(false);
    expect(playingAt(plan, 1)).toBe(true);
    expect(playingAt(plan, 3)).toBe(true);
    expect(playingAt(plan, 4)).toBe(false);
  });
  test("a jump happens only when its click is crossed going forward", () => {
    expect(seekCrossing(plan, 2, 3)).toBe(42);
    expect(seekCrossing(plan, 3, 5)).toBeNull();
    expect(seekCrossing(plan, 0, 6)).toBe("rewind");
  });
});
