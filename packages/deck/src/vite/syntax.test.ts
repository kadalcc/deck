import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type DeckPluginOptions, deck } from "./index.ts";

/**
 * The Vite plugin's side of the Slidev syntax (the runtime compiler's is in
 * compiler/slidev-syntax.test.ts): the manifest and the slide/notes modules it emits.
 */
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

async function build(
  text: string,
  options: DeckPluginOptions = {},
  extra: Record<string, string> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "kadal-syntax-"));
  dirs.push(dir);
  writeFileSync(join(dir, "deck.mdx"), text);
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body);
  const plugin = deck(options) as unknown as {
    configResolved(c: unknown): void;
    load(this: unknown, id: string): Promise<string | null>;
  };
  plugin.configResolved({ root: dir, base: "/", build: { outDir: "dist" }, command: "build" });
  const ctx = { resolve: async () => null };
  const load = (id: string) => plugin.load.call(ctx, `\0virtual:deck${id}`) as Promise<string>;
  return { manifest: await load(""), load };
}

describe("the Vite plugin reads Slidev's syntax", () => {
  test("comment notes, block frontmatter, defaults, ranges, scoped styles in the manifest", async () => {
    const { manifest, load } = await build(
      `---
defaults:
  class: from-defaults
notesAutoRuby:
  日本語: ni hon go
---

# One

<!-- dropped -->

Body text.

<!--
日本語 notes. [click] Next.
-->

---

\`\`\`yaml
layout: center
\`\`\`

# Two

<style>
h1 { color: red; }
</style>

---
src: ./more.mdx#2
---
`,
      {},
      { "more.mdx": "# M1\n\n---\n\n# M2\n" },
    );
    expect(manifest).toContain('notesText: "日本語 notes. [click] Next."');
    expect(manifest).toContain('"layout":"center"');
    expect(manifest).toContain('"class":"from-defaults"');
    expect(manifest).toContain('title: "M2"');
    expect(manifest).not.toContain('title: "M1"');
    expect(manifest).toContain(
      'export const styles = "/* slide 2 */\\n.deck-slide[data-index=\\"1\\"] h1',
    );
    const notes = await load("/notes/0");
    expect(notes).toContain("_components.ruby");
    expect(notes).toContain('"ni hon go"');
    const slide = await load("/slide/0");
    expect(slide).not.toContain("dropped");
  });

  test("fences and maths lines compile to the engine's components", async () => {
    const { load } = await build(
      "```mermaid {theme: 'neutral'}\ngraph TD\nA-->B\n```\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```\n\n$$ {1|all}\na + b\n$$\n",
    );
    const slide = await load("/slide/0");
    expect(slide).toContain("_jsx(Mermaid, {");
    expect(slide).toMatch(/src: "https:\/\/www\.plantuml\.com\/plantuml\/svg\/[0-9A-Za-z_-]+"/);
    expect(slide).toContain("_jsx(KatexLines, {");
  });

  test("withoutNotes: no notes anywhere; setup hooks run; mermaid config reaches the manifest", async () => {
    const seen: string[] = [];
    const { manifest, load } = await build(
      '---\nkatex:\n  macros:\n    "\\\\RR": "\\\\mathbb{R}"\n---\n\n# @@T@@ $\\RR$\n\n<Notes>secret</Notes>\n\n<!-- also secret -->\n',
      {
        withoutNotes: true,
        preprocess: (t) => t.replace("@@T@@", "Pre"),
        remarkPlugins: [() => () => void seen.push("remark")],
        rehypePlugins: [() => () => void seen.push("rehype")],
        mermaid: { look: "handDrawn" },
      },
    );
    expect(manifest).toContain("hasNotes: false");
    expect(manifest).toContain("notesText: null");
    expect(manifest).toContain("loadNotes: null");
    expect(manifest).not.toContain("secret");
    expect(manifest).toContain('"mermaid":{"look":"handDrawn"}');
    expect(manifest).toContain('title: "Pre');
    const slide = await load("/slide/0");
    expect(slide).toContain("mathbb");
    expect(seen).toEqual(["remark", "rehype"]);
    expect(await load("/notes/0")).not.toContain("secret");
  });

  test("KADAL_DECK_WITHOUT_NOTES=1 (what --without-notes sets) does the same", async () => {
    process.env.KADAL_DECK_WITHOUT_NOTES = "1";
    try {
      const { manifest } = await build("# A\n\n<!-- notes -->\n");
      expect(manifest).toContain("hasNotes: false");
    } finally {
      delete process.env.KADAL_DECK_WITHOUT_NOTES;
    }
  });
});
