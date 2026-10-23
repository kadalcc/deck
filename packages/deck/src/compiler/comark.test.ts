import { describe, expect, test } from "bun:test";
import { compile, run } from "@mdx-js/mdx";
import { type ComponentType, createElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createHighlighter } from "shiki";

import { lintDeck, readExtensions } from "../authoring/index.ts";
import { compileDeck } from "../runtime/compile.ts";
import { buildMatcher, DEFAULT_GLOSSARY } from "../glossary/model.ts";
import {
  bindingValue,
  comarkName,
  parseComarkAttributes,
  styleObject,
} from "./comark-attributes.ts";
import { mdxPlugins, prepareDeck } from "./pipeline.ts";
import { comarkEnabled } from "./setup.ts";

const highlighter = await createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: ["ts", "sh"],
});

/** A stand-in for a component: its name, its props as data, its children, its slots. */
const probe =
  (name: string) =>
  (props: Record<string, unknown>): ReactNode => {
    const plain: Record<string, unknown> = {};
    const slots: ReactNode[] = [];
    for (const [k, v] of Object.entries(props)) {
      if (k === "children") continue;
      if (v && typeof v === "object" && "$$typeof" in (v as object))
        slots.push(createElement("section", { key: k, "data-slot": k }, v as ReactNode));
      else plain[k] = v;
    }
    return createElement(
      "x-c",
      { "data-c": name, "data-props": JSON.stringify(plain) },
      ...slots,
      props.children as ReactNode,
    );
  };

const COMPONENTS: Record<string, ComponentType<Record<string, unknown>>> = Object.fromEntries(
  [
    "Badge",
    "Callout",
    "Card",
    "Note",
    "Icon",
    "CodeGroup",
    "MyCard",
    "FitText",
    "Click",
    "Link",
    "InlineComponent",
  ].map((n) => [n, probe(n) as ComponentType<Record<string, unknown>>]),
);

/** A slide body through the deck's MDX pipeline (Comark on unless said), rendered to HTML. */
async function render(source: string, comark = true) {
  const warnings: string[] = [];
  const code = await compile(source, {
    ...mdxPlugins({
      highlighter,
      themes: { light: "github-light", dark: "github-dark" },
      glossary: { options: DEFAULT_GLOSSARY, entries: [], matcher: buildMatcher([]) },
      terms: null,
      math: (t) => t,
      warn: (m) => warnings.push(m),
      comark,
    }),
    outputFormat: "function-body",
  });
  const { default: Content } = await run(code, { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: COMPONENTS }));
  return { html, warnings };
}

/** The same, after the deck's text passes (slots, code groups), as a deck's slide gets it. */
async function renderSlide(body: string) {
  const { slides } = prepareDeck(`---\ncomark: true\n---\n\n${body}\n`, {});
  return render(slides[0]!.content);
}

describe("attribute lists", () => {
  test("classes, ids, strings, bare booleans and bindings", () => {
    expect(parseComarkAttributes(`.a .b #x type="warn" size=lg open :n="3"`)).toEqual([
      { kind: "class", value: "a" },
      { kind: "class", value: "b" },
      { kind: "id", value: "x" },
      { kind: "prop", name: "type", value: "warn", bind: false },
      { kind: "prop", name: "size", value: "lg", bind: false },
      { kind: "prop", name: "open", value: true, bind: false },
      { kind: "prop", name: "n", value: "3", bind: true },
    ]);
    expect(parseComarkAttributes(".a.b#c")).toEqual([
      { kind: "class", value: "a" },
      { kind: "class", value: "b" },
      { kind: "id", value: "c" },
    ]);
    expect(parseComarkAttributes(`title='it\\'s' x="a}b"`)).toEqual([
      { kind: "prop", name: "title", value: "it's", bind: false },
      { kind: "prop", name: "x", value: "a}b", bind: false },
    ]);
    expect(parseComarkAttributes("")).toEqual([]);
  });

  test("MDX expressions are not attribute lists", () => {
    for (const e of ["props.x", "1 + 1", '" "', "a ? b : c", "x()", "...rest", "a=", ":x", "a.b"])
      expect(parseComarkAttributes(e)).toBeNull();
  });

  test("bindings are data, never run; style strings become objects", () => {
    expect(bindingValue('["a", 1]').value).toEqual(["a", 1]);
    expect(bindingValue("{x: 1, y: 'b'}").value).toEqual({ x: 1, y: "b" });
    expect(bindingValue("alert(1)")).toEqual({ value: "alert(1)", ok: false });
    expect(styleObject("color: red; font-size: 2em; --x: 1")).toEqual({
      color: "red",
      fontSize: "2em",
      "--x": "1",
    });
  });

  test("names: HTML elements, Kadal's and the deck's components, Slidev's built-ins", () => {
    expect(comarkName("span")).toEqual({ element: "span" });
    expect(comarkName("section")).toEqual({ element: "section" });
    expect(comarkName("badge")).toEqual({ component: "Badge" });
    expect(comarkName("my-card")).toEqual({ component: "MyCard" });
    expect(comarkName("Badge")).toEqual({ component: "Badge" });
    expect(comarkName("auto-fit-text")).toEqual({ component: "FitText" });
    expect(comarkName("v-click")).toEqual({ component: "Click" });
    expect(comarkName("link")).toEqual({ component: "Link" });
  });

  test("comark: true and Slidev's older mdc: true turn it on", () => {
    expect(comarkEnabled({ comark: true })).toBe(true);
    expect(comarkEnabled({ mdc: true })).toBe(true);
    expect(comarkEnabled({})).toBe(false);
    expect(comarkEnabled({ comark: "yes" })).toBe(false);
  });
});

