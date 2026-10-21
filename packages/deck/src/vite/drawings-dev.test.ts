import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanDrawing, drawingsExport, readDrawingFiles, sameOrigin } from "./drawings-dev.ts";

describe("drawing files on the dev server", () => {
  test("only same-origin requests write", () => {
    const h = (headers: Record<string, string>) => ({
      headers: { host: "localhost:5480", ...headers },
    });
    expect(sameOrigin(h({}))).toBe(true);
    expect(sameOrigin(h({ origin: "http://localhost:5480" }))).toBe(true);
    expect(sameOrigin(h({ origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(h({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOrigin(h({ origin: "not a url" }))).toBe(false);
  });

  test("what is written is the deck's own markup, never what was sent", () => {
    const sent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><g data-click="0">
      <path id="s_1" d="M 0 0 L 10 10" stroke="#ef4444" stroke-width="4" data-points="0,0 10,10" onload="alert(1)"/>
      <script>alert(1)</script><foreignObject><div>x</div></foreignObject></g></svg>`;
    const out = cleanDrawing(sent, "2");
    expect(out).toContain('id="s_1"');
    expect(out).not.toContain("script");
    expect(out).not.toContain("onload");
    expect(out).not.toContain("foreignObject");
    expect(cleanDrawing("", "2")).toBe("");
    expect(cleanDrawing("<svg viewBox='0 0 0 0'></svg>", "2")).toBe("");
  });

  test("the folder is read by name; other files are not drawings", () => {
    const dir = mkdtempSync(join(tmpdir(), "kadal-drawings-"));
    try {
      writeFileSync(join(dir, "3.svg"), "<svg/>");
      writeFileSync(join(dir, "intro.svg"), "<svg/>");
      writeFileSync(join(dir, "notes.txt"), "x");
      writeFileSync(join(dir, "bad name.svg"), "<svg/>");
      expect(Object.keys(readDrawingFiles(dir)).sort()).toEqual(["3", "intro"]);
      expect(readDrawingFiles(join(dir, "missing"))).toEqual({});
      expect(drawingsExport({ building: true, base: "/", dir })).toContain("virtual:deck/drawings");
      expect(drawingsExport({ building: true, base: "/", dir: join(dir, "missing") })).toBe(
        "export const drawings = null;",
      );
      expect(drawingsExport({ building: false, base: "/d/", dir })).toContain(
        '"/d/__kadal/drawings"',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
