import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { cutDeck } from "../compiler/split.ts";
import { compileDeck } from "../runtime/compile.ts";
import { convertReveal, formatImportReport } from "./index.ts";
import { revealConfig } from "./reveal.ts";

const page = (slides: string, head = "", script = "") =>
  `<!doctype html><html><head><title>T</title>${head}</head><body><div class="reveal"><div class="slides">${slides}</div></div>${script}</body></html>`;

/** The converted deck's slides: separator, frontmatter and body. */
function slides(mdx: string) {
  const lines = mdx.split("\n");
  return cutDeck(mdx).map((p) => ({
    vertical: p.vertical,
    fm: (p.frontmatter ? YAML.parse(p.frontmatter) : {}) as Record<string, unknown>,
    body: lines
      .slice(p.line - 1, p.end)
      .join("\n")
      .trim(),
  }));
}
const one = (section: string) => {
  const r = convertReveal(page(section));
  return { ...slides(r.mdx)[0]!, r };
};
const what = (r: { report: Array<{ severity: string; what: string }> }) =>
  r.report.map((x) => `${x.severity}: ${x.what}`).join("\n");

describe("sections", () => {
  test("each section is a slide; a section of sections is a vertical stack", () => {
    const r = convertReveal(
      page(
        "<section><h2>A</h2></section><section><section><h2>B</h2></section><section><h2>B.1</h2></section></section><section><h2>C</h2></section>",
      ),
    );
    const s = slides(r.mdx);
    expect(s.map((x) => x.body)).toEqual(["## A", "## B", "## B.1", "## C"]);
    expect(s.map((x) => x.vertical)).toEqual([false, false, true, false]);
    expect(r.mdx).toContain("\n----\n");
    expect(r.info.slides).toBe(4);
    expect(r.info.titles).toEqual(["A", "B", "B.1", "C"]);
  });

  test("the title, the theme's scheme and Reveal.initialize's literal options become headmatter", () => {
    const r = convertReveal(
      page(
        "<section><h1>Hi</h1></section>",
        '<link rel="stylesheet" href="dist/theme/night.css">',
        "<script>Reveal.initialize({ hash: true, transition: 'convex', slideNumber: 'c/t', width: 1280, plugins: [RevealNotes], keyboard: { 13: 'next' } });</script>",
      ),
    );
    const head = slides(r.mdx)[0]!.fm;
    expect(head).toMatchObject({
      title: "T",
      theme: "reveal",
      themeConfig: { variant: "night", width: 1280 },
      colorScheme: "dark",
      margin: 0.04,
      hash: true,
      transition: "convex",
      slideNumber: "c/t",
    });
    expect(head.width).toBeUndefined();
    expect(r.info.canvas.scale).toBe(1.5);
    expect(head.keyboard).toEqual({ Enter: "next" });
    expect(what(r)).not.toContain("plugins");
  });

  test("reveal's theme becomes the reveal theme's variant of the same name, in its scheme", () => {
    const theme = (head: string) => {
      const r = convertReveal(page("<section><h1>Hi</h1></section>", head));
      return { fm: slides(r.mdx)[0]!.fm, info: r.info.theme, report: what(r) };
    };
    const link = (name: string) => `<link rel="stylesheet" href="dist/theme/${name}.css">`;
    for (const [name, scheme] of [
      ["black", "dark"],
      ["white", "light"],
      ["league", "dark"],
      ["beige", "light"],
      ["night", "dark"],
      ["serif", "light"],
      ["simple", "light"],
      ["solarized", "light"],
      ["moon", "dark"],
      ["dracula", "dark"],
      ["sky", "light"],
      ["blood", "dark"],
    ])
      expect(theme(link(name!)).fm).toMatchObject({
        theme: "reveal",
        themeConfig: { variant: name },
        colorScheme: scheme,
      });
    const contrast = theme(link("white-contrast"));
    expect(contrast.fm).toMatchObject({ themeConfig: { variant: "white" }, colorScheme: "light" });
    expect(contrast.report).toContain("its extra contrast is not carried over");
    // reveal.css alone is black on white
    expect(theme("").fm).toMatchObject({ themeConfig: { variant: "white" }, colorScheme: "light" });
    const own = theme(link("corporate"));
    expect(own.fm).toMatchObject({ theme: "reveal", themeConfig: { variant: "black" } });
    expect(own.report).toContain(
      'warning: The reveal.js theme "corporate" is not one of reveal\'s own',
    );
    expect(theme(link("moon")).info).toEqual({
      reveal: "moon",
      kadal: "reveal",
      variant: "moon",
      colorScheme: "dark",
    });
  });

  test("a first slide on a dark background keeps light text in either scheme (reveal's class)", () => {
    // regression: the headmatter's colorScheme is the first slide's too, so the slide's own flip
    // to dark was dropped (or never written, the deck being dark already) and its words went
    // black on navy as soon as the deck was light
    const r = convertReveal(
      page(
        '<section data-background-color="#0f172a"><h1>Title</h1></section><section data-background-color="#0f172a"><h2>Two</h2></section>',
        '<link rel="stylesheet" href="dist/theme/white.css">',
      ),
    );
    const [first, second] = slides(r.mdx);
    expect(first!.fm).toMatchObject({ colorScheme: "light", class: "has-dark-background" });
    expect(second!.fm).toMatchObject({ colorScheme: "dark" });
    expect(what(r)).not.toContain("colorScheme");
    // a dark deck's light first slide: the other way round
    const dark = convertReveal(
      page(
        '<section data-background-color="#ffffff" class="title"><h1>Hi</h1></section>',
        '<link rel="stylesheet" href="dist/theme/black.css">',
      ),
    );
    expect(slides(dark.mdx)[0]!.fm).toMatchObject({
      colorScheme: "dark",
      class: "title has-light-background",
    });
    // and a dark deck's dark first slide: it stays light-on-dark when the viewer (or `contrast`,
    // or `export --scheme light`) turns the deck light; so does every dark slide after it
    const same = convertReveal(
      page(
        '<section data-background-color="#0f172a"><h1>Hi</h1></section><section data-background-color="#0f172a"><h2>Two</h2></section>',
        '<link rel="stylesheet" href="dist/theme/black.css">',
      ),
    );
    const [a, b] = slides(same.mdx);
    expect(a!.fm).toMatchObject({ colorScheme: "dark", class: "has-dark-background" });
    expect(b!.fm).toMatchObject({ colorScheme: "dark" });
  });

  test("reveal's slide size goes to themeConfig, its default margin to the headmatter", () => {
    const at = (init: string) =>
      convertReveal(
        page(
          "<section><h1>Hi</h1></section>",
          "",
          `<script>Reveal.initialize({ ${init} });</script>`,
        ),
      );
    const sized = at("width: 1280, height: 720, margin: 0.1");
    expect(slides(sized.mdx)[0]!.fm).toMatchObject({
      themeConfig: { variant: "white", width: 1280, height: 720 },
      margin: 0.1,
    });
    // reveal scales its slide to fit, by the tighter of the two ratios; inline lengths follow
    expect(sized.info.canvas.scale).toBe(1.5);
    const plain = at("hash: true");
    expect(slides(plain.mdx)[0]!.fm.themeConfig).toEqual({ variant: "white" });
    expect(slides(plain.mdx)[0]!.fm.margin).toBe(0.04);
    expect(plain.info.canvas.scale).toBe(1.543);
  });

  test("reveal's keyboard map arrives in Kadal's key and action names", () => {
    const r = convertReveal(
      page(
        "<section><h1>Hi</h1></section>",
        "",
        `<script>Reveal.initialize({ keyboard: { 13: 'next', "32": null, 79: 'toggleOverview', 66: "togglePause", 27: () => { alert(1) }, 86: 'slide', 999: 'next', 74: 'view.overview' } });</script>`,
      ),
    );
    expect(slides(r.mdx)[0]!.fm.keyboard).toEqual({
      Enter: "next",
      Space: null,
      KeyO: "overview",
      KeyB: "pause",
      KeyJ: "view.overview",
    });
    const report = what(r);
    expect(report).toContain("The keyboard map's function on Escape is not carried over");
    expect(report).toContain('binds KeyV to "slide", which Kadal has no action for');
    expect(report).toContain("The keyboard map's key 999 is not a key Kadal knows");
    expect(report).not.toContain("`keyboard` is not a plain value");
  });

  test("reveal's newer options carry over by name", () => {
    const r = convertReveal(
      page(
        "<section><h1>Hi</h1></section>",
        "",
        "<script>Reveal.initialize({ parallaxBackgroundImage: 'stars.jpg', parallaxBackgroundSize: '2100px 900px', scrollLayout: 'full', keyboardCondition: 'focused', postMessageEvents: true, disableLayout: true });</script>",
      ),
    );
    expect(slides(r.mdx)[0]!.fm).toMatchObject({
      parallaxBackgroundImage: "stars.jpg",
      parallaxBackgroundSize: "2100px 900px",
      scrollLayout: "full",
      keyboardCondition: "focused",
      postMessageEvents: true,
      disableLayout: true,
    });
    expect(what(r)).not.toContain("parallaxBackgroundImage");
  });

  test("revealConfig reads literals and skips the rest, comments and all", () => {
    const c = revealConfig(
      "deck.initialize({\n  // a comment, with: a colon\n  controls: false,\n  margin: 0.04,\n  view: \"scroll\",\n  dependencies: [{ src: 'x.js' }],\n});",
    );
    expect(c.found).toBe(true);
    expect(c.values).toEqual({ controls: false, margin: 0.04, view: "scroll" });
    expect(c.skipped).toEqual(["dependencies"]);
  });
});