describe("inline: components, spans, attributes on elements", () => {
  test("Slidev's documented example", async () => {
    const { html, warnings } = await render(
      'This is a [red text]{style="color:red"} :inline-component{prop="value"}\n\n![](/image.png){width=500px lazy}\n\n::badge{prop="value"}\nThe **default** slot\n::',
    );
    expect(html).toBe(
      [
        '<p>This is a <span style="color:red">red text</span> <x-c data-c="InlineComponent" data-props="{&quot;prop&quot;:&quot;value&quot;}"></x-c></p>',
        '<p><img src="/image.png" alt="" width="500px" loading="lazy"/></p>',
        '<x-c data-c="Badge" data-props="{&quot;prop&quot;:&quot;value&quot;}"><p>The <strong>default</strong> slot</p></x-c>',
      ].join("\n"),
    );
    expect(warnings).toEqual([]);
  });

  test("components with content and props", async () => {
    const { html } = await render(
      ':badge[New **now**]{tone="good" .x #y} and :icon{name="mdi:rocket"}',
    );
    expect(html).toContain(
      '<x-c data-c="Badge" data-props="{&quot;className&quot;:&quot;x&quot;,&quot;tone&quot;:&quot;good&quot;,&quot;id&quot;:&quot;y&quot;}">New <strong>now</strong></x-c>',
    );
    expect(html).toContain(
      '<x-c data-c="Icon" data-props="{&quot;name&quot;:&quot;mdi:rocket&quot;}"></x-c>',
    );
  });

  test("bound props arrive as data; handlers are dropped with a warning", async () => {
    const { html, warnings } = await render(`:card{:items='["a","b"]' :n="3" open onClick="x"}`);
    expect(html).toContain(
      'data-props="{&quot;items&quot;:[&quot;a&quot;,&quot;b&quot;],&quot;n&quot;:3,&quot;open&quot;:true}"',
    );
    expect(warnings.join()).toContain("onClick");
  });

  test("attributes after bold, code, links and images", async () => {
    const { html } = await render(
      "**bold**{.accent} `code`{.big} [link](/x){target=_blank} ![](/cat.png){width=480 lazy}",
    );
    expect(html).toContain('<strong class="accent">bold</strong>');
    expect(html).toContain('<code class="big">code</code>');
    expect(html).toContain('<a href="/x" target="_blank">link</a>');
    expect(html).toContain('<img src="/cat.png" alt="" width="480" loading="lazy"/>');
  });

  test("HTML elements by name, nesting, links inside spans", async () => {
    const { html } = await render(":span[nested :badge[in]{.q}]{.outer} and [a [b](c) d]{.s}");
    expect(html).toContain('<span class="outer">nested <x-c data-c="Badge"');
    expect(html).toContain('<span class="s">a <a href="c">b</a> d</span>');
  });

  test("Slidev's built-in names map to Kadal's", async () => {
    const { html } = await render(":auto-fit-text[Big]");
    expect(html).toContain('data-c="FitText"');
  });

  test("a label may break across lines", async () => {
    const { html } = await render("[one\ntwo]{.s}");
    expect(html).toContain('<span class="s">one\ntwo</span>');
  });

  test("{…} after something it cannot apply to is text, with a warning", async () => {
    const { html, warnings } = await render("(x){.y}");
    expect(html).toContain("(x){.y}");
    expect(warnings.join()).toContain("follows nothing");
  });
});

