import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { UsageError, parseArgs } from "./args.ts";
import { EXIT, main } from "./index.ts";

const work = mkdtempSync(join(tmpdir(), "kadal-deck-cmd-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Run the CLI in-process, capturing stdout and stderr. */
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

describe("parseArgs", () => {
  const specs = {
    out: { kind: "string" as const, short: "o" },
    png: { kind: "boolean" as const },
    scale: { kind: "number" as const },
    upload: { kind: "optional-string" as const },
    slide: { kind: "string" as const, multiple: true },
  };

  test("--flag value, --flag=value, -s value, booleans, --no-*, positionals", () => {
    const r = parseArgs(
      [
        "a",
        "--out",
        "x",
        "--scale=2",
        "-o",
        "y",
        "--png",
        "--no-png",
        "b",
        "--slide",
        "1",
        "--slide=2",
      ],
      specs,
    );
    expect(r.flags).toEqual({ out: "y", scale: 2, png: false, slide: ["1", "2"] });
    expect(r.positionals).toEqual(["a", "b"]);
  });

  test("optional values, -- and errors", () => {
    expect(parseArgs(["--upload"], specs).flags.upload).toBe(true);
    expect(parseArgs(["--upload", "--png"], specs).flags).toEqual({ upload: true, png: true });
    expect(parseArgs(["--upload", "https://h"], specs).flags.upload).toBe("https://h");
    expect(parseArgs(["--", "--png"], specs).positionals).toEqual(["--png"]);
    expect(() => parseArgs(["--nope"], specs)).toThrow(UsageError);
    expect(() => parseArgs(["--out"], specs)).toThrow(/needs a value/);
    expect(() => parseArgs(["--scale", "big"], specs)).toThrow(/number/);
    expect(() => parseArgs(["--png=maybe"], specs)).toThrow(/switch/);
  });

  test("passthrough keeps unknown flags (and their values) for Vite", () => {
    const r = parseArgs(
      ["--port", "5300", "--host", "--out=x"],
      { out: { kind: "string" } },
      { passthrough: true },
    );
    expect(r.rest).toEqual(["--port", "5300", "--host"]);
    expect(r.flags.out).toBe("x");
  });
});

describe("kadal-deck commands", () => {
  test("usage errors exit 2; a folder without a deck exits 4", async () => {
    expect((await cli(["frobnicate"])).code).toBe(EXIT.usage);
    expect((await cli(["check", "--bogus"])).code).toBe(EXIT.usage);
    const missing = await cli(["check", "--json"]);
    expect(missing.code).toBe(EXIT.missing);
    expect(JSON.parse(missing.stdout).error.code).toBe("missing_prerequisite");
  });

  test("contrast checks its flags before a browser starts; no deck exits 4", async () => {
    expect((await cli(["contrast", "--scheme", "sepia"])).code).toBe(EXIT.usage);
    expect((await cli(["contrast", "--min", "30"])).code).toBe(EXIT.usage);
    expect((await cli(["contrast", "--percentile", "120"])).code).toBe(EXIT.usage);
    expect((await cli(["contrast", "--range", "two"])).code).toBe(EXIT.usage);
    expect((await cli(["contrast", "--json"])).code).toBe(EXIT.missing);
  });

  test("--version and --json keep stdout to one document", async () => {
    const v = await cli(["--version", "--json"]);
    expect(JSON.parse(v.stdout).version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("build --json and dev --json keep --json for themselves, not Vite", async () => {
    // A deck whose `vite` notes its arguments and leaves the build record the plugin would.
    const dir = join(work, "json-deck");
    const bin = join(dir, "node_modules", "vite", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"json-deck","private":true}');
    writeFileSync(join(dir, "deck.mdx"), "# One\n");
    writeFileSync(
      join(dir, "node_modules", "vite", "package.json"),
      '{"name":"vite","version":"0.0.0","bin":{"vite":"bin/vite.js"}}',
    );
    const argvFile = join(dir, "argv.json");
    writeFileSync(
      join(bin, "vite.js"),
      `const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(args));
// Vite's CLI refuses an option it does not know, as the real one does.
if (args.includes("--json")) { console.error("CACError: Unknown option --json"); process.exit(1); }
if (process.env.KADAL_DECK_BUILD_RECORD)
  fs.writeFileSync(process.env.KADAL_DECK_BUILD_RECORD, JSON.stringify({ entry: "deck.mdx", outDir: "dist", base: "/talk/", title: "One" }));
`,
    );
    const built = await cli(["build", "--json", "--base", "/talk/", "--no-download"], dir);
    expect(built.code).toBe(EXIT.ok);
    expect(JSON.parse(readFileSync(argvFile, "utf8"))).toEqual(["build", "--base", "/talk/"]);
    const out = JSON.parse(built.stdout);
    expect(out.ok).toBe(true);
    expect(out.builds).toEqual([
      { entry: "deck.mdx", outDir: "dist", base: "/talk/", title: "One" },
    ]);

    const dev = await cli(["dev", "--json", "--port", "5999"], dir);
    expect(dev.code).toBe(EXIT.ok);
    expect(JSON.parse(readFileSync(argvFile, "utf8"))).toEqual(["--port", "5999"]);
    expect(JSON.parse(dev.stdout)).toEqual({ ok: true });
  });

  test("info lists sections, entries, and searches", async () => {
    const sections = JSON.parse((await cli(["info", "--json"])).stdout);
    expect(sections.sections.map((s: { name: string }) => s.name)).toContain("components");
    const poll = JSON.parse((await cli(["info", "components", "Poll", "--json"])).stdout);
    expect(poll.entry.props.map((p: { name: string }) => p.name)).toContain("question");
    const hits = JSON.parse((await cli(["info", "--search", "two columns", "--json"])).stdout);
    expect(hits.hits[0].name).toBe("two-cols");
    expect((await cli(["info", "nope"])).code).toBe(EXIT.usage);
    const md = await cli(["info", "layouts"]);
    expect(md.stdout).toContain("two-cols");
  });

  test("new scaffolds without questions; check reads it", async () => {
    const made = await cli([
      "new",
      "my-talk",
      "--title",
      "Rivers of Chennai",
      "--no-install",
      "--json",
    ]);
    expect(made.code).toBe(EXIT.ok);
    const r = JSON.parse(made.stdout);
    expect(r).toMatchObject({ ok: true, title: "Rivers of Chennai", installed: false });
    for (const f of ["deck.mdx", "AGENTS.md", "CLAUDE.md", ".gitignore", "src/components.tsx"])
      expect(r.files).toContain(f);
    const deck = readFileSync(join(work, "my-talk", "deck.mdx"), "utf8");
    expect(deck).toContain('title: "Rivers of Chennai"');
    expect(deck).toContain("# Rivers of Chennai");
    const pkg = JSON.parse(readFileSync(join(work, "my-talk", "package.json"), "utf8"));
    expect(pkg.name).toBe("my-talk");
    expect(pkg.dependencies["@kadal/deck"]).toMatch(/^\^\d/);
    // Not empty any more: refuse, as a usage error.
    expect((await cli(["new", "my-talk", "--no-install"])).code).toBe(EXIT.usage);
    // Global options may come before the command.
    expect((await cli(["-C", "my-talk", "check"])).code).toBe(EXIT.ok);
    expect((await cli(["--json", "--dir", "my-talk", "check"])).code).toBe(EXIT.ok);

    const ok = await cli(["check", "--dir", "my-talk", "--json"]);
    expect(ok.code).toBe(EXIT.ok);
    expect(JSON.parse(ok.stdout)).toMatchObject({ ok: true, errors: 0 });

    writeFileSync(
      join(work, "my-talk", "deck.mdx"),
      `${deck}\n---\nlayout: nope\n---\n\n<Missing />\n`,
    );
    const bad = await cli(["check", "-C", "my-talk", "--json"]);
    expect(bad.code).toBe(EXIT.failed);
    const codes = JSON.parse(bad.stdout).diagnostics.map(
      (d: { code: string; file: string }) => `${d.code}@${d.file}`,
    );
    expect(codes).toEqual(["layout-unknown@deck.mdx", "component-unknown@deck.mdx"]);
    const human = await cli(["check", "-C", "my-talk"]);
    expect(human.stdout).toMatch(/deck\.mdx:\d+ +error +Unknown layout "nope"/);
    expect(existsSync(join(work, "my-talk", "node_modules"))).toBe(false);
  }, 30_000);

  test("what is missing or misnamed is said before any work starts", async () => {
    // A mistyped -C: the deck's folder, not "spawn node ENOENT" from a Vite found further up.
    for (const command of ["build", "dev", "export"]) {
      const r = await cli([command, "-C", "no-such-folder", "--json"]);
      expect(r.code, command).toBe(EXIT.missing);
      expect(JSON.parse(r.stdout).error.message, command).toContain("No deck.mdx in");
      expect(r.stderr, command).not.toContain("vite build");
    }
    // new into a file, and new with a misspelt --ci host: refused, and nothing is made.
    writeFileSync(join(work, "a-file.mdx"), "# x\n");
    const file = await cli(["new", "a-file.mdx", "--no-install"]);
    expect(file.code).toBe(EXIT.usage);
    expect(file.stderr).toContain("is a file");
    const ci = await cli(["new", "ci-typo", "--no-install", "--ci", "netlify,netlfy"]);
    expect(ci.code).toBe(EXIT.usage);
    expect(existsSync(join(work, "ci-typo"))).toBe(false);
    // check names no other deck than its folder's (it used to check deck.mdx and pass).
    const other = await cli(["check", "-C", "my-talk", "talk.mdx"]);
    expect(other.code).toBe(EXIT.usage);
    expect(other.stderr).toContain('not "talk.mdx"');
    expect((await cli(["check", "-C", "my-talk", "deck.mdx"])).code).not.toBe(EXIT.usage);
    expect((await cli(["check", "my-talk"])).code).toBe(EXIT.usage);
  }, 30_000);

  test("export without Playwright exits 4 with what to run, before posters and the build", () => {
    // The deck's `vite` leaves a mark if anything runs it; Playwright resolves to a module without
    // a browser, as when it is not installed.
    const dir = join(work, "no-playwright");
    mkdirSync(join(dir, "node_modules", "vite", "bin"), { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"no-playwright","private":true}');
    writeFileSync(join(dir, "deck.mdx"), "# One\n");
    writeFileSync(
      join(dir, "node_modules", "vite", "package.json"),
      '{"name":"vite","version":"0.0.0","bin":{"vite":"bin/vite.js"}}',
    );
    const mark = join(dir, "vite-ran");
    writeFileSync(
      join(dir, "node_modules", "vite", "bin", "vite.js"),
      `require("node:fs").writeFileSync(${JSON.stringify(mark)}, "");`,
    );
    writeFileSync(
      join(dir, "preload.ts"),
      `Bun.plugin({ setup(b) { b.module("playwright", () => ({ exports: {}, loader: "object" })); } });`,
    );
    const index = pathToFileURL(resolve(import.meta.dir, "index.ts")).href;
    writeFileSync(
      join(dir, "driver.ts"),
      `import { main } from ${JSON.stringify(index)};
process.exit(await main(["export", "--json"], ${JSON.stringify(dir)}));`,
    );
    const r = spawnSync(
      process.execPath,
      ["--preload", join(dir, "preload.ts"), join(dir, "driver.ts")],
      {
        encoding: "utf8",
        cwd: dir,
      },
    );
    expect(r.status).toBe(EXIT.missing);
    expect(JSON.parse(r.stdout).error.message).toContain("npx playwright install chromium");
    expect(existsSync(mark)).toBe(false);
    expect(r.stderr).not.toContain("vite build");
  }, 30_000);

  test("whoami and publish without a login exit 3 with instructions", async () => {
    const env = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      KADAL_DECK_TOKEN: process.env.KADAL_DECK_TOKEN,
    };
    process.env.XDG_CONFIG_HOME = join(work, "no-config");
    delete process.env.KADAL_DECK_TOKEN;
    try {
      const who = await cli(["whoami", "--json"]);
      expect(who.code).toBe(EXIT.auth);
      expect(JSON.parse(who.stdout)).toMatchObject({ ok: false, signedIn: false });
      const pub = await cli(["publish", "--json", "-C", "my-talk"]);
      expect(pub.code).toBe(EXIT.auth);
      expect(JSON.parse(pub.stdout).error.message).toContain("kadal-deck login");
    } finally {
      for (const [k, v] of Object.entries(env))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });
});
