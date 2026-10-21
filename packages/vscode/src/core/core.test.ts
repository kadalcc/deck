import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dropSlide, parseDeck, slideAtLine, slideHash, slideLabel, slideTree } from "./deck.ts";
import { componentSnippet, componentInfo, contextAt, keysFor, valuesFor } from "./intellisense.ts";
import { cliCommand, devCommand, localUrl, minimalEdit, parseCheck } from "./tools.ts";

const DECK = `---
title: Test deck
theme: minimal
---

# Cover

---
layout: center
---

# Two

<Notes>
Notes for two.
</Notes>

----

## Two, beneath

---

\`\`\`yaml
id: block
\`\`\`

# Three

\`\`\`yaml
---
not: frontmatter
---
\`\`\`

---
hide: true
---

# Hidden
`;

const files = (extra: Record<string, string> = {}) => {
  const all: Record<string, string> = { "/d/deck.mdx": DECK, ...extra };
  return (p: string) => all[p] ?? null;
};

describe("the deck model", () => {
  const deck = parseDeck("/d/deck.mdx", files());

  test("slides, stacks nested under their column, labels and ids", () => {
    expect(deck.slides.map((s) => [s.h, s.v, s.title])).toEqual([
      // The first slide's title is the headmatter's, as in the engine.
      [0, 0, "Test deck"],
      [1, 0, "Two"],
      [1, 1, "Two, beneath"],
      [2, 0, "Three"],
      [3, 0, "Hidden"],
    ]);
    const tree = slideTree(deck.slides);
    expect(tree.map((n) => [n.slide.index, n.children.map((c) => c.slide.index)])).toEqual([
      [0, []],
      [1, [2]],
      [3, []],
      [4, []],
    ]);
    expect(slideLabel(deck.slides[3]!)).toBe("4. Three");
    expect(slideHash(deck.slides[3]!)).toBe("#/block");
    expect(slideHash(deck.slides[1]!)).toBe("#/s1");
    expect(deck.slides[4]!.hidden).toBe(true);
  });

  test("the slide at a line", () => {
    const lines = DECK.split("\n");
    const at = (needle: string) =>
      slideAtLine(
        deck,
        "/d/deck.mdx",
        lines.findIndex((l) => l.includes(needle)),
      )?.index;
    expect(at("title: Test deck")).toBe(0);
    expect(at("# Cover")).toBe(0);
    expect(at("layout: center")).toBe(1);
    expect(at("Notes for two")).toBe(1);
    expect(at("## Two, beneath")).toBe(2);
    expect(at("not: frontmatter")).toBe(3);
    expect(at("# Hidden")).toBe(4);
    expect(slideAtLine(deck, "/d/deck.mdx", 0)?.index).toBe(0);
  });

  test("the lines that close frontmatter and the lines that start slides", () => {
    const lines = DECK.split("\n");
    expect([...deck.closeLines].map((l) => lines[l])).toEqual(["---", "---", "---"]);
    expect([...deck.startLines].sort((a, b) => a - b)).toContain(0);
  });

  test("drag and drop: the engine's moveSlide, every other byte kept", () => {
    const moved = dropSlide("/d/deck.mdx", files(), 3, 1)!;
    const after = parseDeck("/d/deck.mdx", (p) => moved.files[p] ?? null);
    expect(after.slides.map((s) => s.title)).toEqual([
      "Test deck",
      "Three",
      "Two",
      "Two, beneath",
      "Hidden",
    ]);
    // The moved slide keeps its settings (a ```yaml block comes along as --- fences).
    expect(after.slides[1]!.frontmatter).toEqual({ id: "block" });
    expect(after.slides[2]!.frontmatter).toEqual({ layout: "center" });
    // Dropped on a slide in a stack: it joins the stack.
    const stacked = dropSlide("/d/deck.mdx", files(), 4, 2)!;
    const s = parseDeck("/d/deck.mdx", (p) => stacked.files[p] ?? null).slides;
    expect(s.find((x) => x.title === "Hidden")).toMatchObject({ h: 1, v: 1 });
    expect(dropSlide("/d/deck.mdx", files(), 2, 2)).toBeNull();
  });
});