describe("backgrounds and slide attributes", () => {
  test("data-background-* become background frontmatter", () => {
    const r = convertReveal(
      page(
        [
          "<section><h2>0</h2></section>",
          '<section data-background-color="#000"><h2>1</h2></section>',
          '<section data-background-image="https://x.test/a.jpg" data-background-size="contain" data-background-position="top" data-background-opacity="0.4"><h2>2</h2></section>',
          '<section data-background-video="https://x.test/v.mp4" data-background-video-muted><h2>3</h2></section>',
          '<section data-background-gradient="radial-gradient(#283b95, #17b2c3)"><h2>4</h2></section>',
          '<section data-background-iframe="https://x.test" data-background-interactive><h2>5</h2></section>',
          '<section data-background="#ffffff"><h2>6</h2></section>',
          '<section data-background="https://x.test/b.png"><h2>7</h2></section>',
        ].join(""),
      ),
    );
    const s = slides(r.mdx);
    // a dark colour under a light deck gets the dark scheme, as reveal's has-dark-background does
    expect(s[1]!.fm).toEqual({ backgroundColor: "#000", colorScheme: "dark" });
    expect(s[2]!.fm).toEqual({
      backgroundImage: "https://x.test/a.jpg",
      backgroundSize: "contain",
      backgroundPosition: "top",
      backgroundOpacity: 0.4,
    });
    expect(s[3]!.fm).toEqual({
      backgroundVideo: "https://x.test/v.mp4",
      backgroundVideoLoop: false,
      backgroundVideoMuted: true,
    });
    // a gradient's scheme is its stops' mean
    expect(s[4]!.fm).toEqual({
      backgroundGradient: "radial-gradient(#283b95, #17b2c3)",
      colorScheme: "dark",
    });
    expect(s[5]!.fm).toEqual({ backgroundIframe: "https://x.test", backgroundInteractive: true });
    // a light colour is the light scheme's, whichever scheme the deck is shown in
    expect(s[6]!.fm).toEqual({ backgroundColor: "#ffffff", colorScheme: "light" });
    expect(s[7]!.fm).toEqual({ backgroundImage: "https://x.test/b.png" });
  });

  test("local images are listed as assets and named from the deck root", () => {
    const r = convertReveal(
      page(
        '<section><h2>0</h2></section><section data-background-image="img/bg.png"><img src="img/a.png" alt="A"></section>',
      ),
      { file: "talk/index.html", exists: (p) => p.startsWith("talk/img/") },
    );
    const s = slides(r.mdx);
    expect(s[1]!.fm.backgroundImage).toBe("/talk/img/bg.png");
    expect(s[1]!.body).toBe("![A](/talk/img/a.png)");
    expect(r.info.assets).toEqual([
      { from: "talk/img/a.png", to: "public/talk/img/a.png" },
      { from: "talk/img/bg.png", to: "public/talk/img/bg.png" },
    ]);
    const missing = convertReveal(page('<section><img src="nope.png"></section>'), {
      exists: () => false,
    });
    expect(what(missing)).toContain("nope.png is not in the reveal.js project");
  });

  test("transition, auto-animate, autoslide, state, id and visibility carry over", () => {
    const r = convertReveal(
      page(
        '<section><h2>0</h2></section><section id="intro" class="big" data-transition="fade-in slide-out" data-transition-speed="fast" data-auto-animate data-auto-animate-id="a" data-autoslide="2000" data-state="alert" data-visibility="uncounted"><h2>1</h2></section>',
      ),
    );
    expect(slides(r.mdx)[1]!.fm).toEqual({
      id: "intro",
      class: "big",
      transition: "fade-in slide-out",
      transitionSpeed: "fast",
      autoAnimate: true,
      autoAnimateId: "a",
      autoSlide: 2000,
      state: "alert",
      visibility: "uncounted",
    });
  });

  test("a style on a section and an unknown attribute are reported", () => {
    const { r } = one('<section style="color:red" data-foo="1"><h2>A</h2></section>');
    expect(what(r)).toContain('warning: The slide\'s style="color:red" is not carried over');
    expect(what(r)).toContain("info: The slide attribute data-foo has no Kadal equivalent");
  });
});

