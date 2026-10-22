import { describe, expect, test } from "bun:test";

import {
  type DeckFiles,
  estimateClicks,
  lintDeck,
  readDeck,
  readExtensions,
  setNotes,
  updateSlide,
} from "./index.ts";

/** A deck using every piece of Slidev syntax the compiler reads natively. */
const SLIDEV = `---
title: Slidev syntax
defaults:
  transition: fade
mermaid:
  look: classic
katex:
  macros:
    "\\\\RR": "\\\\mathbb{R}"
notesAutoRuby:
  日本語: ni hon go
plantUmlServer: https://www.plantuml.com/plantuml
transitions:
  flip:
    in: flip-in
    out: flip-out
---

# One

<!-- a plain comment, mid-slide -->

Words.

<!--
The notes. [click] Next.
-->

---

\`\`\`yaml
layout: center
transition: flip
\`\`\`

# Two

<style>
h1 { color: red; }
</style>

---

\`\`\`mermaid {theme: 'neutral', scale: 0.8}
graph TD
A-->B
\`\`\`

\`\`\`plantuml
@startuml
A -> B
@enduml
\`\`\`

$$ {1|2|all}
\\begin{aligned}
a &= 1 \\\\
b &= 2
\\end{aligned}
$$

---
transition: spin
---

# Four

<style global>
.deck-stage[data-transition="spin"] { --deck-anim-in: spin-in; }
</style>

---
src: ./more.mdx#2
---
`;

const MORE = "# M1\n\n---\n\n# M2\n";

function files(
  texts: Record<string, string>,
  entry = "/d/deck.mdx",
): DeckFiles & { texts: Record<string, string> } {
  return { entry, texts, read: (p) => texts[p] ?? null };
}

const lint = (deck: string, extra: Record<string, string> = {}) =>
  lintDeck({
    files: files({ "/d/deck.mdx": deck, "/d/more.mdx": MORE, ...extra }),
    root: "/d",
    extensions: readExtensions(null),
  });
const codes = async (deck: string) =>
  (await lint(deck)).diagnostics.map((d) => `${d.severity}:${d.code}:${d.line}`);

describe("lint knows Slidev's syntax", () => {
  test("comment notes, block frontmatter, <style>, fences, ranges, defaults: no false warnings", async () => {
    const r = await lint(SLIDEV);
    expect(r.diagnostics).toEqual([]);
    expect(r.slides).toBe(5);
  });

  test("magic-move highlight steps and the Monaco type keys: no false warnings", async () => {
    const deck = [
      "---",
      "monacoTypes: cdn",
      "monacoPackages:",
      "  zod: ^3.23",
      "monacoTypesIgnore: [left-pad]",
      "monacoRunImports: https://esm.sh",
      "---",
      "",
      "````md magic-move {at:1, lines: true}",
      "```js {*|1|2-5}",
      "let count = 1",
      "```",
      "```js {*}{lines: false}",
      "let count = 2",
      "```",
      "````",
      "",
      "```ts {monaco}",
      'import { z } from "zod"',
      "```",
    ].join("\n");
    expect((await lint(deck)).diagnostics).toEqual([]);
  });

  test("helpful warnings for the mistakes", async () => {
    const bad = `---
defaults:
  layuot: center
mermaid:
  themee: dark
transitions:
  flip: true
---

# One

\`\`\`mermaid {sacle: 2}
graph TD
\`\`\`

<!-- [click] meant as notes, but not at the end -->

More text.

---
transition: flip-ish
---

# Two

<style>
h1 { color: red;
</style>

---
src: ./more.mdx#2,7
---
`;
    const c = await codes(bad);
    expect(c).toContain("warning:defaults-unknown-key:2");
    expect(c).toContain("warning:mermaid-option:2");
    expect(c).toContain("warning:transition-definition:2");
    expect(c).toContain("warning:mermaid-option:12");
    expect(c).toContain("info:comment-not-notes:16");
    expect(c).toContain("warning:transition-unknown:21");
    expect(c).toContain("warning:style-braces:26");
    expect(c.some((x) => x.startsWith("error:include-range:"))).toBe(true);
    const r = await lint(bad);
    expect(r.diagnostics.find((d) => d.code === "include-range")!.message).toContain(
      "slide 7 does not exist",
    );
    expect(r.diagnostics.find((d) => d.code === "defaults-unknown-key")!.hint).toContain("layout");
  });

  test("an unclosed comment and an unclosed <style> are named", async () => {
    const c = await codes("# A\n\n<style>\nh1 {}\n\n---\n\n# B\n\n<!-- never closed\n");
    expect(c).toContain("error:style-unclosed:3");
    expect(c).toContain("warning:comment-unclosed:10");
  });

  test("a ```yaml block on the first slide is explained, not silently code", async () => {
    const c = await codes("```yaml\nlayout: center\n```\n\n# A\n");
    expect(c).toContain("info:block-frontmatter-head:1");
  });

  test("registerTransition in the deck's source makes a name known", async () => {
    const r = await lintDeck({
      files: files({ "/d/deck.mdx": "# A\n\n---\ntransition: warp\n---\n\n# B\n" }),
      root: "/d",
      extensions: readExtensions(null, ['registerTransition("warp", { in: "warp-in" });']),
    });
    expect(r.diagnostics).toEqual([]);
  });

  test("estimates count maths steps", () => {
    expect(estimateClicks({ content: "$$ {1|2|all}\na\n$$", frontmatter: {} })).toBe(2);
  });
});

describe("edits keep Slidev's spellings", () => {
  test("block frontmatter is edited in place, and removed with its fences", () => {
    const f = files({
      "/d/deck.mdx": "# A\n\n---\n\n```yaml\nlayout: center # keep me\n```\n\n# B\n",
    });
    const patched = updateSlide(f, 1, { patch: { class: "big" } }).files["/d/deck.mdx"]!;
    expect(patched).toBe(
      "# A\n\n---\n\n```yaml\nlayout: center # keep me\nclass: big\n```\n\n# B\n",
    );
    const removed = updateSlide(f, 1, { patch: { layout: null } }).files["/d/deck.mdx"]!;
    expect(removed).toBe("# A\n\n---\n\n\n# B\n");
    expect(readDeck(files({ "/d/deck.mdx": patched })).slides[1]!.frontmatter).toEqual({
      layout: "center",
      class: "big",
    });
  });

  test("comment notes stay comments; a body edit keeps them", () => {
    const f = files({ "/d/deck.mdx": "# A\n\nText\n\n<!--\nOld notes.\n-->\n" });
    const set = setNotes(f, 0, "New notes. [click] More.").files["/d/deck.mdx"]!;
    expect(set).toBe("# A\n\nText\n\n<!--\nNew notes. [click] More.\n-->\n");
    const body = updateSlide(f, 0, { content: "# A2\n\nOther" }).files["/d/deck.mdx"]!;
    expect(body).toContain("<!--\nOld notes.\n-->");
    expect(readDeck(files({ "/d/deck.mdx": body })).slides[0]!.notes).toBe("Old notes.");
  });
});