describe("IntelliSense context", () => {
  const deck = parseDeck("/d/deck.mdx", files());
  const at = (text: string, needle: string, offset = needle.length) => {
    const lines = text.split("\n");
    const line = lines.findIndex((l) => l.includes(needle));
    return contextAt(
      text,
      text === DECK ? deck : null,
      line,
      lines[line]!.indexOf(needle) + offset,
    );
  };

  test("headmatter keys (deck settings first), slide keys, values", () => {
    expect(at(DECK, "title: Test deck", 0)).toMatchObject({ kind: "key", scope: "head" });
    expect(at(DECK, "layout: center", 3)).toMatchObject({
      kind: "key",
      scope: "slide",
      prefix: "lay",
    });
    expect(at(DECK, "layout: center", 8)).toMatchObject({
      kind: "value",
      key: "layout",
      prefix: "",
    });
    expect(at(DECK, "layout: center", 10)).toMatchObject({
      kind: "value",
      key: "layout",
      prefix: "ce",
    });
    expect(at(DECK, "id: block", 2)).toMatchObject({ kind: "key", scope: "slide" });
    const head = keysFor("head").map((k) => k.name);
    expect(head.indexOf("title")).toBeLessThan(head.indexOf("layout"));
    expect(keysFor("slide").some((k) => k.name === "aspectRatio")).toBe(false);
  });

  test("a frontmatter being typed, before its closing ---", () => {
    const typing = "# A\n\n---\nlay\n\n# B\n";
    expect(contextAt(typing, null, 3, 3)).toMatchObject({
      kind: "key",
      scope: "slide",
      prefix: "lay",
    });
  });

  test("nothing in bodies, code or after a closing fence; components after <", () => {
    expect(at(DECK, "# Two", 3)).toBeNull();
    expect(at(DECK, "not: frontmatter", 3)).toBeNull();
    expect(at(DECK, "Notes for two", 3)).toBeNull();
    const body = "# A\n\nSome <Cli";
    expect(contextAt(body, null, 2, 10)).toEqual({ kind: "component", prefix: "Cli" });
  });

  test("values from the catalog; component snippets", () => {
    expect(valuesFor("layout", "slide").map((v) => v.value)).toContain("two-cols");
    expect(valuesFor("transition", "slide").map((v) => v.value)).toContain("fade");
    expect(valuesFor("hide", "slide").map((v) => v.value)).toEqual(["true", "false"]);
    expect(componentSnippet(componentInfo("Click")!)).toBe("Click>\n\t${1}\n</Click>");
  });
});

describe("tools", () => {
  test("the dev server's URL from Vite's coloured output", () => {
    expect(
      localUrl(
        "\u001b[32m  ➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m3030\u001b[22m/\u001b[39m\n",
      ),
    ).toBe("http://localhost:3030/");
    expect(localUrl("nothing yet")).toBeNull();
  });

  test("commands: a template, the local CLI, npx", () => {
    expect(devCommand("/nowhere", 3030, "pnpm kadal-deck ${args}")).toBe(
      "pnpm kadal-deck dev --port 3030 --strictPort",
    );
    expect(cliCommand("/nowhere", ["check", "--json"])).toBe(
      "npx -y -p @kadal/deck kadal-deck check --json",
    );
    const starter = join(import.meta.dir, "..", "..", "..", "..", "examples", "starter");
    expect(cliCommand(starter, ["dev"])).toMatch(/node_modules\/\.bin\/kadal-deck dev$/);
  });

  test("check --json → problems by file, 0-based", () => {
    const json = JSON.stringify({
      diagnostics: [
        {
          severity: "warning",
          code: "layout-unknown",
          message: "No layout x",
          file: "deck.mdx",
          line: 9,
          column: 9,
          hint: "Did you mean y?",
        },
        { severity: "error", code: "mdx", message: "Bad", file: "/abs/more.mdx", line: 1 },
      ],
    });
    const found = parseCheck(json, "/d");
    expect(found.get("/d/deck.mdx")![0]).toMatchObject({
      line: 8,
      column: 8,
      severity: "warning",
      hint: "Did you mean y?",
    });
    expect(found.get("/abs/more.mdx")![0]).toMatchObject({ line: 0, column: 0, severity: "error" });
    expect(parseCheck("not json", "/d").size).toBe(0);
  });

  test("the smallest edit", () => {
    expect(minimalEdit("abcdef", "abXYef")).toEqual({ start: 2, end: 4, text: "XY" });
    expect(minimalEdit("same", "same")).toBeNull();
    expect(minimalEdit("ab", "abc")).toEqual({ start: 2, end: 2, text: "c" });
  });
});

describe("the showcase reads cleanly", () => {
  test("every slide has a label and a line", () => {
    const dir = join(import.meta.dir, "..", "..", "..", "..", "examples", "showcase");
    const read = (p: string) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return null;
      }
    };
    const deck = parseDeck(join(dir, "deck.mdx"), read);
    expect(deck.problems).toEqual([]);
    expect(deck.slides.length).toBeGreaterThan(50);
    for (const s of deck.slides)
      expect(slideAtLine(deck, s.source.file, s.source.bodyLine - 1)?.index).toBe(s.index);
  });
});