describe("blocks: ::name … ::", () => {
  test("props, a default slot and a named slot", async () => {
    const { html, warnings } = await render(
      '::callout{type="warn"}\nThe **default** slot\n#title\nA *named* slot\n::',
    );
    expect(warnings).toEqual([]);
    expect(html).toBe(
      '<x-c data-c="Callout" data-props="{&quot;type&quot;:&quot;warn&quot;}"><section data-slot="title">A <em>named</em> slot</section><p>The <strong>default</strong> slot</p></x-c>',
    );
  });

  test("#default, kebab slot names, slots that open a paragraph", async () => {
    const { html } = await render("::card\n#my-footer\nFoot\n\n#default\nBody\n::");
    expect(html).toContain('<section data-slot="myFooter">Foot</section>');
    // a slot of more than one paragraph keeps its blocks
    const many = await render("::card\n#aside\nOne\n\nTwo\n::");
    expect(many.html).toContain('<section data-slot="aside"><p>One</p><p>Two</p></section>');
    expect(html).toContain("<p>Body</p></x-c>");
  });

  test("YAML props between --- lines, and nesting with one colon more", async () => {
    const { html, warnings } = await render(
      "::card\n---\ntitle: Deep dive\ntags:\n  - mdx\n  - slides\nn: 3\n---\nBody\n:::note\nInner\n:::\n::",
    );
    expect(warnings).toEqual([]);
    expect(html).toBe(
      '<x-c data-c="Card" data-props="{&quot;title&quot;:&quot;Deep dive&quot;,&quot;tags&quot;:[&quot;mdx&quot;,&quot;slides&quot;],&quot;n&quot;:3}"><p>Body</p><x-c data-c="Note" data-props="{}"><p>Inner</p></x-c></x-c>',
    );
  });

  test("an HTML element block holds any Markdown: lists, quotes, code", async () => {
    const { html } = await render(
      "::section{.grid}\n- a\n- b\n\n> q\n\n```ts\nconst x = 1;\n```\n::",
    );
    expect(html).toMatch(
      /^<section class="grid"><ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul><blockquote>/,
    );
    expect(html).toContain("const");
    expect(html).toEndWith("</section>");
  });

  test("a block interrupts a paragraph, and so does its closer", async () => {
    const { html } = await render("text\n::note\nbody\n::\nafter");
    expect(html).toBe(
      '<p>text</p>\n<x-c data-c="Note" data-props="{}"><p>body</p></x-c>\n<p>after</p>',
    );
  });

  test("blocks inside lists and quotes pair within them", async () => {
    expect((await render("- ::note\n  x\n  ::")).html).toContain(
      '<li>\n<x-c data-c="Note" data-props="{}"><p>x</p></x-c>\n</li>',
    );
    expect((await render("> ::note\n> x\n> ::")).html).toContain(
      '<blockquote>\n<x-c data-c="Note" data-props="{}"><p>x</p></x-c>\n</blockquote>',
    );
  });

  test("a block left open closes at the end, with a warning", async () => {
    const { html, warnings } = await render("::note\nbody");
    expect(html).toBe('<x-c data-c="Note" data-props="{}"><p>body</p></x-c>');
    expect(warnings.join()).toContain("never closed");
  });

  test("props left open run to the end of the block, with a warning", async () => {
    const { warnings } = await render("::card\n---\na: 1\n");
    expect(warnings.join()).toContain("never close");
  });
});