describe("fragments", () => {
  test("a fragment becomes <Click>, its style the effect", () => {
    const { body } = one(
      '<section><p class="fragment">a</p><p class="fragment fade-up">b</p><p>c <span class="fragment highlight-red">d</span></p></section>',
    );
    expect(body).toBe(
      '<Click>\n\na\n\n</Click>\n\n<Click effect="fade-up">\n\nb\n\n</Click>\n\nc <Click as="span" effect="highlight-red">d</Click>',
    );
  });

  test("data-fragment-index orders the steps as reveal.js sorts them", () => {
    const { body } = one(
      '<section><p class="fragment" data-fragment-index="2">x</p><p class="fragment">y</p><p class="fragment" data-fragment-index="1">z</p><p class="fragment" data-fragment-index="1">w</p></section>',
    );
    // indexed groups first (1, then 2), then the unindexed in document order
    expect([...body.matchAll(/at=\{(\d)\}/g)].map((m) => m[1])).toEqual(["2", "3", "1", "1"]);
  });

  test("a list of fragments is a <Clicks> list; mixed ones are a <Click> per item", () => {
    expect(
      one('<section><ul><li class="fragment">a</li><li class="fragment">b</li></ul></section>')
        .body,
    ).toBe("<Clicks>\n\n- a\n- b\n\n</Clicks>");
    expect(one('<section><ol><li>a</li><li class="fragment grow">b</li></ol></section>').body).toBe(
      '1. a\n2. <Click as="span" effect="grow">b</Click>',
    );
  });

  test("an unknown fragment style stays as a class, with a report line", () => {
    const { body, r } = one('<section><p class="fragment custom-spin">a</p></section>');
    expect(body).toContain('<Click className="custom-spin">');
    expect(what(r)).toContain('The fragment style "custom-spin" has no Kadal click effect');
  });
});

