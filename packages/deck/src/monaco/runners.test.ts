import { describe, expect, test } from "bun:test";

import {
  defineCodeRunners,
  hasCodeRunner,
  loadCodeRunnerSetup,
  registerCodeRunner,
  runCode,
} from "./runners.ts";

describe("code runners", () => {
  test("built in for JS, TS and Python, by any alias", () => {
    for (const l of ["js", "javascript", "ts", "typescript", "py", "python"])
      expect(hasCodeRunner(l)).toBe(true);
    expect(hasCodeRunner("cobol")).toBe(false);
  });

  test("a registered runner streams and returns outputs, in order", async () => {
    const off = registerCodeRunner(["sql", "psql"], async (code, ctx) => {
      ctx.write({ text: `running ${code}`, level: "info" });
      return [{ text: "1 row" }, { html: "<b>done</b>" }];
    });
    const seen: string[] = [];
    const out = await runCode("select 1", "psql", {
      onOutput: (o) => seen.push(JSON.stringify(o)),
    });
    expect(out).toEqual([
      { text: "running select 1", level: "info" },
      { text: "1 row" },
      { html: "<b>done</b>" },
    ]);
    expect(seen).toHaveLength(3);
    off();
    expect(hasCodeRunner("sql")).toBe(false);
  });

  test("a runner that throws becomes an error output; no runner says how to add one", async () => {
    registerCodeRunner("boom", () => {
      throw new TypeError("nope");
    });
    expect(await runCode("x", "boom")).toEqual([{ error: "TypeError: nope" }]);
    const none = await runCode("x", "cobol");
    expect("error" in none[0]! && none[0].error).toContain('registerCodeRunner("cobol"');
  });

  test("setup/code-runners.ts: a map, or a function returning one", async () => {
    await loadCodeRunnerSetup(async () => ({
      default: defineCodeRunners(() => ({ lua: () => ({ text: "hi" }) })),
    }));
    expect(await runCode("print('hi')", "lua")).toEqual([{ text: "hi" }]);
  });

  test("a registered runner replaces the built-in", async () => {
    const off = registerCodeRunner("ts", () => ({ text: "mine" }));
    expect(await runCode("1", "typescript")).toEqual([{ text: "mine" }]);
    off();
  });
});
