import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";

import {
  blend,
  contrastRatio,
  decodePng,
  hex,
  inkBackground,
  isLargeText,
  judge,
  luminance,
  parseColor,
  percentile,
  sampleAt,
  sampleGrid,
} from "./contrast-math.ts";

const near = (got: number, want: number, eps = 0.6) =>
  expect(Math.abs(got - want)).toBeLessThan(eps);
const rgb = (c: { r: number; g: number; b: number } | null) =>
  c ? [Math.round(c.r), Math.round(c.g), Math.round(c.b)] : null;

describe("parseColor", () => {
  test("rgb and rgba, comma and space syntax", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("rgb(10 20 30 / 25%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseColor("rgba(0, 0, 0, 0)")?.a).toBe(0);
  });
  test("hex, named, transparent", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#11223380")?.a).toBeCloseTo(128 / 255, 5);
    expect(parseColor("transparent")?.a).toBe(0);
    expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
  test("color() in srgb, srgb-linear and display-p3", () => {
    expect(rgb(parseColor("color(srgb 1 0.5 0)"))).toEqual([255, 128, 0]);
    expect(parseColor("color(srgb 0 0 0 / 0.4)")?.a).toBeCloseTo(0.4, 5);
    expect(rgb(parseColor("color(srgb-linear 1 1 1)"))).toEqual([255, 255, 255]);
    // P3 red is outside sRGB: clamped to sRGB red.
    expect(rgb(parseColor("color(display-p3 1 0 0)"))).toEqual([255, 0, 0]);
    expect(rgb(parseColor("color(display-p3 0.5 0.5 0.5)"))).toEqual([128, 128, 128]);
  });
  test("oklab, oklch, lab, lch, as Chromium computes color-mix() and theme tokens", () => {
    expect(rgb(parseColor("oklch(1 0 0)"))).toEqual([255, 255, 255]);
    expect(rgb(parseColor("oklch(0 0 0)"))).toEqual([0, 0, 0]);
    // oklch(0.628 0.2577 29.23) is sRGB red.
    const red = parseColor("oklch(0.628 0.2577 29.23)")!;
    near(red.r, 255, 1.5);
    near(red.g, 0, 1.5);
    near(red.b, 0, 1.5);
    expect(rgb(parseColor("oklab(0.5 0 0 / 0.5)"))).toEqual([99, 99, 99]);
    expect(parseColor("oklab(0.5 0 0 / 0.5)")?.a).toBe(0.5);
    // lab(54.29 80.8 69.89) is sRGB red (CSS Lab is D50; adapted to D65 for sRGB).
    const labRed = parseColor("lab(54.29 80.8 69.89)")!;
    near(labRed.r, 255, 1.5);
    near(labRed.b, 0, 1.5);
    near(labRed.g, 0, 3);
    expect(rgb(parseColor("lch(100 0 0)"))).toEqual([255, 255, 255]);
    expect(rgb(parseColor("hsl(120 100% 25%)"))).toEqual([0, 128, 0]);
  });
  test("not a plain colour", () => {
    expect(parseColor("url(#grad)")).toBeNull();
    expect(parseColor("none")).toBeNull();
    expect(parseColor("currentcolor")).toBeNull();
    expect(parseColor("color(rec2020 1 0 0)")).toBeNull();
  });
});

describe("luminance and contrast", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  test("the ends of the scale", () => {
    expect(luminance(black)).toBe(0);
    expect(luminance(white)).toBeCloseTo(1, 10);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 10);
    expect(contrastRatio(white, white)).toBe(1);
  });
  test("known pairs", () => {
    // #767676 on white is the classic 4.54:1; #777 just misses at 4.48.
    expect(contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, white)).toBeCloseTo(4.54, 2);
    expect(contrastRatio({ r: 0x77, g: 0x77, b: 0x77 }, white)).toBeCloseTo(4.48, 2);
    // #999 on #222 (a grey caption on a dark slide) reads at 5.6; #666 on #222 does not, at 2.8.
    const dark = { r: 0x22, g: 0x22, b: 0x22 };
    expect(contrastRatio({ r: 0x99, g: 0x99, b: 0x99 }, dark)).toBeCloseTo(5.58, 2);
    expect(contrastRatio({ r: 0x66, g: 0x66, b: 0x66 }, dark)).toBeCloseTo(2.77, 2);
  });
});

describe("blend", () => {
  test("alpha and opacity both fade the text into its background", () => {
    const bg = { r: 0, g: 0, b: 0 };
    expect(blend({ r: 255, g: 255, b: 255, a: 1 }, bg)).toEqual({ r: 255, g: 255, b: 255 });
    expect(blend({ r: 255, g: 255, b: 255, a: 0.5 }, bg)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(blend({ r: 255, g: 255, b: 255, a: 1 }, bg, 0.5)).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
    });
    expect(blend({ r: 255, g: 255, b: 255, a: 0.5 }, bg, 0.5).r).toBeCloseTo(63.75, 5);
  });
});

