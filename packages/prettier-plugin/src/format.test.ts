import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as prettier from "prettier";

// The engine's own reading of a deck, to hold this package's to it (source, not dist).
import { splitDeck } from "../../deck/src/compiler/split.ts";
import { sameMeaning } from "./guard.ts";
import plugin, { cutDeck, formatDeck } from "./index.ts";
import { mask, unmask } from "./protect.ts";

const fixtures = join(import.meta.dir, "..", "test", "fixtures");
const showcase = join(import.meta.dir, "..", "..", "..", "examples", "showcase");
const read = (p: string) => readFileSync(p, "utf8");

const showcaseFiles = [
  join(showcase, "deck.mdx"),
  ...readdirSync(join(showcase, "slides"))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => join(showcase, "slides", f)),
];
const fixtureFiles = readdirSync(fixtures).map((f) => join(fixtures, f));

/** What the engine makes of a text: slides, stacking, frontmatter, notes, styles. */
function engine(text: string) {
  const { headmatter, slides } = splitDeck(text, {
    file: "deck.mdx",
    // Includes count as one slide each here: only the including file is being formatted.
    resolveInclude: (path) => ({ file: path, text: `# ${path}` }),
    onError: () => {},
  });
  return {
    headmatter,
    slides: slides.map((s) => ({
      h: s.h,
      v: s.v,
      frontmatter: s.frontmatter,
      notes: s.notes,
      styles: s.styles.map((x) => x.css),
    })),
  };
}

describe("cutDeck reads a deck as the engine does", () => {
  for (const file of [...showcaseFiles, ...fixtureFiles])
    test(file.split("/").slice(-2).join("/"), () => {
      const text = read(file);
      const pieces = cutDeck(text);
      // An include (`src:`) brings another file's slides: counted on neither side here.
      const ours = pieces.filter(
        (p, i) =>
          !/^src:/m.test(p.frontmatter?.yaml ?? "") &&
          (p.body.join("").trim() || (i > 0 && p.frontmatter)),
      );
      const theirs = splitDeck(text, {
        file: "deck.mdx",
        resolveInclude: () => null,
        onError: () => {},
      });
      expect(ours.length).toBe(theirs.slides.length);
    });
});

