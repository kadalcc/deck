import { describe, expect, test } from "bun:test";

import { compileDeck } from "./compile.ts";
import { shellBase } from "./shell.tsx";

const deck = `---
title: Test talk
---

# Hello

Some **bold** words.

<Notes>Say hello. [click] Then the second point.</Notes>

---
layout: center
id: code
---

## Code

\`\`\`ts {1|2}
const a = 1;
const b = 2;
\`\`\`
`;

describe("compileDeck", () => {
  test("compiles slides, notes and code like the Vite plugin", async () => {
    const out = await compileDeck(deck);
    expect(out.ok).toBe(true);
    expect(out.diagnostics).toEqual([]);
    expect(out.manifest.slides).toHaveLength(2);
    const [a, b] = out.manifest.slides;
    // As in the Vite plugin, the first slide takes the headmatter title.
    expect(a!.title).toBe("Test talk");
    expect(a!.notesText).toBe("Say hello. [click] Then the second point.");
    expect(a!.hasNotes).toBe(true);
    expect(b!.id).toBe("code");
    expect(b!.frontmatter.layout).toBe("center");
    const mod = await b!.load();
    expect(typeof mod.default).toBe("function");
    expect(await a!.loadNotes!()).toHaveProperty("default");
  });

  test("a slide that does not compile renders its error and is reported with a line", async () => {
    const out = await compileDeck(`# Fine\n\n---\n\n# Broken\n\n<div>\n`);
    expect(out.ok).toBe(false);
    const err = out.diagnostics.find((d) => d.severity === "error")!;
    expect(err.slide).toBe(1);
    expect(err.line).toBeGreaterThan(0);
    expect(out.manifest.slides).toHaveLength(2);
    expect(typeof (await out.manifest.slides[1]!.load()).default).toBe("function");
  });

  test("imports are refused with a plain message", async () => {
    const out = await compileDeck(`import X from "./x.tsx"\n\n# Hi\n`);
    expect(out.ok).toBe(false);
    expect(out.diagnostics[0]!.message).toContain("`import` is not available");
  });

  test("includes come from `files`, and missing ones are listed", async () => {
    const text = `# One\n\n---\nsrc: ./more.mdx\n---\n`;
    const without = await compileDeck(text);
    expect(without.missing).toEqual(["more.mdx"]);
    const withIt = await compileDeck(text, { files: { "more.mdx": "# Two\n\n---\n\n# Three\n" } });
    expect(withIt.ok).toBe(true);
    expect(withIt.missing).toEqual([]);
    expect(withIt.manifest.slides.map((s) => s.title)).toEqual(["One", "Two", "Three"]);
  });
});

describe("settings without their closing ---", () => {
  test("are reported as a warning on the slide, and the deck still compiles", async () => {
    const out = await compileDeck(`# One\n\n---\nbackground: spotlight\n\n## Two\n`);
    expect(out.ok).toBe(true);
    const w = out.diagnostics.filter((d) => d.severity === "warning");
    expect(w).toHaveLength(1);
    expect(w[0]!.slide).toBe(1);
    expect(w[0]!.message).toContain("`background:`");
    expect(w[0]!.message).toContain("Put `---` on the line after");
    const fenced = await compileDeck(`# One\n\n---\nbackground: spotlight\n---\n\n## Two\n`);
    expect(fenced.diagnostics).toEqual([]);
  });
});

describe("the code kit in the browser", () => {
  const deck =
    "# One\n\n<<< @/snippets/a.ts#r {1}\n\n::code-group\n\n```sh [npm]\nnpm i\n```\n\n::\n\n```ts\nconst a = 1 // [!code ++]\n```\n";
  test("a snippet not in `files` is reported missing, then read from it", async () => {
    const first = await compileDeck(deck);
    expect(first.missing).toEqual(["snippets/a.ts"]);
    expect(first.ok).toBe(true);
    expect(first.diagnostics.map((d) => d.severity)).toEqual(["warning"]);
    const second = await compileDeck(deck, {
      files: { "snippets/a.ts": "// #region r\nexport const a = 1\n// #endregion r\n" },
    });
    expect(second.missing).toEqual([]);
    expect(second.diagnostics).toEqual([]);
  });

  test("custom transformers run after the notation ones", async () => {
    let ran = 0;
    const out = await compileDeck("```ts\nconst a = 1\n```", {
      shiki: {
        transformers: [
          {
            name: "count",
            pre() {
              ran++;
            },
          },
        ],
      },
    });
    expect(out.ok).toBe(true);
    expect(ran).toBe(1);
  });
});

describe("shellBase", () => {
  test("works out the deck root from the address", () => {
    expect(shellBase("/@me/talk/")).toBe("/@me/talk/");
    expect(shellBase("/@me/talk/presenter")).toBe("/@me/talk/");
    expect(shellBase("/@me/talk/join")).toBe("/@me/talk/");
    expect(shellBase("/@me/talk/index.html")).toBe("/@me/talk/");
    expect(shellBase("/")).toBe("/");
    expect(shellBase("/anything", "/@host/given/")).toBe("/@host/given/");
  });
});