describe("collisions with Kadal's syntax and MDX", () => {
  test("a block's --- props in a deck are not a slide separator", async () => {
    const deck = (body: string) => prepareDeck(`---\ncomark: true\n---\n\n${body}\n`, {}).slides;
    const props =
      "::card\n---\ntitle: Deep dive\n---\nBody\n:::note\n---\na: 1\n---\nInner\n:::\n::";
    const slides = deck(`${props}\n\n---\n\n# Two`);
    expect(slides.length).toBe(2);
    const { html, warnings } = await render(slides[0]!.content);
    expect(warnings).toEqual([]);
    expect(html).toContain('data-c="Card" data-props="{&quot;title&quot;:&quot;Deep dive&quot;}"');
    expect(html).toContain('data-c="Note" data-props="{&quot;a&quot;:1}"');
    // A block never closed before the next opener of its depth ends at the separator, as before.
    expect(deck("::note\nOpen\n\n---\n\n::note\nTwo\n::").length).toBe(2);
  });

  test("::right:: slot markers keep splitting the slide, blocks inside them work", async () => {
    const { html } = await renderSlide("Left\n\n::right::\n\n::note\nIn the right slot\n::");
    expect(html).toContain(
      '<div data-slot="default" class="deck-slot deck-slot-default"><p>Left</p></div>',
    );
    expect(html).toContain(
      '<div data-slot="right" class="deck-slot deck-slot-right"><x-c data-c="Note" data-props="{}"><p>In the right slot</p></x-c></div>',
    );
  });

  test("::code-group stays a code group, also inside a block", async () => {
    const group = "::code-group\n\n```sh [npm]\nnpm i x\n```\n\n```sh [bun]\nbun add x\n```\n\n::";
    expect((await renderSlide(group)).html).toMatch(/^<x-c data-c="CodeGroup"/);
    const nested = await renderSlide(`::card\n${group}\n::`);
    expect(nested.html).toMatch(/^<x-c data-c="Card" data-props="\{\}"><x-c data-c="CodeGroup"/);
    expect(nested.warnings).toEqual([]);
    expect((await renderSlide(group.replace(/^::/gm, ":::"))).html).toMatch(
      /^<x-c data-c="CodeGroup"/,
    );
  });

  test("a VitePress ::: container and stray colons stay text", async () => {
    expect((await render("::: tip\nnot comark\n:::")).html).toBe("<p>::: tip\nnot comark\n:::</p>");
    expect((await render("x\n::")).html).toBe("<p>x\n::</p>");
    expect((await render("::")).html).toBe("<p>::</p>");
  });

  test("colons in prose, times, URLs, emoji shortcodes", async () => {
    const { html, warnings } = await render("a:b 10:30 https://x.y :smile: Note: hi (:badge)");
    expect(html).toBe(
      '<p>a:b 10:30 <a href="https://x.y">https://x.y</a> :smile: Note: hi (<x-c data-c="Badge" data-props="{}"></x-c>)</p>',
    );
    expect(warnings).toEqual([]);
  });

  test("MDX expressions keep their meaning", async () => {
    const { html } = await render('A {1 + 1} B **x**{" "}C {["y"].join("")}');
    expect(html).toBe("<p>A 2 B <strong>x</strong> C y</p>");
  });

  test("code spans and fences are never read as Comark", async () => {
    const { html } = await render("`:no[x]{.y}`\n\n```ts\n::not{a}\n:x[y]\n```");
    expect(html).toContain("<code>:no[x]{.y}</code>");
    expect(html).toContain("::not");
    expect(html).not.toContain("data-c");
  });

  test("off by default: the syntax is not read at all", async () => {
    expect((await render(":badge[x] and ::note", false)).html).toBe("<p>:badge[x] and ::note</p>");
    await expect(render("[x]{.y}", false)).rejects.toThrow();
  });
});

describe("both compilers", () => {
  test("the runtime compiler reads it from the headmatter, with no diagnostics", async () => {
    const out = await compileDeck(
      `---\ncomark: true\n---\n\n# Hi\n\n:badge[New]{tone="good"} and [red]{style="color: red"}\n\n::callout{type="info"}\nBody\n#title\nHeads up\n::\n`,
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.ok).toBe(true);
    expect(typeof (await out.manifest.slides[0]!.load()).default).toBe("function");
  });

  test("mdc: true works the same", async () => {
    const out = await compileDeck(`---\nmdc: true\n---\n\n[red]{.r}\n`);
    expect(out.diagnostics).toEqual([]);
  });

  test("without it, the same slide is an MDX error, as before", async () => {
    const out = await compileDeck(`# Hi\n\n[red]{.r}\n`);
    expect(out.ok).toBe(false);
  });
});

describe("the linter", () => {
  const lint = async (deck: string) =>
    (
      await lintDeck({
        files: { entry: "/d/deck.mdx", read: (p) => (p === "/d/deck.mdx" ? deck : null) },
        root: "/d",
        extensions: readExtensions(null),
      })
    ).diagnostics.map(
      (d) => `${d.severity}:${d.code}:${d.line}:${d.message}${d.hint ? ` (${d.hint})` : ""}`,
    );

  test("with comark: true, Comark compiles clean and its components are checked", async () => {
    const out = await lint(
      '---\ncomark: true\n---\n\n# A\n\n:badge[New]{tone="good"} [red]{.r}\n\n::callout{type="info"}\nBody\n#title\nT\n::\n\n:no-such-thing[x]\n\n::code-group\n\n```sh [a]\nx\n```\n\n::\n',
    );
    expect(out.filter((d) => d.startsWith("error:mdx"))).toEqual([]);
    expect(out.some((d) => d.includes("<NoSuchThing> is not a built-in component"))).toBe(true);
    expect(out.some((d) => d.includes("<Badge>"))).toBe(false);
    // its props too: Callout's is `kind`, so `type` is caught, on the opener's line
    expect(out).toContain(
      'warning:prop-unknown:9:<Callout> has no prop "type"; it is ignored. (Props: kind, title, children, className.)',
    );
  });

  test("a Comark mistake is a warning on its line", async () => {
    const out = await lint("---\ncomark: true\n---\n\n# A\n\n::note\nnever closed\n");
    expect(out.some((d) => /^warning:comark:7:.*never closed/.test(d))).toBe(true);
  });

  test("without it, the MDX error says how to turn Comark on", async () => {
    const out = await lint("---\ntitle: x\n---\n\n# A\n\n[red]{.r}\n");
    expect(out.some((d) => d.startsWith("error:mdx") && d.includes("comark: true"))).toBe(true);
  });
});
