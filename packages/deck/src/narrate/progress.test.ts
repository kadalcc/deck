import { describe, expect, test } from "bun:test";

import {
  barFill,
  barSpan,
  narrationPosition,
  type PositionState,
  steadyPosition,
} from "./progress.ts";
import { segmentPartIndexes, type Timeline } from "./text.ts";

const GAP = 500;
// Slide 0: two segments (2 s, 1 s); slide 1: one segment (3 s); slide 2: silent, dwells 4 s.
const timeline: Timeline = {
  slides: [
    { index: 0, title: "A", segments: ["a", "b"], ms: [2000, 1000], start: 0, duration: 4000 },
    { index: 1, title: "B", segments: ["c"], ms: [3000], start: 4000, duration: 3500 },
    { index: 2, title: "C", segments: [], ms: [4000], start: 7500, duration: 4500 },
  ],
  total: 12_000,
};
const at = (patch: Partial<PositionState>, now = 0): number =>
  narrationPosition(
    timeline,
    GAP,
    { phase: "speaking", slide: 0, segment: 0, part: -1, startedAt: 0, expectedMs: 1000, ...patch },
    now,
  );

describe("where the narration is on the timeline", () => {
  test("speaking crosses the segment's slot at the voice's own pace", () => {
    // The voice expects 4 s for a segment the timeline gave 2 s: halfway through it is 1 s in.
    expect(at({ startedAt: 0, expectedMs: 4000 }, 2000)).toBe(1000);
    // A voice running long stops at the slot's end rather than spilling into the next step.
    expect(at({ startedAt: 0, expectedMs: 4000 }, 9000)).toBe(2000);
  });

  test("the gap after a segment carries on from its end — it never falls back to the step's start", () => {
    const endOfSpeech = at({ startedAt: 0, expectedMs: 2000 }, 2000);
    const gapStart = at({ phase: "gap", startedAt: 2000, expectedMs: GAP }, 2000);
    const gapEnd = at({ phase: "gap", startedAt: 2000, expectedMs: GAP }, 2500);
    expect(endOfSpeech).toBe(2000);
    expect(gapStart).toBe(2000);
    expect(gapEnd).toBe(2500);
    // …which is exactly where the next segment begins.
    expect(at({ phase: "loading", segment: 1, part: 1 }, 2500)).toBe(2500);
  });

  test("on a slide's last step, each segment said in turn has its own slot", () => {
    // Click 0 is the last step (no clicks), so both segments are said: part 1 is the second.
    expect(at({ part: 1, startedAt: 0, expectedMs: 1000 }, 500)).toBe(3000);
    expect(segmentPartIndexes(["a", "", "c", "d"], 1, 1)).toEqual([2, 3]);
    expect(segmentPartIndexes(["a", "b"], 0, 1)).toEqual([0]);
    expect(segmentPartIndexes(["a", ""], 1, 3)).toEqual([]);
  });

  test("a silent slide dwells across its own slot; the end of the talk is the whole bar", () => {
    expect(at({ phase: "dwell", slide: 2, startedAt: 0, expectedMs: 4000 }, 2000)).toBe(9500);
    expect(at({ phase: "ended", slide: 2 }, 0)).toBe(12_000);
  });

  test("paused or idle stands at the start of the step play will say again", () => {
    expect(at({ phase: "paused", slide: 1, segment: 0, part: 0 }, 99_999)).toBe(4000);
    expect(at({ phase: "idle", slide: 0, segment: 1 }, 0)).toBe(2500);
  });

  test("a whole play never steps back; a seek back does", () => {
    const frames: {
      phase: PositionState["phase"];
      slide: number;
      segment: number;
      part: number;
      startedAt: number;
      expectedMs: number;
      now: number;
    }[] = [
      { phase: "loading", slide: 0, segment: 0, part: 0, startedAt: 0, expectedMs: 2000, now: 0 },
      {
        phase: "speaking",
        slide: 0,
        segment: 0,
        part: 0,
        startedAt: 100,
        expectedMs: 1500,
        now: 1700,
      },
      { phase: "gap", slide: 0, segment: 0, part: 0, startedAt: 1700, expectedMs: GAP, now: 1800 },
      {
        phase: "loading",
        slide: 0,
        segment: 1,
        part: 1,
        startedAt: 2300,
        expectedMs: 1000,
        now: 2300,
      },
      {
        phase: "speaking",
        slide: 0,
        segment: 1,
        part: 1,
        startedAt: 2400,
        expectedMs: 1800,
        now: 4000,
      },
      { phase: "gap", slide: 0, segment: 1, part: 1, startedAt: 4200, expectedMs: GAP, now: 4300 },
      {
        phase: "loading",
        slide: 1,
        segment: 0,
        part: 0,
        startedAt: 4700,
        expectedMs: 3000,
        now: 4700,
      },
      {
        phase: "speaking",
        slide: 1,
        segment: 0,
        part: 0,
        startedAt: 4800,
        expectedMs: 2000,
        now: 6000,
      },
      {
        phase: "dwell",
        slide: 2,
        segment: 0,
        part: -1,
        startedAt: 7400,
        expectedMs: 4000,
        now: 9000,
      },
      { phase: "ended", slide: 2, segment: 0, part: -1, startedAt: 0, expectedMs: 0, now: 12_000 },
    ];
    let prev: { at: number; slide: number; segment: number } | null = null;
    let last = -1;
    for (const f of frames) {
      const raw = narrationPosition(timeline, GAP, f, f.now);
      const shown = steadyPosition(
        prev,
        { at: raw, slide: f.slide, segment: f.segment },
        f.phase !== "ended",
      );
      expect(shown).toBeGreaterThanOrEqual(last);
      last = shown;
      prev = { at: shown, slide: f.slide, segment: f.segment };
    }
    expect(last).toBe(timeline.total);
    // A seek back to slide 0 is shown at once.
    expect(
      steadyPosition({ at: 9000, slide: 2, segment: 0 }, { at: 0, slide: 0, segment: 0 }, true),
    ).toBe(0);
  });
});

describe("the bar's scale", () => {
  test("ends at the last slide's start: its point is the far end", () => {
    expect(barSpan(timeline)).toBe(7500);
    // Slide 1's point sits at 4000 / 7500 of the bar, as the hover maps it back.
    expect(4000 / barSpan(timeline)).toBeCloseTo(0.5333, 3);
  });

  test("fills across the slides before the last, and is full on the last in any phase", () => {
    expect(barFill(timeline, 0, { phase: "idle", slide: 0 })).toBe(0);
    expect(barFill(timeline, 3750, { phase: "speaking", slide: 0 })).toBe(0.5);
    expect(barFill(timeline, 7499, { phase: "gap", slide: 1 })).toBeCloseTo(1, 3);
    for (const phase of ["idle", "paused", "loading", "dwell"] as const)
      expect(barFill(timeline, 7500, { phase, slide: 2 })).toBe(1);
    expect(barFill(timeline, 12_000, { phase: "ended", slide: 2 })).toBe(1);
  });

  test("a one-slide deck's bar is that slide's own talk", () => {
    const one: Timeline = { slides: [timeline.slides[0]!], total: 4000 };
    expect(barSpan(one)).toBe(4000);
    expect(barFill(one, 0, { phase: "idle", slide: 0 })).toBe(0);
    expect(barFill(one, 2000, { phase: "speaking", slide: 0 })).toBe(0.5);
    expect(barFill(one, 4000, { phase: "ended", slide: 0 })).toBe(1);
    expect(barFill({ slides: [], total: 0 }, 0, { phase: "idle", slide: 0 })).toBe(0);
  });
});
