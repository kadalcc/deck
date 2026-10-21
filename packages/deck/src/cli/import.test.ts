import { afterAll, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { EXIT, main } from "./index.ts";

const work = mkdtempSync(join(tmpdir(), "kadal-deck-import-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
const starter = fileURLToPath(new URL("../../test/fixtures/slidev/starter", import.meta.url));

async function cli(argv: string[], cwd = work) {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => err.push(a.join(" "));
  try {
    const code = await main(argv, cwd);
    return { code, stdout: out.join("\n"), stderr: err.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe("kadal-deck import slidev", () => {
  test("a Slidev project becomes a deck folder, then is checked", async () => {
    const src = join(work, "talk");
    cpSync(starter, src, { recursive: true });
    mkdirSync(join(src, "public"), { recursive: true });
    writeFileSync(join(src, "public", "logo.svg"), "<svg/>");
    const r = await cli(["import", "slidev", "talk", "--json"]);
    expect(r.code).toBe(EXIT.ok);
    const json = JSON.parse(r.stdout) as {
      ok: boolean;
      out: string;
      slides: number;
      cleanSlides: number;
      check: {
        diagnostics: Array<{ severity: string; message: string }>;
        afterInstall: Array<{ code: string }>;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.out).toBe(join(work, "talk-kadal"));
    expect(json.slides).toBe(16);
    // before `npm install` the theme package is the next step, not a problem
    expect(json.check.afterInstall.map((d) => d.code)).toContain("theme-missing");
    expect(json.check.afterInstall.every((d) => d.code.endsWith("-missing"))).toBe(true);
    expect(json.check.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

    const out = json.out;
    for (const f of [
      "deck.mdx",
      "pages/imported-slides.mdx",
      "snippets/external.ts",
      "public/logo.svg",
      "src/components/Counter.tsx",
      "src/components.tsx",
      "src/slidev.css",
      "src/slidev.tsx",
      "src/main.tsx",
      "vite.config.ts",
      "IMPORT-REPORT.md",
    ])
      expect(existsSync(join(out, f))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(out, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@kadal/theme-seriph"]).toMatch(/^\^\d/);
    expect(pkg.devDependencies["@iconify-json/carbon"]).toBe("latest");
    expect(pkg.devDependencies.vue).toBe("^3.5.33");
    // the starter's settings would override the deck's own transition and colour scheme
    const config = readFileSync(join(out, "deck.config.ts"), "utf8");
    expect(config).not.toContain("transition");
    expect(config).not.toContain("colorScheme");
    const styles = readFileSync(join(out, "src", "styles.css"), "utf8");
    expect(styles).toContain('@import "tailwindcss";\n@import "./slidev.css";');
    expect(styles).toContain('@source "../pages";');
    const report = readFileSync(join(out, "IMPORT-REPORT.md"), "utf8");
    expect(report).toContain("- Slides: 16 — 15 (94%) converted with no warning or error.");
    expect(report).toContain("## Slide 15 — Monaco Editor");
  });

  test("a non-empty folder needs --force, which writes over and removes nothing", async () => {
    const src = join(work, "again");
    cpSync(starter, src, { recursive: true });
    const out = join(work, "busy");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "notes.txt"), "mine");
    const refused = await cli(["import", "slidev", "again/slides.md", "--out", "busy"]);
    expect(refused.code).toBe(EXIT.usage);
    expect(refused.stderr).toContain("is not empty");
    const forced = await cli([
      "import",
      "slidev",
      "again/slides.md",
      "--out",
      "busy",
      "--force",
      "--json",
    ]);
    expect(forced.code).toBe(EXIT.ok);
    expect(readFileSync(join(out, "notes.txt"), "utf8")).toBe("mine");
    expect(existsSync(join(out, "deck.mdx"))).toBe(true);
  });

  test("usage errors", async () => {
    expect((await cli(["import"])).code).toBe(EXIT.usage);
    expect((await cli(["import", "reveal", "x.md"])).stderr).toContain("imports Slidev decks");
    expect((await cli(["import", "slidev"])).code).toBe(EXIT.usage);
    expect((await cli(["import", "slidev", "nowhere.md"])).stderr).toContain("does not exist");
  });
});
