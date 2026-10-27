import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
