import { compile } from "@mdx-js/mdx";
import { describe, expect, test } from "bun:test";

import { rehypeGlossary } from "../compiler/rehype-glossary.ts";
import { resolveConfig } from "../core/model.ts";
import { buildMatcher, glossaryOptions, inlineHtml, termId } from "./model.ts";
import { parseGlossary } from "./parse.ts";

const YAML_SOURCE = `
GNSS: Satellite positioning — GPS, NavIC, Galileo and the rest.
UTM:
  full: Universal Transverse Mercator
  def: Sixty projections that turn latitude and longitude into **metres**.
  aliases: [UTM zone 44N]
  tag: Projection
  link: https://epsg.io/32644
  see: [WGS84, Nowhere]
WGS84:
  def: The datum GPS reports in; error grows as $\\sigma^2$.
  see: UTM
Plus Code: Google's open grid address.
lattice:
  def: The nested grid of cells.
cell:
  def: One square of the lattice.
  auto: false
WHO: The World Health Organization.
`;

const { entries, warnings } = parseGlossary(YAML_SOURCE, "glossary.yaml", (tex) => `<m>${tex}</m>`);
const matcher = buildMatcher(entries);
const found = (text: string) => matcher.find(text).map((m) => `${m.entry.id}:${m.text}`);

describe("parseGlossary", () => {
  test("reads the short and the long form", () => {
    expect(entries.map((e) => e.id)).toEqual([
      "gnss",
      "utm",
      "wgs84",
      "plus-code",
      "lattice",
      "cell",
      "who",
    ]);
    const utm = entries.find((e) => e.id === "utm")!;
    expect(utm.full).toBe("Universal Transverse Mercator");
    expect(utm.aliases).toEqual(["UTM zone 44N"]);
    expect(utm.tag).toBe("Projection");
    expect(utm.link).toEqual({ href: "https://epsg.io/32644", label: "epsg.io" });
    expect(utm.html.def).toContain("<strong>metres</strong>");
  });

  test("resolves see-also by name and reports what it cannot find", () => {
    expect(entries.find((e) => e.id === "utm")!.see).toEqual(["wgs84"]);
    expect(entries.find((e) => e.id === "wgs84")!.see).toEqual(["utm"]);
    expect(warnings.some((w) => w.includes("Nowhere"))).toBe(true);
  });

  test("renders maths at build time through the given renderer", () => {
    expect(entries.find((e) => e.id === "wgs84")!.html.def).toContain("<m>\\sigma^2</m>");
  });

  test("a broken file is a warning, never a throw", () => {
    const bad = parseGlossary("UTM: [unclosed", "g.yaml");
    expect(bad.entries).toEqual([]);
    expect(bad.warnings).toHaveLength(1);
  });
});

describe("buildMatcher", () => {
  test("whole words, longest name first, plurals", () => {
    expect(found("Snap it to the UTM zone 44N grid.")).toEqual(["utm:UTM zone 44N"]);
    expect(found("Two lattices, one Lattice.")).toEqual(["lattice:lattices", "lattice:Lattice"]);
    expect(found("Plus Codes are open.")).toEqual(["plus-code:Plus Codes"]);
    expect(found("The GNSSX reading")).toEqual([]);
  });

  test("abbreviations match in their exact case only", () => {
    expect(found("who said the WHO?")).toEqual(["who:WHO"]);
    expect(found("utm is not UTM")).toEqual(["utm:UTM"]);
  });

  test("a hyphenated compound is a mention only for an abbreviation", () => {
    expect(found("GNSS-derived fixes")).toEqual(["gnss:GNSS"]);
    expect(found("a lattice-level view")).toEqual([]);
  });

  test("auto: false stays out of automatic linking but resolves by hand", () => {
    expect(found("Every cell has a name.")).toEqual([]);
    expect(matcher.resolve("cells")?.id).toBe("cell");
  });

  test("adjacent terms are both found", () => {
    expect(found("UTM/WGS84, GNSS")).toEqual(["utm:UTM", "wgs84:WGS84", "gnss:GNSS"]);
  });

  test("resolve takes a name, an alias or an id", () => {
    expect(matcher.resolve("UTM zone 44N")?.id).toBe("utm");
    expect(matcher.resolve("plus-code")?.id).toBe("plus-code");
    expect(matcher.resolve("Plus Code")?.id).toBe("plus-code");
    expect(matcher.resolve("nothing")).toBeUndefined();
  });
});