describe("content", () => {
  test("plain HTML is Markdown: headings, emphasis, links, lists, quotes, tables", () => {
    const { body } = one(
      [
        "<section>",
        "<h2>Title <code>x</code></h2>",
        '<p>Some <strong>bold</strong>, <em>em</em> and a <a href="https://x.test">link</a>.</p>',
        "<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>",
        "<blockquote>Quoted &amp; true</blockquote>",
        "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>$2</td></tr></tbody></table>",
        "</section>",
      ].join(""),
    );
    expect(body).toBe(
      [
        "## Title `x`",
        "",
        "Some **bold**, _em_ and a [link](https://x.test).",
        "",
        "- one",
        "  - nested",
        "- two",
        "",
        "> Quoted & true",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | \\$2 |",
      ].join("\n"),
    );
  });

  test("elements with attributes stay JSX, spelt for React", () => {
    const { body } = one(
      '<section><h2 data-id="t" class="x">A</h2><div style="width: 100px; color: red"><p>p</p></div><img src="https://x.test/a.png" width="200"></section>',
    );
    expect(body).toBe(
      '<h2 data-id="t" className="x">A</h2>\n\n<div style={{"width":"154.3px","color":"red"}}>\n\np\n\n</div>\n\n<img src="https://x.test/a.png" width="200" />',
    );
  });

  test("text MDX would read as code is escaped; reveal's maths delimiters become Kadal's", () => {
    const { body } = one("<section><p>{a} &lt;b&gt; *c* \\(x^2\\)</p></section>");
    expect(body).toBe("\\{a\\} \\<b\\> \\*c\\* $x^2$");
  });

  test("code keeps its language and line-number steps", () => {
    const { body } = one(
      '<section><pre><code class="language-ts" data-trim data-line-numbers="1|2-3" data-ln-start-from="10">\n    const a = 1;\n    if (a &lt; 2) {\n      log(a);\n    }\n</code></pre></section>',
    );
    expect(body).toBe(
      "```ts {1|2-3}{lines:true,startLine:10}\nconst a = 1;\nif (a < 2) {\n  log(a);\n}\n```",
    );
    const tmpl = one(
      '<section><pre><code class="hljs python" data-line-numbers><script type="text/template">print("<b>")</script></code></pre></section>',
    ).body;
    expect(tmpl).toBe('```python {lines:true}\nprint("<b>")\n```');
  });

  test("notes: <aside class=notes> and data-notes", () => {
    const { body } = one(
      '<section data-notes="First."><h2>A</h2><aside class="notes">Say <em>this</em>.</aside></section>',
    );
    expect(body).toBe(
      "## A\n\n<Notes>\n\nFirst.\n\n</Notes>\n\n<Notes>\n\nSay _this_.\n\n</Notes>",
    );
  });

  test("scripts and event handlers are reported, never kept", () => {
    const r = convertReveal(
      page(
        '<section><button onclick="go()">Go</button><script>alert(1)</script></section>',
        "",
        '<script src="app.js"></script>',
      ),
    );
    expect(r.mdx).not.toContain("onclick");
    expect(r.mdx).not.toContain("alert");
    expect(what(r)).toContain("The onclick handler on <button> is dropped");
    expect(what(r)).toContain("A script (app.js) is not carried over");
  });
});

