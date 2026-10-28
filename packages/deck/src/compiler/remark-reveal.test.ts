import { describe, expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";

import { remarkRevealClasses } from "./remark-reveal.ts";

async function jsx(source: string): Promise<string> {
  const out = await compile(source, {
    remarkPlugins: [remarkRevealClasses],
    outputFormat: "function-body",
    jsx: true,
  });
  return String(out);
}

describe("reveal.js classes written as HTML", () => {
  test('class="fragment" becomes a Click of the same element, effect and other classes kept', async () => {
    const out = await jsx(
      `<p class="fragment fade-up big">One</p>\n\nInline <span class="fragment">two</span>.`,
    );
    expect(out).toContain('<Click as="p" effect="fade-up" className="big">');
    expect(out).toContain('<Click as="span">');
    expect(out).not.toContain('"fragment');
  });

  test("a flow element keeps its Markdown inside", async () => {
    const out = await jsx(`<div class="fragment">\n\nTwo **bold**\n\n</div>`);
    expect(out).toContain('<Click as="div">');
    expect(out).toContain("<_components.strong>");
  });

  test("data-fragment-index orders steps as reveal does: indexed groups, then the rest", async () => {
    const out = await jsx(
      [
        `<p class="fragment">rest</p>`,
        `<p class="fragment" data-fragment-index="5">five</p>`,
        `<p class="fragment" data-fragment-index="1">one</p>`,
        `<p class="fragment" data-fragment-index="1">one too</p>`,
      ].join("\n\n"),
    );
    const at = (text: string) => new RegExp(`at="(\\d+)"[^>]*>\\{?"?${text}`).exec(out)?.[1];
    expect([at("one"), at("one too"), at("five"), at("rest")]).toEqual(["1", "1", "2", "3"]);
    expect(out).not.toContain("data-fragment-index");
  });

  test("an HTML style string on a fragment becomes the object a component wants", async () => {
    const out = await jsx(`<p class="fragment" style="color: red">x</p>`);
    expect(out).toMatch(/style=\{\{\s*"color": "red"\s*\}\}/);
  });

  test("components and code are left alone", async () => {
    const out = await jsx('<Badge class="fragment">x</Badge>\n\n`<p class="fragment">`');
    expect(out).toContain("Badge");
    expect(out).not.toContain("Click");
  });

  test("r-fit-text wraps the element's text in FitText, once", async () => {
    const one = await jsx(`<h2 class="r-fit-text">Big title</h2>`);
    expect(one).toMatch(/<h2 class="r-fit-text"><FitText>\{"Big title"\}<\/FitText>/);
    const block = await jsx(`<h1 class="r-fit-text">\n\nHuge\n\n</h1>`);
    expect(block).toContain("<FitText>");
    expect(block).not.toContain("<_components.p>");
  });
});
