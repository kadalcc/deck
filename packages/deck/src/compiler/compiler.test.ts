import { describe, expect, test } from "bun:test";

import { deserialiseSteps, parseCodeMeta, parseLineSet, serialiseSteps } from "./code-meta.ts";
import { findMagicMoves } from "./magic-move.ts";
import { levelOf, splitDeck, titleOf } from "./split.ts";

describe("splitDeck", () => {
  test("cuts slides at --- and reads headmatter and frontmatter", () => {
    const text = `---
title: My deck
theme: minimal
---

# One

Hello

---
layout: center
---

# Two

---

# Three
`;
    const { headmatter, slides } = splitDeck(text, { file: "deck.mdx" });
    expect(headmatter).toEqual({ title: "My deck", theme: "minimal" });
    expect(slides).toHaveLength(3);
    expect(slides[0]!.content).toBe("# One\n\nHello");
    expect(slides[1]!.frontmatter).toEqual({ layout: "center" });
    expect(slides[1]!.content).toBe("# Two");
    expect(slides.map((s) => [s.h, s.v])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  test("---- makes a vertical stack under the previous slide", () => {
    const { slides } = splitDeck("# A\n\n----\n\n# A.1\n\n----\n\n# A.2\n\n---\n\n# B", {
      file: "deck.mdx",
    });
    expect(slides.map((s) => [s.h, s.v])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]);
  });

  test("a slide that starts with a paragraph is not mistaken for frontmatter", () => {
    const { slides } = splitDeck("# A\n\n---\n\nnote: this is prose\n\nmore\n\n---\n\n# C", {
      file: "deck.mdx",
    });
    expect(slides[1]!.frontmatter).toEqual({});
    expect(slides[1]!.content).toContain("note: this is prose");
  });

  test("separators inside code fences do not split", () => {
    const text = "# A\n\n```md\n---\nnot a slide\n---\n```\n\n---\n\n# B";
    const { slides } = splitDeck(text, { file: "deck.mdx" });
    expect(slides).toHaveLength(2);
    expect(slides[0]!.content).toContain("not a slide");
  });

  test("extracts <Notes> as speaker notes", () => {
    const { slides } = splitDeck("# A\n\n<Notes>\nSay **hello**.\n</Notes>\n\nBody", {
      file: "deck.mdx",
    });
    expect(slides[0]!.notes).toBe("Say **hello**.");
    expect(slides[0]!.content).toBe("# A\n\n\n\nBody");
  });

  test("src: includes another file's slides and merges frontmatter into the first", () => {
    const files: Record<string, string> = {
      "part.mdx": "---\nlayout: two\n---\n\n# P1\n\n---\n\n# P2",
    };
    const { slides } = splitDeck("# A\n\n---\nsrc: ./part.mdx\nclass: big\n---\n\n---\n\n# Z", {
      file: "deck.mdx",
      resolveInclude: (path) => {
        const key = path.replace("./", "");
        return files[key] ? { file: key, text: files[key] } : null;
      },
    });
    expect(slides.map((s) => s.content)).toEqual(["# A", "# P1", "# P2", "# Z"]);
    expect(slides[1]!.frontmatter).toEqual({ layout: "two", class: "big" });
    expect(slides[1]!.source.file).toBe("part.mdx");
  });

  test("titles and levels come from frontmatter or the first heading", () => {
    const slide = { content: "## The *Method* <br/>", frontmatter: {} };
    expect(titleOf(slide)).toBe("The Method");
    expect(levelOf(slide)).toBe(2);
    expect(titleOf({ content: "no heading", frontmatter: { title: "T" } })).toBe("T");
    expect(levelOf({ content: "", frontmatter: { level: 3 } })).toBe(3);
  });
});

describe("code meta", () => {
  test("parses Slidev steps, options and titles", () => {
    const meta = parseCodeMeta("{2-3|5|all}{lines:true,startLine:7} [app.ts]");
    expect(meta.steps).toHaveLength(3);
    expect([...meta.steps![0]!]).toEqual([2, 3]);
    expect([...meta.steps![1]!]).toEqual([5]);
    expect(meta.steps![2]).toBeNull();
    expect(meta.lines).toBe(true);
    expect(meta.startLine).toBe(7);
    expect(meta.title).toBe("app.ts");
  });

  test("parses reveal.js's attribute form and hide/none", () => {
    const meta = parseCodeMeta('data-line-numbers="3-5|8-10" data-ln-start-from="4"');
    expect(meta.lines).toBe(true);
    expect(meta.startLine).toBe(4);
    expect([...meta.steps![1]!]).toEqual([8, 9, 10]);
    const hidden = parseCodeMeta("{hide|1|none}");
    expect(hidden.hideUntilStep).toBe(true);
    expect(hidden.steps).toHaveLength(2);
    expect(hidden.steps![1]!.size).toBe(0);
  });

  test("round-trips through the data attribute", () => {
    const steps = [parseLineSet("1,3-4"), null, parseLineSet("none")];
    const text = serialiseSteps(steps);
    expect(text).toBe("1,3,4|*|none");
    const back = deserialiseSteps(text);
    expect([...back[0]!]).toEqual([1, 3, 4]);
    expect(back[1]).toBeNull();
    expect(back[2]!.size).toBe(0);
  });
});

describe("magic move", () => {
  test("lifts a magic-move block into a placeholder with precomputable steps", () => {
    const text = [
      "# Code",
      "",
      "````md magic-move {at:2} [app.js]",
      "```js",
      "let a = 1",
      "```",
      "```ts {1}",
      "let a: number = 1",
      "```",
      "````",
      "",
      "after",
    ].join("\n");
    const { text: out, blocks } = findMagicMoves(text);
    expect(out).toContain("<MagicMove block={0} />");
    expect(out).not.toContain("````");
    expect(blocks[0]!.options).toEqual({ at: "2" });
    expect(blocks[0]!.title).toBe("app.js");
    expect(blocks[0]!.steps.map((s) => s.lang)).toEqual(["js", "ts"]);
    expect(blocks[0]!.steps[1]!.meta).toBe("{1}");
  });
});

import { applySlots } from "./slots.ts";

describe("applySlots", () => {
  test("splits at ::right:: into slot divs, leaving fences alone", () => {
    const out = applySlots("left text\n\n```md\n::right::\n```\n\n::right::\n\nright text");
    expect(out).toContain('data-slot="default"');
    expect(out).toContain('data-slot="right"');
    expect(out).toContain("```md\n::right::\n```");
    expect(out.indexOf("left text")).toBeLessThan(out.indexOf("right text"));
  });
  test("passes a plain body through unchanged", () => {
    expect(applySlots("# hi\n\ntext")).toBe("# hi\n\ntext");
  });
});