describe("isLargeText", () => {
  test("24px, or 18.66px bold, on the stage", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(18, 900)).toBe(false);
  });
});

describe("percentile", () => {
  test("interpolates, and ignores order", () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 10)).toBe(2);
    expect(percentile([1, 2], 25)).toBe(1.25);
    expect(percentile([], 10)).toBeNaN();
  });
});

describe("sampleGrid", () => {
  test("rows inside each line box, spread by area, capped", () => {
    const pts = sampleGrid([{ x: 0, y: 0, w: 120, h: 40 }], 96);
    expect(pts.length).toBe(30); // 10 columns (every 12px) × 3 rows
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(120);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(30);
    }
    const many = sampleGrid([{ x: 0, y: 0, w: 1800, h: 60 }], 96);
    expect(many.length).toBeLessThanOrEqual(96);
    expect(sampleGrid([{ x: 0, y: 0, w: 30, h: 8 }]).length).toBe(3);
    expect(sampleGrid([])).toEqual([]);
  });
});

describe("judge", () => {
  const grey = { r: 0x99, g: 0x99, b: 0x99, a: 1 };
  test("the low percentile catches text crossing a bright patch", () => {
    const dark = { r: 0x10, g: 0x10, b: 0x10 };
    const bright = { r: 0xd0, g: 0xd0, b: 0xd0 };
    const samples = [...Array(17).fill(dark), bright, bright, bright];
    const j = judge(grey, 1, samples, 10)!;
    expect(j.ratio).toBeLessThan(2);
    expect(j.best).toBeGreaterThan(6);
    expect(hex(j.bg)).toBe("#d0d0d0");
    // The median would have passed it.
    expect(judge(grey, 1, samples, 50)!.ratio).toBeGreaterThan(6);
  });
  test("opacity counts", () => {
    const black = { r: 0, g: 0, b: 0 };
    expect(judge({ r: 255, g: 255, b: 255, a: 1 }, 1, [black])!.ratio).toBeCloseTo(21, 5);
    expect(judge({ r: 255, g: 255, b: 255, a: 1 }, 0.3, [black])!.ratio).toBeLessThan(3);
    expect(judge(grey, 1, [])).toBeNull();
  });
});

/** A PNG as Chromium writes one: RGBA rows, each with its own filter byte. */
function png(width: number, height: number, pixel: (x: number, y: number) => number[], filter = 0) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(filter);
    const line = Array.from({ length: width }, (_, x) => pixel(x, y)).flat();
    // Filter 1 (Sub): each byte minus the one a pixel to its left.
    for (let i = 0; i < line.length; i++)
      rows.push(filter === 1 ? (line[i]! - (i >= 4 ? line[i - 4]! : 0)) & 255 : line[i]!);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("decodePng and sampleAt", () => {
  test("reads RGBA pixels through the row filters", () => {
    for (const filter of [0, 1]) {
      const img = decodePng(png(8, 4, (x, y) => [x * 30, y * 60, 200, 255], filter));
      expect(img.width).toBe(8);
      expect(img.height).toBe(4);
      expect(img.at(3, 2)).toEqual({ r: 90, g: 120, b: 200 });
      expect(img.at(99, -5)).toEqual({ r: 210, g: 0, b: 200 });
    }
  });
  test("averages a 3 × 3 neighbourhood", () => {
    const img = decodePng(
      png(5, 5, (x, y) => (x === 2 && y === 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])),
    );
    expect(sampleAt(img, 2, 2).r).toBeCloseTo(255 / 9, 5);
  });
  test("refuses what is not a PNG", () => {
    expect(() => decodePng(Buffer.from("not a png at all"))).toThrow();
  });
});

describe("inkBackground", () => {
  // A white page with a black glyph at x 4–5; behind the glyph's left half the page is red.
  const bare = decodePng(png(12, 6, (x) => (x < 5 ? [255, 0, 0, 255] : [255, 255, 255, 255])));
  const ink = decodePng(
    png(12, 6, (x) =>
      x === 4 || x === 5 ? [0, 0, 0, 255] : x < 5 ? [255, 0, 0, 255] : [255, 255, 255, 255],
    ),
  );
  test("the background under the painted glyph, not the whole box", () => {
    const bg = inkBackground(ink, bare, 4, 3, 1)!;
    expect(rgb(bg)).toEqual([255, 128, 128]);
  });
  test("another text's ink is not this one's", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const paper = { r: 255, g: 255, b: 255, a: 1 };
    expect(inkBackground(ink, bare, 5, 3, 0, black)).not.toBeNull();
    // White text there would have left the white page white: the black pixels are not its ink.
    expect(inkBackground(ink, bare, 5, 3, 0, paper)).toBeNull();
  });
  test("no glyph nearby: no sample", () => {
    expect(inkBackground(ink, bare, 10, 3, 1)).toBeNull();
    expect(inkBackground(bare, bare, 4, 3, 2)).toBeNull();
  });
});