describe("data-markdown", () => {
  test("inline Markdown passes through, with .slide and .element comments read", () => {
    const r = convertReveal(
      page(
        '<section><h2>0</h2></section><section data-markdown><textarea data-template>\n  ## Hello\n  <!-- .slide: data-background="#111" -->\n\n  - one <!-- .element: class="fragment" data-fragment-index="2" -->\n  - two <!-- .element: class="fragment fade-up" data-fragment-index="1" -->\n  {curly}\n\n  Note: Speak.\n</textarea></section>',
      ),
    );
    const s = slides(r.mdx)[1]!;
    expect(s.fm).toEqual({ backgroundColor: "#111", colorScheme: "dark" });
    expect(s.body).toBe(
      '## Hello\n\n\n- <Click as="span" at={2}>one</Click>\n- <Click as="span" at={1} effect="fade-up">two</Click>\n\\{curly\\}\n\n<Notes>\n\nSpeak.\n\n</Notes>',
    );
  });

  test("separators split a section into slides and stacks; reveal's code meta is respelt", () => {
    const md = "## A\n\n```js [2: 1|2]\na\nb\n```\n\n---\n\n## B\n\n--\n\n## B.1\n";
    const r = convertReveal(
      page('<section data-markdown="talk.md" data-separator-vertical="^\\n--\\n$"></section>'),
      { readFile: (p) => (p === "talk.md" ? md : null) },
    );
    const s = slides(r.mdx);
    expect(s.map((x) => [x.vertical, x.body.split("\n")[0]])).toEqual([
      [false, "## A"],
      [false, "## B"],
      [true, "## B.1"],
    ]);
    expect(s[0]!.body).toContain("```js {1|2}{lines:true,startLine:2}");
  });

  test("a missing Markdown file is an error, and the deck still converts", () => {
    const r = convertReveal(page('<section data-markdown="gone.md"></section>'));
    expect(what(r)).toContain("error: The Markdown file gone.md was not found");
    expect(slides(r.mdx)).toHaveLength(1);
  });
});

describe("golden: a reveal.js demo deck", () => {
  const root = fileURLToPath(new URL("../../test/fixtures/reveal/demo", import.meta.url));
  test("converts, compiles in the runtime compiler, and reports what it should", async () => {
    const r = convertReveal(readFileSync(join(root, "index.html"), "utf8"), {
      readFile: (p) => {
        try {
          return readFileSync(join(root, p), "utf8");
        } catch {
          return null;
        }
      },
      exists: (p) => existsSync(join(root, p)),
    });
    expect(r.mdx).toMatchSnapshot();
    expect(r.info.slides).toBe(23);
    expect(r.info.assets).toEqual([{ from: "assets/wave.svg", to: "public/assets/wave.svg" }]);
    expect(Object.keys(r.files).sort()).toEqual(["src/reveal.css", "src/reveal/custom.css"]);
    const compiled = await compileDeck(r.mdx, { files: r.files, packages: false });
    expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(compiled.missing).toEqual([]);
    const report = formatImportReport(r, { source: "demo/index.html", titles: r.info.titles });
    expect(report).toContain("by `kadal-deck import reveal`");
    expect(report).toContain("reveal.js `black` → Kadal `reveal`, variant `black` (dark)");
    expect(report).toContain("The onclick handler on <button> is dropped");
  });
});
