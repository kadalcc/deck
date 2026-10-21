import { describe, expect, test } from "bun:test";

import { type Bitmap, crop, decodePng, encodePng, inkBoxes } from "./png.ts";

function bitmap(w: number, h: number, ink: [number, number, number, number][]): Bitmap {
  const data = new Uint8Array(w * h * 4);
  for (const [x0, y0, x1, y1] of ink)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) data.set([200, 10, 10, 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

describe("png", () => {
  test("round trip", () => {
    const b = bitmap(37, 21, [[3, 4, 10, 12]]);
    const back = decodePng(encodePng(b));
    expect(back.width).toBe(37);
    expect(back.height).toBe(21);
    expect(Buffer.from(back.data).equals(Buffer.from(b.data))).toBe(true);
  });

  test("crop", () => {
    const c = crop(bitmap(20, 20, [[5, 5, 10, 10]]), { x: 5, y: 5, w: 5, h: 5 });
    expect(c.width).toBe(5);
    expect([...c.data.subarray(0, 4)]).toEqual([200, 10, 10, 255]);
  });

  test("separate decorations become separate boxes; nothing is none", () => {
    expect(inkBoxes(bitmap(100, 100, []))).toEqual([]);
    const boxes = inkBoxes(
      bitmap(200, 100, [
        [10, 10, 20, 20],
        [150, 60, 170, 90],
      ]),
      { gap: 16 },
    );
    expect(boxes).toEqual([
      { x: 10, y: 10, w: 10, h: 10 },
      { x: 150, y: 60, w: 20, h: 30 },
    ]);
    // Closer than the gap: one picture.
    expect(
      inkBoxes(
        bitmap(100, 40, [
          [10, 10, 20, 20],
          [25, 10, 30, 20],
        ]),
        { gap: 16 },
      ),
    ).toEqual([{ x: 10, y: 10, w: 20, h: 10 }]);
  });
});
