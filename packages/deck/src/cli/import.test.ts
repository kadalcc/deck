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

import { tallySlides } from "./import.ts";
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
    // the first-party theme ships inside @kadal/deck, so it resolves before `npm install`
    expect(json.check.afterInstall.map((d) => d.code)).not.toContain("theme-missing");
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

  test("the summary counts every problem: the whole deck's, the check's, a missing file", async () => {
    // Slide 1 converts cleanly but names a class with no CSS (a warning for the whole deck);
    // slide 2 shows an image that is not there (the check's error, not a package to install).
    const src = join(work, "honest");
    mkdirSync(src, { recursive: true });
    writeFileSync(
      join(src, "slides.md"),
      '---\ntheme: default\n---\n\n# One\n\n<div class="zork-blah">hi</div>\n\n---\n\n# Two\n\n![logo](/missing.png)\n',
    );
    const r = await cli(["import", "slidev", "honest"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      "2 slides, 1 (50%) with nothing to report; 1 problem for the whole deck (below).",
    );
    expect(r.stdout).toContain("check: 1 errors");
    expect(r.stdout).toContain('"/missing.png" not found');
    expect(r.stdout).not.toContain("to install");
    expect(readFileSync(join(work, "honest-kadal", "IMPORT-REPORT.md"), "utf8")).toContain(
      "- Slides: 2 — 2 (100%) converted with no warning or error; 1 problem for the whole deck.",
    );
  });

  test("tallySlides: a slide is clean when nothing landed on it; 100% means no problem", () => {
    const warn = (slide: number | null) => ({ severity: "warning", slide });
    expect(tallySlides(3, [], []).line).toBe("3 slides, 3 (100%) with nothing to report.");
    // the check counts slides from 0; a slide flagged twice counts once
    expect(tallySlides(3, [warn(2)], [{ slide: 1 }, { slide: 2 }])).toMatchObject({
      clean: 1,
      wholeDeck: 0,
    });
    expect(tallySlides(3, [warn(null), { severity: "info", slide: 1 }], [{}]).line).toBe(
      "3 slides, 3 (100%) with nothing to report; 2 problems for the whole deck (below).",
    );
    expect(tallySlides(200, [warn(7)], []).line).toStartWith("200 slides, 199 (99%)");
  });

  test("usage errors", async () => {
    expect((await cli(["import"])).code).toBe(EXIT.usage);
    expect((await cli(["import", "keynote", "x.key"])).stderr).toContain(
      "imports Slidev and reveal.js decks",
    );
    expect((await cli(["import", "reveal"])).code).toBe(EXIT.usage);
    expect((await cli(["import", "reveal", "nowhere.html"])).stderr).toContain("does not exist");
    expect((await cli(["import", "slidev"])).code).toBe(EXIT.usage);
    expect((await cli(["import", "slidev", "nowhere.md"])).stderr).toContain("does not exist");
  });
});

const revealDemo = fileURLToPath(new URL("../../test/fixtures/reveal/demo", import.meta.url));

describe("kadal-deck import reveal", () => {
  test("a reveal.js page becomes a deck folder, its assets and CSS with it, then is checked", async () => {
    const src = join(work, "reveal-talk");
    cpSync(revealDemo, src, { recursive: true });
    const r = await cli(["import", "reveal", "reveal-talk", "--json"]);
    expect(r.code).toBe(EXIT.ok);
    const json = JSON.parse(r.stdout) as {
      ok: boolean;
      out: string;
      slides: number;
      check: { diagnostics: Array<{ severity: string; message: string }> };
    };
    expect(json.ok).toBe(true);
    expect(json.out).toBe(join(work, "reveal-talk-kadal"));
    expect(json.slides).toBe(23);
    expect(json.check.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const out = json.out;
    for (const f of [
      "deck.mdx",
      "public/assets/wave.svg",
      "src/reveal.css",
      "src/reveal/custom.css",
      "IMPORT-REPORT.md",
      "vite.config.ts",
    ])
      expect(existsSync(join(out, f))).toBe(true);
    const styles = readFileSync(join(out, "src", "styles.css"), "utf8");
    expect(styles).toContain('@import "./reveal.css";');
    expect(styles).toContain('@import "./reveal/custom.css";');
    const mdx = readFileSync(join(out, "deck.mdx"), "utf8");
    expect(mdx).toContain("backgroundImage: /assets/wave.svg");
    expect(mdx).toContain("\n----\n");
    expect(readFileSync(join(out, "IMPORT-REPORT.md"), "utf8")).toContain(
      "by `kadal-deck import reveal`",
    );
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain('<html lang="en">');
  });

  test("a folder of several pages asks which one", async () => {
    const src = join(work, "two-pages");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.html"), "<section></section>");
    writeFileSync(join(src, "b.html"), "<section></section>");
    const r = await cli(["import", "reveal", "two-pages"]);
    expect(r.code).toBe(EXIT.usage);
    expect(r.stderr).toContain("has several pages");
  });
});
