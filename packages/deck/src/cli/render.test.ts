import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

/**
 * Under Node (not Bun), `import()` of Playwright's CommonJS entry puts the API on `default`;
 * the review of PR #6 found screenshots and slide_render dead under `npx`. These run the built
 * CLI with Node, the way users run it.
 */

const pkg = resolve(import.meta.dir, "../..");
const dist = join(pkg, "dist", "cli", "render.js");
const starter = resolve(pkg, "../../examples/starter");
const node = spawnSync("node", ["--version"]).status === 0;

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG, as Chromium writes them. */
function decodePng(buf: Buffer): {
  width: number;
  height: number;
  px: (x: number, y: number) => number[];
} {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 3;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? out[y * stride + i - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][filter]!;
      out[y * stride + i] = (x + add) & 255;
    }
  }
  const px = (x: number, y: number) => [
    ...out.subarray(y * stride + x * channels, y * stride + x * channels + 3),
  ];
  return { width, height, px };
}

async function chromium(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

describe.if(node && existsSync(dist))("under Node", () => {
  test("loadPlaywright finds chromium", () => {
    const r = spawnSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `const { loadPlaywright } = await import(${JSON.stringify(dist)}); const pw = await loadPlaywright(${JSON.stringify(starter)}); console.log(typeof pw.chromium.launch);`,
      ],
      { encoding: "utf8" },
    );
    expect(r.stderr).toBe("");
    expect(r.stdout.trim()).toBe("function");
  });

  test.if(existsSync(join(starter, "node_modules", "vite")))(
    "kadal-deck screenshot writes PNGs (when Chromium is installed)",
    async () => {
      if (!(await chromium())) return;
      const work = mkdtempSync(join(tmpdir(), "kadal-deck-shot-"));
      try {
        cpSync(starter, join(work, "d"), {
          recursive: true,
          filter: (s) =>
            !/[\\/](node_modules|dist|screenshots)([\\/]|$)/.test(s.slice(starter.length)),
        });
        symlinkSync(join(starter, "node_modules"), join(work, "d", "node_modules"), "dir");
        const r = spawnSync(
          "node",
          [
            join(pkg, "dist/cli/bin.js"),
            "screenshot",
            "-C",
            join(work, "d"),
            "--slide",
            "1",
            "--width",
            "640",
            "--json",
          ],
          { encoding: "utf8" },
        );
        expect(r.status, r.stderr.slice(-800)).toBe(0);
        const out = JSON.parse(r.stdout);
        expect(out.files.map((f: { slide: number; width: number }) => [f.slide, f.width])).toEqual([
          [1, 640],
        ]);
        // No grey edge. At 640 wide (a third of 1920) the print view's 16px gaps and page shadow
        // landed a fraction of a pixel inside the picture: a grey first or last column and row
        // (which one depends on the rounding). Every edge matches the pixels just inside it.
        const { width: w, height: h, px } = decodePng(readFileSync(out.files[0].path));
        const off = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
        for (const y of [h / 4, h / 2, (3 * h) / 4].map(Math.floor)) {
          expect(off(px(0, y), px(2, y))).toBeLessThan(4);
          expect(off(px(w - 1, y), px(w - 3, y))).toBeLessThan(4);
        }
        for (const x of [w / 4, w / 2, (3 * w) / 4].map(Math.floor)) {
          expect(off(px(x, 0), px(x, 2))).toBeLessThan(4);
          expect(off(px(x, h - 1), px(x, h - 3))).toBeLessThan(4);
        }
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
