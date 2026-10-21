import { describe, expect, test } from "bun:test";

import {
  type PptxDeck,
  type PptxSlide,
  buildSlides,
  hex,
  runOptions,
  textRuns,
  transparency,
} from "./build.ts";
import type { SlideSnapshot } from "./types.ts";

describe("units and colours", () => {
  test("hex and transparency", () => {
    expect(hex([255, 0, 128, 1])).toBe("FF0080");
    expect(transparency([0, 0, 0, 0.25])).toBe(75);
    expect(transparency(1)).toBe(0);
  });

  test("a run in points, with its look", () => {
    expect(
      runOptions({
        text: "x",
        font: "Inter",
        size: 32,
        color: [17, 17, 17, 1],
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        spacing: -0.64,
        href: "https://deck.kadal.cc/",
      }),
    ).toEqual({
      fontFace: "Inter",
      fontSize: 24,
      color: "111111",
      bold: true,
      italic: true,
      underline: { style: "sng" },
      strike: "sngStrike",
      charSpacing: -0.48,
      hyperlink: { url: "https://deck.kadal.cc/" },
    });
  });
});

describe("textRuns", () => {
  test("paragraph options ride on every run; a break ends each paragraph but the last", () => {
    const runs = textRuns([
      {
        align: "left",
        lineHeight: 40,
        before: 0,
        runs: [
          { text: "One ", font: "Arial", size: 24, color: [0, 0, 0, 1] },
          { text: "bold", font: "Arial", size: 24, color: [0, 0, 0, 1], bold: true },
        ],
        bullet: { kind: "bullet", char: "•", level: 0, indent: 24 },
      },
      {
        align: "left",
        lineHeight: 40,
        before: 12,
        runs: [{ text: "Two", font: "Arial", size: 24, color: [0, 0, 0, 1] }],
        bullet: { kind: "number", numberType: "romanLcPeriod", start: 3, level: 1, indent: 24 },
      },
    ]);
    expect(runs.map((r) => r.text)).toEqual(["One ", "bold", "Two"]);
    expect(runs[0]!.options).toMatchObject({
      lineSpacing: 30,
      bullet: { characterCode: "2022", indent: 18 },
    });
    expect(runs[1]!.options.breakLine).toBe(true);
    expect(runs[2]!.options).toMatchObject({
      paraSpaceBefore: 9,
      indentLevel: 1,
      bullet: { type: "number", style: "romanLcPeriod", numberStartAt: 3 },
    });
    expect(runs[2]!.options.breakLine).toBeUndefined();
  });

  test("no bullet is said out loud (else PowerPoint's master may add one)", () => {
    const [r] = textRuns([
      {
        align: "center",
        lineHeight: null,
        before: 0,
        runs: [{ text: "x", font: "Arial", size: 16, color: [0, 0, 0, 1] }],
      },
    ]);
    expect(r!.options.bullet).toBe(false);
    expect(r!.options.align).toBe("center");
  });
});

describe("buildSlides", () => {
  const calls: { kind: string; args: unknown[] }[] = [];
  const slide: PptxSlide = {
    addText: (...a) => void calls.push({ kind: "text", args: a }),
    addShape: (...a) => void calls.push({ kind: "shape", args: a }),
    addImage: (...a) => void calls.push({ kind: "image", args: a }),
    addTable: (...a) => void calls.push({ kind: "table", args: a }),
    addNotes: (...a) => void calls.push({ kind: "notes", args: a }),
  };
  const deck = { addSlide: () => slide } as unknown as PptxDeck;
  const snap: SlideSnapshot = {
    page: 0,
    slide: 0,
    h: 0,
    v: 0,
    click: 0,
    width: 1920,
    height: 1080,
    background: { color: [255, 255, 255, 1], raster: false },
    under: [
      {
        kind: "box",
        rect: { x: 96, y: 96, w: 192, h: 96 },
        shape: "roundRect",
        radius: 12,
        fill: [37, 99, 235, 1],
        line: { width: 2, color: [0, 0, 0, 0.5], dash: "solid" },
      },
      {
        kind: "raster",
        rect: { x: 0, y: 0, w: 10, h: 10 },
        id: 7,
        mode: "all",
        reason: "SVG",
        bleed: 0,
      },
    ],
    over: [
      {
        kind: "text",
        rect: { x: 96, y: 300, w: 960, h: 60 },
        wrap: false,
        paragraphs: [
          {
            align: "left",
            lineHeight: null,
            before: 0,
            runs: [{ text: "Hi", font: "Arial", size: 48, color: [0, 0, 0, 1] }],
          },
        ],
      },
    ],
    fonts: ["Arial"],
  };

  test("background, shapes and pictures, the residue, then text; notes last", () => {
    calls.length = 0;
    const report = buildSlides(
      deck,
      [
        {
          snap,
          pictures: {
            rasters: new Map([
              [7, { rect: { x: 0, y: 0, w: 10, h: 10 }, png: new Uint8Array([1]) }],
            ]),
            background: null,
            residue: [{ rect: { x: 5, y: 5, w: 4, h: 4 }, png: new Uint8Array([2]) }],
            failed: 0,
          },
          files: new Map(),
          notes: "Say this.",
        },
      ],
      { width: 1920, height: 1080 },
    );
    expect(calls.map((c) => c.kind)).toEqual(["shape", "image", "image", "text", "notes"]);
    expect((slide as { background?: unknown }).background).toEqual({ color: "FFFFFF" });
    const shape = calls[0]!.args[1] as Record<string, number>;
    // A 2px border straddles the outline in PowerPoint: the shape is inset by 1px (1/96 inch).
    expect(shape.x).toBeCloseTo(97 / 96, 5);
    expect(shape.w).toBeCloseTo(190 / 96, 5);
    expect(shape.rectRadius).toBeCloseTo(11 / 96, 5);
    expect(report).toMatchObject({
      slides: 1,
      pictures: 2,
      fallbacks: 0,
      natives: { shapes: 1, text: 1 },
    });
  });

  test("a slide the walker could not read is one picture, notes kept", () => {
    calls.length = 0;
    const report = buildSlides(
      deck,
      [{ snap: null, pictures: null, files: new Map(), whole: new Uint8Array([1]), notes: "n" }],
      { width: 1920, height: 1080 },
    );
    expect(calls.map((c) => c.kind)).toEqual(["image", "notes"]);
    expect(report.fallbacks).toBe(1);
  });
});