describe("inlineHtml", () => {
  test("escapes everything it does not understand", () => {
    expect(inlineHtml(`<img src=x onerror="alert(1)"> & co`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; co",
    );
  });
  test("bold, emphasis, code, links", () => {
    expect(inlineHtml("**a** *b* `c<d`")).toBe("<strong>a</strong> <em>b</em> <code>c&lt;d</code>");
    expect(inlineHtml("[x](https://a.b)")).toContain('href="https://a.b"');
    expect(inlineHtml("[x](javascript:alert(1))")).not.toContain("href");
  });
  test("maths falls back to its source without a renderer", () => {
    expect(inlineHtml("$x^2$")).toContain("x^2");
  });
});

describe("options", () => {
  test("the headmatter's glossary key: a path, false, or a mapping", () => {
    expect(glossaryOptions("terms.yaml").src).toBe("terms.yaml");
    expect(glossaryOptions(false).src).toBeNull();
    expect(glossaryOptions({ repeat: "all", delay: 400 })).toMatchObject({
      src: "glossary.yaml",
      repeat: "all",
      delay: 400,
    });
  });
  test("layers merge through resolveConfig", () => {
    const c = resolveConfig({ glossary: { delay: 500 } }, { glossary: { sync: true } });
    expect(c.glossary).toMatchObject({ delay: 500, sync: true, src: "glossary.yaml" });
  });
  test("ids are slugs", () => {
    expect(termId("Plus Code")).toBe("plus-code");
    expect(termId("WGS84")).toBe("wgs84");
  });
});

async function build(mdx: string, options: Partial<Parameters<typeof rehypeGlossary>[0]> = {}) {
  const warned: string[] = [];
  const out = await compile(mdx, {
    jsx: true,
    rehypePlugins: [
      [
        rehypeGlossary,
        {
          matcher,
          repeat: "first",
          headings: "fallback",
          warn: (m: string) => warned.push(m),
          ...options,
        },
      ],
    ],
  });
  return { code: String(out), warned };
}
// MDX destructures provided components, so a linked term compiles to `<Term id="utm" auto>{"UTM"}</Term>`.
const terms = (code: string) =>
  [...code.matchAll(/<Term id="([^"]+)"[^>]*>\{"([^"]+)"\}/g)].map((m) => `${m[1]}:${m[2]}`);
const linked = (code: string) => [...code.matchAll(/<Term id="([^"]+)"/g)].map((m) => m[1]);

describe("rehypeGlossary", () => {
  test("links the first mention on the slide, in the body before the heading", async () => {
    const { code } = await build("# UTM and GNSS\n\nReports snap to UTM. UTM again.\n");
    // UTM is linked in the sentence (not the title); GNSS only appears in the title, so there.
    expect(terms(code)).toEqual(["gnss:GNSS", "utm:UTM"]);
    expect(code.indexOf('id="gnss"')).toBeLessThan(code.indexOf('id="utm"'));
    expect(code.match(/id="utm"/g)).toHaveLength(1);
  });

  test("repeat: all links every mention; headings: false leaves titles alone", async () => {
    const all = await build("UTM then UTM.\n", { repeat: "all" });
    expect(linked(all.code)).toEqual(["utm", "utm"]);
    const none = await build("# GNSS\n\nText.\n", { headings: false });
    expect(linked(none.code)).toEqual([]);
  });

  test("leaves code, links, skipped components and no-terms blocks alone", async () => {
    const { code } = await build(
      [
        "`UTM` and [UTM](https://x.y) and <GradientText>UTM</GradientText>.",
        "",
        '<div className="no-terms">UTM</div>',
        "",
        "```\nUTM\n```",
        "",
        "<Chip>GNSS</Chip>",
      ].join("\n"),
    );
    expect(linked(code)).toEqual(["gnss"]);
  });

  test("settles explicit terms: by text, by id, one-offs, and unknown ones", async () => {
    const { code, warned } = await build(
      [
        '<Term>Plus Codes</Term> and <Term id="UTM">projected metres</Term>.',
        "",
        '<Term def="Root-mean-square **error**.">RMSE</Term> and <Term>mystery</Term>.',
        "",
        "UTM here is not linked again.",
      ].join("\n"),
    );
    expect(code).toContain('<Term id="plus-code">{"Plus Codes"}');
    expect(code).toContain('<Term id="utm">{"projected metres"}');
    expect(code).toContain('<Term>{"mystery"}');
    expect(code).toContain("Root-mean-square <strong>error</strong>.");
    expect(code).toMatch(/id="~[a-z0-9]+"/);
    expect(warned).toEqual(['<Term> "mystery" is not in the glossary and has no def']);
    expect(code.match(/id="utm"/g)).toHaveLength(1);
  });

  test("a slide can switch automatic linking off, or skip single terms", async () => {
    const off = await build("UTM and <Term>GNSS</Term>.\n", { auto: false });
    expect(linked(off.code)).toEqual(["gnss"]);
    const skip = await build("UTM and GNSS.\n", { exclude: new Set(["utm"]) });
    expect(linked(skip.code)).toEqual(["gnss"]);
  });
});
