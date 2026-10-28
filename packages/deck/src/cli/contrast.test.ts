import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";

import { checkContrast, formatContrast } from "./contrast.ts";
import type { PageLike, SlideRenderer } from "./render.ts";

/** A white PNG: text that left no ink, which is all a timing test needs. */
function whitePng(width: number, height: number): Buffer {
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
  const row = [0, ...Array.from({ length: width * 4 }, () => 255)];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(Array.from({ length: height }, () => row).flat()))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A print view of three one-text pages whose pictures take as long as `slow` says: the
 * screenshot throws Playwright's TimeoutError when the page needs longer than it was given.
 */
function fakeRenderer(slow: (page: number, attempt: number) => number) {
  const tries = new Map<number, number[]>();
  let current = -1;
  const run = (page: number) => ({
    page,
    boxes: [{ x: 2, y: 2, w: 10, h: 4 }],
    color: "rgb(0, 0, 0)",
    opacity: 1,
    fontSize: 32,
    fontWeight: 400,
    shadow: false,
    halo: null,
    text: `slide ${page + 1}`,
    path: "h1",
  });
  const facts = {
    pages: [0, 1, 2].map((page) => ({ page, slide: page + 1, id: null, click: 0, width: 20 })),
    runs: [run(0), run(1), run(2)],
    skipped: {},
  };
  const page = {
    async evaluate(_fn: unknown, arg?: unknown) {
      if (arg === undefined) return facts;
      // picture(): scroll page `arg` into view and return its box
      if (typeof arg === "number" && arg < 100) {
        current = arg;
        return { x: 0, y: 0, width: 20, height: 10 };
      }
      return undefined;
    },
    async screenshot(o: { timeout: number }) {
      const attempts = tries.get(current) ?? [];
      attempts.push(o.timeout);
      tries.set(current, attempts);
      if (slow(current, attempts.length) > o.timeout) {
        const e = new Error(`page.screenshot: Timeout ${o.timeout}ms exceeded.`);
        e.name = "TimeoutError";
        throw e;
      }
      return whitePng(20, 10);
    },
  } as unknown as PageLike;
  const renderer = {
    withPrintView: (
      req: { scheme: "light" | "dark" },
      use: (v: { page: PageLike; scheme: "light" | "dark"; errors: string[] }) => unknown,
    ) => use({ page, scheme: req.scheme, errors: [] }),
  } as unknown as SlideRenderer;
  return { renderer, tries };
}

const options = {
  schemes: ["light" as const],
  min: 4.5,
  minLarge: 3,
  percentile: 10,
  clicks: true,
  pictureTimeouts: [30, 120],
};

describe("contrast under load", () => {
  test("a slow picture is tried again with longer; one that never comes is not measured", async () => {
    // Slide 2 needs 60 (more than the first try's 30); slide 3 needs 500 (more than either).
    const { renderer, tries } = fakeRenderer((p) => (p === 1 ? 60 : p === 2 ? 500 : 1));
    const said: string[] = [];
    const report = await checkContrast(renderer, { ...options, say: (l) => said.push(l) });
    expect(tries.get(0)).toEqual([30, 30]);
    // its second picture (the text made transparent) waits as long as its first needed
    expect(tries.get(1)).toEqual([30, 120, 120]);
    expect(tries.get(2)).toEqual([30, 120]);
    expect(said).toContain("slow   slide 2: no picture in 0.03 s, trying again with 0.12 s");
    // The run went on to the end: every other page was measured, slide 3 alone is left.
    expect(report.unmeasured).toEqual([
      { scheme: "light", slide: 3, id: null, step: 0, reason: "no picture in 0.15 s" },
    ]);
    expect(report.findings).toEqual([]);
    // Not known to pass, so not ok (exit 1), and the report says why, not "every text reads".
    expect(report.ok).toBe(false);
    const text = formatContrast(report);
    expect(text).toContain("not measured: slide 3, no picture in 0.15 s");
    expect(text).toContain("but not every page was measured");
    expect(text).not.toContain("Every text reads");
  });

  test("every page in time: ok, and nothing left unmeasured", async () => {
    const { renderer } = fakeRenderer(() => 1);
    const report = await checkContrast(renderer, options);
    expect(report.unmeasured).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test("an error other than a timeout still stops the run", async () => {
    const { renderer } = fakeRenderer(() => 1);
    const broken = {
      withPrintView: (req: never, use: (v: { page: PageLike }) => unknown) =>
        (renderer as unknown as { withPrintView: typeof broken.withPrintView }).withPrintView(
          req,
          ({ page }) =>
            use({
              page: Object.assign(Object.create(page as object), {
                screenshot: async () => {
                  throw new Error("Target closed");
                },
              }) as PageLike,
            }),
        ),
    } as unknown as SlideRenderer;
    await expect(checkContrast(broken, options)).rejects.toThrow("Target closed");
  });
});