describe("formatDeck", () => {
  test("normalises separators and frontmatter, keeps the sugar byte for byte", async () => {
    const src = read(join(fixtures, "tricky.mdx"));
    const { text, kept } = await formatDeck(src, prettier);
    expect(kept).toEqual([]);
    // The headmatter: no blank lines above it, comments kept, values unchanged, order unchanged.
    expect(
      text.startsWith(
        "---\n# the deck's settings\ntitle: Tricky   deck\ntheme: minimal # trailing comment\ntransition: slide\n---\n\n# First slide\n",
      ),
    ).toBe(true);
    // Separators: exactly --- or ----, never with trailing spaces or five dashes.
    for (const line of text.split("\n")) if (/^-{3,}/.test(line)) expect(line).toMatch(/^-{3,4}$/);
    expect(text).toContain("## Centred\n\n----\n\n### Beneath (five dashes)");
    expect(text).toContain("----\nbackground: mesh\n---\n\n### Beneath with settings");
    // Markdown is Prettier's: - bullets, _emphasis_, **strong**.
    expect(text).toContain("Some _emphasis_ and **strong** text.\n\n- one\n- two");
    // Protected: block frontmatter, the ::slot::, the YAML-with-dashes fence, magic-move, notes,
    // the stepped maths, the code group, the snippet import and the trailing comment notes.
    for (const kept of [
      "```yaml\nid: block-fm\nlayout: two-cols\n```",
      "\n::right::\n",
      "```yaml [example.yml]\n# a YAML example, not settings\n---\nkey: value\n---\n```",
      "````md magic-move {at:2}\n```ts\nconst a = 1\n```\n```ts\nconst a = 2\n```\n````",
      "<Notes>\nA note with *markdown*   and --- inside.\n</Notes>",
      "$$ {1|3}\na = 1 \\\\\nb = 2 \\\\\nc = 3\n$$",
      "::code-group\n\n```sh [npm]\nnpm i @kadal/deck\n```\n\n```sh [bun]\nbun add @kadal/deck\n```\n\n::",
      "<<< @/snippets/tide.ts#ask {2,3}",
      "<!--\nTrailing comment notes, Slidev style.\n[click] And a click.\n-->\n",
    ])
      expect(text).toContain(kept);
    // A thematic break stays *** (--- would start a slide).
    expect(text).toContain("---\nlayout: end\n---\n\n***\n");
    expect(text.endsWith("-->\n")).toBe(true);
  });

  test("the engine sees the same deck before and after, for every fixture and the showcase", async () => {
    for (const file of [...fixtureFiles, ...showcaseFiles]) {
      const src = read(file);
      const { text } = await formatDeck(src, prettier);
      expect({ file, ...engine(text) }).toEqual({ file, ...engine(src) });
    }
  });

  test("is idempotent", async () => {
    for (const file of [...fixtureFiles, ...showcaseFiles]) {
      const once = (await formatDeck(read(file), prettier)).text;
      const twice = await formatDeck(once, prettier);
      expect(twice.changed).toBe(false);
      expect(twice.text).toBe(once);
    }
  });

  test("CRLF in, LF out, a BOM kept", async () => {
    // Built here: git would turn a CRLF fixture into LF on checkout.
    const bom = String.fromCharCode(0xfeff);
    const src = `${bom}---\r\ntitle: CRLF deck\r\n---\r\n\r\n# One\r\n\r\n---\r\n\r\n* two\r\n`;
    const { text } = await formatDeck(src, prettier);
    expect(text).toBe(`${bom}---\ntitle: CRLF deck\n---\n\n# One\n\n---\n\n- two\n`);
  });

  test("frontmatter-only include pieces keep their place; JSX with Markdown inside is kept", async () => {
    const { text } = await formatDeck(read(join(fixtures, "include.mdx")), prettier);
    expect(text).toContain("---\nsrc: ./more.mdx#2-3\nlayout: center\n---\n\n---\n\n<Cols");
    expect(text).toContain("<Col>\n\n- A list inside JSX\n\n</Col>");
  });

  test("bodies: false formats only the structure", async () => {
    const src = "---\ntitle:   x\n---\n# A\n* b\n---   \n* c\n";
    const { text } = await formatDeck(src, prettier, { bodies: false });
    expect(text).toBe("---\ntitle: x\n---\n\n# A\n* b\n\n---\n\n* c\n");
  });

  test("a body that asks for prettier-ignore is left alone, and reported", async () => {
    const src = "# A\n\n<!-- prettier-ignore -->\n| a |  b |\n|-|-|\n";
    const { text, kept } = await formatDeck(src, prettier);
    expect(text).toBe(src);
    expect(kept[0]?.reason).toContain("prettier-ignore");
  });

  test("invalid YAML is reported and kept as written", async () => {
    const src = "# A\n\n---\nlayout: [center\n---\n\n# B\n";
    const { text, kept } = await formatDeck(src, prettier);
    expect(text).toContain("layout: [center");
    expect(kept.some((k) => k.reason.includes("not valid YAML"))).toBe(true);
  });
});

describe("protect and guard", () => {
  test("placeholders go back re-indented with their list item", () => {
    const body = "-   item\n\n    ```js\n    x\n    ```\n";
    const m = mask(body, "t");
    expect(m.text).toBe("-   item\n\n    <!--kadal-fmt-t-0-->\n");
    expect(unmask("- item\n\n  <!--kadal-fmt-t-0-->\n", m)).toBe("- item\n\n  ```js\n  x\n  ```\n");
    expect(unmask("- item\n", m)).toBeNull();
  });

  test("the guard notices a change of meaning", () => {
    expect(sameMeaning("a *b* c", "a _b_ c", "t")).toBeNull();
    expect(sameMeaning("a *b* c", "a b c", "t")).not.toBeNull();
    expect(sameMeaning("<A x={1} />", "<A x={2} />", "t")).not.toBeNull();
  });
});

describe("the Prettier plugin", () => {
  test("deck.mdx is formatted as a deck by its name", async () => {
    const out = await prettier.format("---\ntitle:  x\n---\n# A\n---\n* b\n", {
      filepath: "talk/deck.mdx",
      plugins: [plugin],
    });
    expect(out).toBe("---\ntitle: x\n---\n\n# A\n\n---\n\n- b\n");
  });

  test("any file with parser: kadal-deck; kadalDeckBodies: false; endOfLine: crlf", async () => {
    const out = await prettier.format("# A\n* b\n---\n* c\n", {
      parser: "kadal-deck",
      plugins: [plugin],
      kadalDeckBodies: false,
      endOfLine: "crlf",
    } as prettier.Options);
    expect(out).toBe("# A\r\n* b\r\n\r\n---\r\n\r\n* c\r\n");
  });
});
