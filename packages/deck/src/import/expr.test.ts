import { describe, expect, test } from "bun:test";

import { evaluate, scriptConsts, toJs, translateClass, translateExpr } from "./expr.ts";
import { parseSlidev } from "./parse.ts";

describe("Vue expressions, read without running them", () => {
  test("literals, objects, operators and template strings are static", () => {
    expect(evaluate("{ x: -80, transition: { delay: 2000 } }")).toEqual({
      kind: "static",
      value: { x: -80, transition: { delay: 2000 } },
    });
    expect(evaluate("[2, 4]")).toEqual({ kind: "static", value: [2, 4] });
    expect(evaluate("'+2'")).toEqual({ kind: "static", value: "+2" });
    expect(evaluate("1 + 2 * 3")).toEqual({ kind: "static", value: 7 });
    expect(evaluate("a ? 'x' : 'y'", { a: false })).toEqual({ kind: "static", value: "y" });
    expect(evaluate("`v${1 + 1}`")).toEqual({ kind: "static", value: "v2" });
    expect(evaluate("{ ...base, y: 1 }", { base: { x: 0 } })).toEqual({
      kind: "static",
      value: { x: 0, y: 1 },
    });
  });

  test("names come from the scope; Slidev's runtime is named, not guessed", () => {
    expect(evaluate("final", { final: { x: 0 } })).toEqual({ kind: "static", value: { x: 0 } });
    expect(evaluate("$frontmatter.title", { $frontmatter: { title: "Hi" } })).toEqual({
      kind: "static",
      value: "Hi",
    });
    expect(evaluate("$slidev.configs.title", { $slidev: { configs: { title: "Deck" } } })).toEqual({
      kind: "static",
      value: "Deck",
    });
    expect(evaluate("$slidev.nav.currentPage", { $slidev: { configs: {} } })).toEqual({
      kind: "runtime",
      path: "$slidev.nav.currentPage",
    });
    expect(evaluate("$clicks > 2").kind).toBe("unknown");
    expect(evaluate("foo").kind).toBe("unknown");
    expect(evaluate("fn()").kind).toBe("unknown");
    expect(evaluate("x = 1").kind).toBe("unknown");
  });

  test("values print as JavaScript for JSX", () => {
    expect(toJs({ x: -80, "a-b": [1, "two"], y: undefined })).toBe('{ x: -80, "a-b": [1, "two"] }');
  });

  test("a <script setup>'s static consts are read; the rest is listed", () => {
    const { consts, rest } = scriptConsts(`
      import { ref } from 'vue'
      const final = {
        x: 0,
        transition: { type: 'spring', damping: 10 },
      }
      const twice = final.x * 2
      const count = ref(0)
    `);
    expect(consts).toEqual({
      final: { x: 0, transition: { type: "spring", damping: 10 } },
      twice: 0,
    });
    expect(rest).toEqual(["import { ref } from 'vue'", "const count = ref(0)"]);
  });

  test("translate: names through a resolver, `.value` dropped, template strings kept", () => {
    const resolve = (n: string) =>
      n === "props" ? "p" : ["counter", "item"].includes(n) ? n : null;
    expect(translateExpr("counter.value + 1", resolve)).toBe("counter + 1");
    expect(translateExpr("props.count * 2", resolve)).toBe("p.count * 2");
    expect(translateExpr("`#/${item}`", resolve)).toBe("`#/${item}`");
    expect(translateExpr("unknown + 1", resolve)).toBeNull();
    expect(
      translateExpr("$slidev.nav.currentPage", resolve, (p) =>
        p === "$slidev.nav.currentPage" ? "props.page" : undefined,
      ),
    ).toBe("props.page");
  });

  test("translate a :class binding: objects keep the keys that hold", () => {
    const resolve = (n: string) => (n === "active" ? "p.active" : null);
    expect(translateClass("{ 'text-red': active, big: true }", resolve)).toEqual({
      js: '[(p.active) ? "text-red" : "", (true) ? "big" : ""].filter(Boolean).join(" ")',
      tokens: ["text-red", "big"],
    });
    expect(translateClass("active ? '!opacity-100' : ''", resolve)?.tokens).toEqual([
      "!opacity-100",
    ]);
  });
});

describe("cutting a Slidev file into slides, as Slidev does", () => {
  test("headmatter, frontmatter, bare separators and notes", () => {
    const slides = parseSlidev(
      [
        "---",
        "theme: seriph",
        "---",
        "",
        "# One",
        "",
        "<!-- not a note -->",
        "",
        "text",
        "",
        "<!--",
        "The note",
        "-->",
        "",
        "---",
        "layout: center",
        "---",
        "",
        "# Two",
        "",
        "---",
        "",
        "# Three",
      ].join("\n"),
    );
    expect(slides.map((s) => s.frontmatter)).toEqual([
      { theme: "seriph" },
      { layout: "center" },
      {},
    ]);
    expect(slides[0]!.note).toBe("The note");
    expect(slides[0]!.body).toContain("<!-- not a note -->");
    expect(slides[0]!.bodyLine).toBe(4);
    expect(slides[1]!.frontmatterLine).toBe(16);
    expect(slides[2]!.body.trim()).toBe("# Three");
  });

  test("dashes inside code fences and comments do not cut; four dashes do", () => {
    const slides = parseSlidev(
      [
        "# A",
        "",
        "```yaml",
        "---",
        "x: 1",
        "---",
        "```",
        "",
        "<!--",
        "---",
        "-->",
        "----",
        "",
        "# B",
      ].join("\n"),
    );
    expect(slides.length).toBe(2);
    expect(slides[1]!.body.trim()).toBe("# B");
  });

  test("a ```yaml block opening a slide is its frontmatter", () => {
    const slides = parseSlidev(
      ["# A", "", "---", "", "```yaml", "layout: center", "```", "", "# B"].join("\n"),
    );
    expect(slides[1]!.frontmatter).toEqual({ layout: "center" });
    expect(slides[1]!.body.trim()).toBe("# B");
  });

  test("bad YAML is reported, not thrown", () => {
    const slides = parseSlidev(["---", "a: [1, 2", "---", "# A"].join("\n"));
    expect(slides[0]!.yamlError).toBeTruthy();
    expect(slides[0]!.frontmatter).toEqual({});
  });
});
