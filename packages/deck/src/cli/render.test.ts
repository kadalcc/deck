import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Under Node (not Bun), `import()` of Playwright's CommonJS entry puts the API on `default`;
 * the review of PR #6 found screenshots and slide_render dead under `npx`. These run the built
 * CLI with Node, the way users run it.
 */

const pkg = resolve(import.meta.dir, "../..");
const dist = join(pkg, "dist", "cli", "render.js");
const starter = resolve(pkg, "../../examples/starter");
const node = spawnSync("node", ["--version"]).status === 0;

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
            "0",
            "--width",
            "480",
            "--json",
          ],
          { encoding: "utf8" },
        );
        expect(r.status, r.stderr.slice(-800)).toBe(0);
        const out = JSON.parse(r.stdout);
        expect(out.files.map((f: { slide: number; width: number }) => [f.slide, f.width])).toEqual([
          [0, 480],
        ]);
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
