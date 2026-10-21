import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHighlighter } from "shiki";

// The language grammar, run through a TextMate engine (Shiki's) with VS Code's own Markdown and
// YAML grammars underneath, the way the editor does.
const grammar = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "syntaxes", "kadal-deck.tmLanguage.json"), "utf8"),
);

const DECK = `---
title: Grammar
---

# Cover

---
layout: two-cols
---

Left

::right::

Right

<<< @/snippets/a.ts#one {2}

::code-group

\`\`\`sh [npm]
---
not a separator
\`\`\`

::

<Notes>
Say it. [click] Then this.
</Notes>

----

## Beneath

<!--
Comment notes [click:2]
-->
`;

describe("the Kadal Deck grammar", async () => {
  const hl = await createHighlighter({
    themes: ["github-dark"],
    langs: [
      "markdown",
      "yaml",
      { ...grammar, name: "kadal-deck", embeddedLangs: ["markdown", "yaml"] },
    ],
  });
  const lines = hl.codeToTokens(DECK, {
    lang: "kadal-deck",
    theme: "github-dark",
    includeExplanation: true,
  }).tokens;
  const scopesOf = (needle: string) => {
    const i = DECK.split("\n").findIndex((l) => l.includes(needle));
    const tok =
      lines[i]!.find((t) => t.content.includes(needle.trim().split(/\s+/)[0]!)) ?? lines[i]![0]!;
    return (tok.explanation ?? []).flatMap((e) => e.scopes.map((s) => s.scopeName));
  };
  const lineScopes = (index: number) =>
    lines[index]!.flatMap((t) =>
      (t.explanation ?? []).flatMap((e) => e.scopes.map((s) => s.scopeName)),
    );

  test("separators, the headmatter and frontmatter as YAML", () => {
    expect(lineScopes(0)).toContain("keyword.control.separator.kadal-deck");
    expect(scopesOf("title: Grammar")).toContain("meta.embedded.block.frontmatter.kadal-deck");
    expect(scopesOf("title: Grammar").some((s) => s.endsWith(".yaml"))).toBe(true);
    expect(scopesOf("layout: two-cols")).toContain("meta.embedded.block.frontmatter.kadal-deck");
    expect(scopesOf("# Cover")).not.toContain("meta.embedded.block.frontmatter.kadal-deck");
    expect(scopesOf("Left")).not.toContain("meta.embedded.block.frontmatter.kadal-deck");
    const vertical = DECK.split("\n").indexOf("----");
    expect(lineScopes(vertical)).toContain("keyword.control.separator.kadal-deck");
  });

  test("slot markers, code groups, snippet imports", () => {
    expect(lineScopes(DECK.split("\n").indexOf("::right::"))).toContain(
      "entity.name.section.slot.kadal-deck",
    );
    expect(lineScopes(DECK.split("\n").indexOf("::code-group"))).toContain(
      "keyword.control.code-group.kadal-deck",
    );
    expect(scopesOf("<<< @/snippets")).toContain("keyword.control.import.kadal-deck");
  });

  test("a paragraph does not swallow the separator after it (no setext heading)", () => {
    const t = hl.codeToTokens("A paragraph\n\n---\n\n# Next\n\nMore\n----\n", {
      lang: "kadal-deck",
      theme: "github-dark",
      includeExplanation: true,
    }).tokens;
    const scopes = (i: number) =>
      t[i]!.flatMap((x) => (x.explanation ?? []).flatMap((e) => e.scopes.map((s) => s.scopeName)));
    expect(scopes(2)).toContain("keyword.control.separator.kadal-deck");
    expect(scopes(7)).toContain("keyword.control.separator.kadal-deck");
    expect(scopes(7).some((s) => s.includes("setext"))).toBe(false);
  });

  test("a --- inside code is code, not a separator", () => {
    const i = DECK.split("\n").indexOf("not a separator") - 1;
    expect(lineScopes(i)).not.toContain("keyword.control.separator.kadal-deck");
  });

  test("notes, with their [click] markers", () => {
    expect(scopesOf("Say it.")).toContain("comment.block.notes.kadal-deck");
    expect(scopesOf("[click]")).toContain("keyword.other.click.kadal-deck");
    expect(scopesOf("Comment notes")).toContain("comment.block.html.kadal-deck");
  });
});
