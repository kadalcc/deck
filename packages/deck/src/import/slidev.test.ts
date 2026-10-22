import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { compileDeck } from "../runtime/compile.ts";
import { convertSlidev, formatImportReport, type SlidevImportOptions } from "./index.ts";

/** The converted deck's slides: frontmatter object and body. */
function slides(mdx: string): Array<{ fm: Record<string, unknown>; body: string }> {
  const out: Array<{ fm: Record<string, unknown>; body: string }> = [];
  // the converter writes `---` lines only as separators, and code fences never start with them
  // in these tests
  const parts = mdx.split(/^---\n/m).slice(1);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith("\n") || p === "") out.push({ fm: {}, body: p.trim() });
    else {
      const fm = (YAML.parse(p) as Record<string, unknown>) ?? {};
      out.push({ fm, body: (parts[i + 1] ?? "").trim() });
      i++;
    }
  }
  return out;
}

const convert = (md: string, o?: SlidevImportOptions) => convertSlidev(md, o);
/** The one slide of a one-slide deck, converted. */
const one = (body: string, head = "") => {
  const r = convert(`---\n${head}title: T\n---\n\n${body}\n`);
  return { body: slides(r.mdx)[0]!.body, r };
};
const what = (r: { report: Array<{ severity: string; what: string }> }) =>
  r.report.map((x) => `${x.severity}: ${x.what}`);

describe("headmatter", () => {
  test("theme: Slidev's name, the scoped package or slidev-theme-*, through the port table", () => {
    for (const t of ["seriph", "'@slidev/theme-seriph'", "slidev-theme-seriph"]) {
      const r = convert(`---\ntheme: ${t}\n---\n\n# A\n`);
      expect(slides(r.mdx)[0]!.fm.theme).toBe("seriph");
      expect(r.info.theme.package).toBe("@kadal/theme-seriph");
    }
    expect(convert("---\ntheme: apple-basic\n---\n# A").info.theme.kadal).toBe("crisp");
    expect(convert("---\ntheme: default\n---\n# A").info.theme.kadal).toBe("classic");
    // Slidev's default when the headmatter names none
    expect(slides(convert("# A").mdx)[0]!.fm.theme).toBe("classic");
  });

  test("an unknown theme is minimal, with its name in the report", () => {
    const r = convert("---\ntheme: penguin\n---\n# A");
    expect(r.info.theme.kadal).toBe("minimal");
    expect(what(r).join("\n")).toContain('warning: The Slidev theme "penguin" has no Kadal port');
  });

  test("keys Kadal spells another way", () => {
    const r = convert(
      [
        "---",
        "colorSchema: dark",
        "drawings:",
        "  persist: true",
        "  presenterOnly: true",
        "aspectRatio: 4/3",
        "exportFilename: talk",
        "export:",
        "  dark: true",
        "  withClicks: false",
        "favicon: /icon.png",
        "htmlAttrs:",
        "  lang: ta",
        "  dir: rtl",
        "highlighter: shiki",
        "info: false",
        "duration: 20min",
        "defaults:",
        "  layout: center",
        "---",
        "",
        "# A",
      ].join("\n"),
    );
    const fm = slides(r.mdx)[0]!.fm;
    expect(fm.colorScheme).toBe("dark");
    // Slidev's `persist: true` is files on disk; Kadal's `true` is browser storage
    expect(fm.drawings).toEqual({ persist: "files", presenterOnly: true });
    expect(fm.width).toBe(1920);
    expect(fm.height).toBe(1440);
    expect(fm.rtl).toBe(true);
    expect(fm.duration).toBe("20min");
    expect(fm.defaults).toEqual({ layout: "center" });
    expect("info" in fm).toBe(false);
    expect("highlighter" in fm).toBe(false);
    expect(r.info.exportArgs).toEqual(["--output", "talk", "--dark", "--no-with-clicks"]);
    expect(r.info.favicon).toBe("/icon.png");
    expect(r.info.htmlLang).toBe("ta");
    expect(r.report).toEqual([]);
  });

  test("Monaco's type settings carry over to Kadal's keys", () => {
    const r = convert(
      "---\nmonacoTypesSource: ata\nmonacoTypesAdditionalPackages: [lodash-es]\nmonacoTypesIgnorePackages: [left-pad]\n---\n# A",
    );
    const fm = slides(r.mdx)[0]!.fm;
    expect(fm.monacoTypes).toBe("cdn");
    expect(fm.monacoPackages).toEqual(["lodash-es"]);
    expect(fm.monacoTypesIgnore).toEqual(["left-pad"]);
    expect(slides(convert("---\nmonacoTypesSource: local\n---\n# A").mdx)[0]!.fm.monacoTypes).toBe(
      "auto",
    );
  });

  test("canvasWidth sets the scale every length is multiplied by", () => {
    expect(convert("---\ncanvasWidth: 1280\n---\n# A").info.canvas.scale).toBe(1.5);
    const { body } = one('<Arrow x1="10" y1="20" x2="100" y2="200" />', "canvasWidth: 960\n");
    expect(body).toBe("<Arrow x1={20} y1={40} x2={200} y2={400} />");
  });

  test("addons and settings Kadal does its own way are reported, not copied", () => {
    const r = convert(
      "---\naddons: [slidev-addon-qrcode, slidev-addon-mystery]\nhighlighter: prism\ncomark: true\n---\n# A",
    );
    const lines = what(r).join("\n");
    expect(lines).toContain(
      "info: The Slidev addon slidev-addon-qrcode is Vue code and is not carried over. Kadal draws QR codes",
    );
    expect(lines).toContain("warning: The Slidev addon slidev-addon-mystery is Vue code");
    expect(lines).toContain("info: highlighter: prism — Kadal always highlights with Shiki.");
    expect(lines).not.toContain("comark");
  });

  test("custom-nav-controls.vue becomes the custom-nav-controls layer ($nav.isPresenter too)", () => {
    const files: Record<string, string> = {
      "custom-nav-controls.vue":
        '<template>\n  <button v-if="!$nav.isPresenter" title="Next" @click="$nav.next">Next</button>\n</template>\n',
    };
    const r = convertSlidev("# A\n", { readFile: (p) => files[p] ?? null, list: () => [] });
    const tsx = r.files["src/custom-nav-controls.tsx"]!;
    expect(tsx).toContain("export default function CustomNavControls(props: LayerProps)");
    expect(tsx).toContain('(!(props.view === "presenter"))');
    expect(tsx).toContain('<SlidevOn as="button" click="next" title="Next">');
  });

  test("comark: true (and the older mdc: true) is carried: Kadal reads Comark natively", () => {
    for (const key of ["comark", "mdc"]) {
      const r = convert(`---\n${key}: true\n---\n\nThis is [red]{style="color:red"} :badge[New]\n`);
      expect(slides(r.mdx)[0]!.fm.comark).toBe(true);
      expect(what(r).join()).not.toContain(key);
    }
    expect(slides(convert("---\ncomark: false\n---\n# A").mdx)[0]!.fm.comark).toBeUndefined();
  });
});

describe("transitions", () => {
  test("one Slidev transition everywhere is Kadal's own", () => {
    const r = convert("---\ntransition: slide-left\n---\n# A\n---\n# B");
    const s = slides(r.mdx);
    expect(s[0]!.fm.transition).toBe("slide");
    expect(s[0]!.fm.transitions).toBeUndefined();
    expect(s[1]!.fm.transition).toBeUndefined();
  });

  test("per-slide transitions become definitions: Slidev's is the way out, Kadal's the way in", () => {
    const r = convert(
      "---\ntransition: slide-left\n---\n# A\n---\ntransition: fade-out\n---\n# B\n---\n# C",
    );
    const s = slides(r.mdx);
    const defs = s[0]!.fm.transitions as Record<
      string,
      { in: string; out: string; back: { in: string; out: string } }
    >;
    // B arrives the way A leaves (slide-left), and leaves its own way (fade-out)
    expect(s[1]!.fm.transition).toBe("slidev-slide-left-then-fade-out");
    expect(defs["slidev-slide-left-then-fade-out"]).toEqual({
      in: "deck-slide-in-right",
      out: "slidev-fade-out-out",
      back: { in: "slidev-fade-out-in", out: "deck-slide-out-right" },
    });
    // the fade-out keyframes are written into the deck
    expect(r.files["src/slidev.css"]).toContain("@keyframes slidev-fade-out-in");
  });

  test("a transition Slidev defines in CSS fades, with a warning", () => {
    const r = convert(
      "---\ntransition: my-flip\n---\n# A\n---\n# B\n---\ntransition: fade\n---\n# C",
    );
    expect(what(r).join("\n")).toContain('warning: The transition "my-flip" is Slidev CSS');
  });
});

describe("click directives and components", () => {
  test("v-click on an element: the element becomes <Click as=…>", () => {
    expect(one('<div v-click class="x">A</div>').body).toBe(
      '<Click as="div" className="x">A</Click>',
    );
    expect(one('<img v-click="3" src="/a.png">').body).toBe(
      '<Click as="img" at={3} src="/a.png" />',
    );
    expect(one(`<p v-click="'+2'">A</p>`).body).toBe('<Click as="p" at="+2">A</Click>');
    expect(one('<li v-click="[2, 4]">A</li>').body).toBe('<Click as="li" at={[2, 4]}>A</Click>');
    expect(one("<p v-click.hide>A</p>").body).toBe('<Click as="p" hide>A</Click>');
    expect(one("<p v-click>A</p>\n<p v-after>B</p>").body).toBe(
      '<Click as="p">A</Click>\n<After as="p">B</After>',
    );
    expect(one('<p v-click="false">A</p>').body).toBe("<p>A</p>");
  });

  test("presets: one direction is Kadal's effect; others and mixes are Slidev's own", () => {
    expect(one("<p v-click.up>A</p>").body).toBe('<Click as="p" effect="fade-up">A</Click>');
    const r = one("<p v-click.fade.right>A</p>");
    expect(r.body).toBe(
      '<Click as="p" effect="slidev" className="slidev-anim-fade slidev-anim-right">A</Click>',
    );
    expect(r.r.files["src/slidev.css"]).toContain(
      ".deck-click.effect-slidev.is-hidden.slidev-anim-fade",
    );
    // `clickAnimation:` sets the default
    expect(one("<p v-click>A</p>", "clickAnimation: scale\n").body).toBe(
      '<Click as="p" effect="slidev" className="slidev-anim-scale">A</Click>',
    );
  });

  test("hide with a range has no Kadal form: it hides from the first click, with a warning", () => {
    const r = one('<p v-click.hide="[2, 4]">A</p>');
    expect(r.body).toBe('<Click as="p" at={2} hide>A</Click>');
    expect(what(r.r).join()).toContain("v-click.hide with a range");
  });

  test("an absolute click before a relative one: Slidev's count is written out", () => {
    const { body } = one(
      ["<p v-click>a</p>", '<p v-click="5">b</p>', "<p v-click>c</p>", "<p v-after>d</p>"].join(
        "\n",
      ),
    );
    // Slidev counts relative clicks among themselves (c = 2); Kadal's cursor would put c at 6
    expect(body).toBe(
      [
        '<Click as="p">a</Click>',
        '<Click as="p" at={5}>b</Click>',
        '<Click as="p" at={2}>c</Click>',
        '<Click as="p" at={2}>d</Click>',
      ].join("\n"),
    );
  });

  test("<v-click>, <v-after>, <v-clicks>, <v-click-gap>; inline ones are spans", () => {
    expect(one('<v-click at="2">\n\nA\n\n</v-click>').body).toBe("<Click at={2}>\n\nA\n\n</Click>");
    expect(one("Text <v-click>more</v-click> here").body).toBe(
      'Text <Click as="span">more</Click> here',
    );
    expect(one('<v-clicks every="2" depth="2">\n\n- a\n  - b\n\n</v-clicks>').body).toBe(
      "<Clicks every={2} depth={2}>\n\n- a\n  - b\n\n</Clicks>",
    );
    expect(one('<v-click-gap size="2" />').body).toBe('<Click as="span" at="+2" aria-hidden />');
  });

  test("v-switch's numbered slots become <Case at>", () => {
    expect(
      one("<v-switch>\n  <template #1>one</template>\n  <template #2-4>two</template>\n</v-switch>")
        .body,
    ).toBe('<Switch>\n<Case at={1}>one</Case>\n<Case at="2-4">two</Case>\n</Switch>');
    // v-slot:N, Markdown inside a slot, Slidev's <VSwitch> spelling
    expect(
      one(
        "<VSwitch>\n  <template v-slot:1>one</template>\n  <template #2>\n\n**two**\n\n</template>\n</VSwitch>",
      ).body,
    ).toBe("<Switch>\n<Case at={1}>one</Case>\n<Case at={2}>\n\n**two**\n\n</Case>\n</Switch>");
    // a name that is not a step is the next case, with a warning
    const r = one("<v-switch>\n  <template #intro>a</template>\n</v-switch>");
    expect(r.body).toBe("<Switch>\n<Case>a</Case>\n</Switch>");
    expect(what(r.r).join()).toContain("not a click number");
  });

  test("v-mark: type, colour, options and step", () => {
    expect(one('<span v-mark.circle.red="3">x</span>').body).toBe(
      '<Mark type="circle" color="oklch(70.4% 0.191 22.216)" at={3}>x</Mark>',
    );
    expect(one(`<span v-mark="{ at: 2, color: '#f00', type: 'box' }">x</span>`).body).toBe(
      '<Mark at={2} color="#f00" type="box">x</Mark>',
    );
    expect(one("<b v-mark.strike>x</b>").body).toBe('<b><Mark type="strike-through">x</Mark></b>');
  });

  test("v-motion: variants, click targets, ms → s, px to the stage", () => {
    const { body } = one(
      '<div v-motion :initial="{ x: -80 }" :enter="{ x: 0, transition: { delay: 500 } }" :click-2="{ y: 10 }" :leave="{ x: 80 }">A</div>',
      "canvasWidth: 960\n",
    );
    expect(body).toBe(
      '<Motion as="div" initial={{ x: -160 }} enter={{ x: 0, transition: { delay: 0.5 } }} leave={{ x: 160 }} clicks={{ "click-2": { y: 20 } }}>A</Motion>',
    );
    // v-click + v-motion: the motion waits for its click
    expect(
      one('<p v-click v-motion :initial="{ x: 1 }" :enter="{ x: 0 }">A</p>', "canvasWidth: 1920\n")
        .body,
    ).toBe('<Motion as="p" initial={{ x: 1 }} enter={{ x: 0 }} at="+1">A</Motion>');
  });

  test("a binding reads the slide's <script setup>", () => {
    const { body } = one(
      '<img v-motion :initial="{ x: 0 }" :enter="final" src="/a.png">\n\n<script setup>\nconst final = { x: 0, scale: 1 }\n</script>',
      "canvasWidth: 1920\n",
    );
    expect(body).toBe(
      '<Motion as="img" initial={{ x: 0 }} enter={{ x: 0, scale: 1 }} src="/a.png" />',
    );
  });

  test("v-drag and <v-drag>: Kadal's Drag, positions scaled to the stage; names stay", () => {
    const head = "canvasWidth: 960\n";
    expect(one('<v-drag pos="10,20,100,_,-15">\n\nA\n\n</v-drag>', head).body).toBe(
      '<Drag pos="20,40,200,_,-15">\n\nA\n\n</Drag>',
    );
    expect(one('<img v-drag="[10, 20, 30, NaN]" src="/a.png">', head).body).toBe(
      '<Drag pos="20,40,60,_"><img src="/a.png" /></Drag>',
    );
    expect(one('<v-drag-arrow pos="10,20,30,40" two-way />', head).body).toBe(
      '<DragArrow pos="20,40,60,80" twoWay />',
    );
    const r = convert(
      '---\ncanvasWidth: 960\ndragPos:\n  logo: 10,20,30,40,5\n---\n\n<img v-drag="\'logo\'" src="/a.png">\n',
    );
    expect(slides(r.mdx)[0]!.fm.dragPos).toEqual({ logo: "20,40,60,80,5" });
    expect(slides(r.mdx)[0]!.body).toBe('<Drag pos="logo"><img src="/a.png" /></Drag>');
  });
});

describe("components, icons and Vue's template syntax", () => {
  test("Slidev's built-ins by their Kadal names and props", () => {
    expect(one('<Toc minDepth="1" maxDepth="2" />').body).toBe("<Toc minDepth={1} maxDepth={2} />");
    expect(
      one('<AutoFitText :max="200" :min="100" modelValue="Big" />', "canvasWidth: 1920\n").body,
    ).toBe("<FitText max={200} min={100}>Big</FitText>");
    expect(one('<Youtube id="luoMHjh-XcQ?start=42" />').body).toBe(
      '<Youtube id="luoMHjh-XcQ" start={42} />',
    );
    // a long id stays a string (a number would lose digits)
    expect(one('<Tweet id="1390115482657726468" scale="0.65" />').body).toBe(
      '<Tweet id="1390115482657726468" scale={0.65} />',
    );
    expect(one('<Transform :scale="0.5" origin="top center">x</Transform>').body).toBe(
      '<Transform origin="top center" scale={0.5}>x</Transform>',
    );
    expect(one('<Link to="3" title="Go">Go</Link>').body).toBe('<Link to="3" title="Go">Go</Link>');
    expect(
      one('<SlidevVideo v-click autoplay controls><source src="/v.mp4" /></SlidevVideo>').body,
    ).toBe('<Click><Video autoplay controls><source src="/v.mp4" /></Video></Click>');
    const p = one("<PoweredBySlidev mt-10 />");
    expect(p.body).toBe("");
    expect(what(p.r).join()).toContain("credit line");
  });

  test("LightOrDark's templates become slot children; RenderWhen's fallback a prop", () => {
    expect(
      one(
        "<LightOrDark>\n  <template #dark>D</template>\n  <template #light>L</template>\n</LightOrDark>",
      ).body,
    ).toBe('<LightOrDark>\n<div slot="dark">D</div>\n<div slot="light">L</div>\n</LightOrDark>');
    expect(
      one(
        '<RenderWhen context="presenter">Only here<template #fallback>Else</template></RenderWhen>',
      ).body,
    ).toBe('<RenderWhen context="presenter" fallback={<>Else</>}>Only here</RenderWhen>');
  });

  test("icons: Slidev's tags and UnoCSS's classes", () => {
    const r = one(
      '<carbon:arrow-right /> <mdi-account class="text-3xl" /> <div class="i-logos-vue mr-2" />',
    );
    expect(r.body).toBe(
      '<Icon name="carbon:arrow-right" size="1.2em" /> <Icon name="mdi:account" size="1.2em" className="text-3xl" /> <Icon name="logos:vue" size="1.2em" className="mr-2" />',
    );
    expect(r.r.info.iconSets).toEqual(["carbon", "logos", "mdi"]);
  });

  test("a component nobody defines stays as a comment, with an error", () => {
    const r = one('<FancyChart :data="[1, 2]" />');
    expect(r.body).toBe('{/* slidev: <FancyChart :data="[1, 2]" /> */}');
    expect(what(r.r).join()).toContain(
      "error: <FancyChart> is not a component the converted deck has.",
    );
  });

  test("mustaches: Slidev's runtime as components, the frontmatter as text", () => {
    expect(one("Page {{ $slidev.nav.currentPage }} of {{ $slidev.nav.total }}").body).toBe(
      "Page <SlideCurrentNo /> of <SlidesTotal />",
    );
    expect(one("By {{ $frontmatter.who }}", "who: Kadal\n").body).toBe("By Kadal");
    expect(one("Deck {{ $slidev.configs.title }}").body).toBe("Deck T");
    const r = one("Clicks: {{ $clicks }} of {{ $clicksContext.total }}");
    expect(r.body).toBe("Clicks: <ClickCount /> of <ClickCount total />");
    expect(what(r.r).join()).not.toContain("needs Vue");
    expect(one("{{ $clicksContext.current }} {{ $slidev.nav.clicks }}").body).toBe(
      "<ClickCount /> <ClickCount />",
    );
  });

  test("v-if on the click count: <ClickCount when>, v-else-if / v-else chains too", () => {
    const r = one(
      '<p v-if="$clicks > 3">late</p>\n<p v-else-if="$clicks == 2">two</p>\n<p v-else>else</p>',
    );
    expect(r.body).toBe(
      [
        "<ClickCount when={($clicks) => ($clicks > 3)}><p>late</p></ClickCount>",
        "<ClickCount when={($clicks) => !($clicks > 3) && ($clicks === 2)}><p>two</p></ClickCount>",
        "<ClickCount when={($clicks) => !($clicks > 3) && !($clicks === 2)}><p>else</p></ClickCount>",
      ].join("\n"),
    );
    expect(what(r.r).join()).not.toContain("decides while the deck runs");
    // Anything but the count and numbers is not translated: it still needs Vue.
    const other = one('<p v-if="$clicks > count">A</p>');
    expect(other.body).toBe("<p>A</p>");
    expect(what(other.r).join()).toContain("decides while the deck runs");
  });

  test("v-for over what is known is unrolled; v-if decided now when it can be", () => {
    expect(one('<li v-for="n in 3">Item {{ n }}</li>').body).toBe(
      "<li>Item 1</li>\n<li>Item 2</li>\n<li>Item 3</li>",
    );
    expect(one(`<p v-for="(w, i) in ['a', 'b']" :key="i">{{ i }}:{{ w }}</p>`).body).toBe(
      "<p>0:a</p>\n<p>1:b</p>",
    );
    expect(one('<p v-if="$frontmatter.show">A</p><p v-else>B</p>', "show: false\n").body).toBe(
      "<p>B</p>",
    );
    const r = one('<p v-if="$nav.isPresenter">A</p>');
    expect(r.body).toBe("<p>A</p>");
    expect(what(r.r).join()).toContain("decides while the deck runs");
  });

  test("@click with a Slidev navigation call: SlidevOn, written into the deck", () => {
    const r = one(
      '<div @click="$slidev.nav.next" class="mt-2">Next</div>\n<button @click="$slidev.nav.go(3)">3</button>',
    );
    expect(r.body).toBe(
      '<SlidevOn as="div" click="next" className="mt-2">Next</SlidevOn>\n<SlidevOn as="button" click="go:3">3</SlidevOn>',
    );
    expect(r.r.files["src/slidev.tsx"]).toContain("export function SlidevOn");
    expect(r.r.files["src/components.tsx"]).toContain("SlidevOn: SlidevOn");
    expect(what(one('<div @click="count++">x</div>').r).join()).toContain("runs Vue code; dropped");
  });

  test("HTML for MDX: className, style objects, void tags, attributify, escapes, autolinks, comments", () => {
    expect(
      one('<div class="a" style="flex-grow: 1; margin-top: 10px">x</div>', "canvasWidth: 960\n")
        .body,
    ).toBe('<div className="a" style={{ flexGrow: "1", marginTop: "20px" }}>x</div>');
    expect(one('a<br>b <img src="/x.png">').body).toBe('a<br />b <img src="/x.png" />');
    expect(one('<div grid="~ cols-2 gap-4" text-sm>x</div>').body).toBe(
      '<div className="grid grid-cols-2 grid-gap-4 text-sm">x</div>',
    );
    expect(one("a { b } c < d").body).toBe("a \\{ b \\} c \\< d");
    expect(one("See <https://sli.dev>").body).toBe("See [https://sli.dev](https://sli.dev)");
    expect(one("<!-- a remark -->\n\n# A").body).toBe("{/* a remark */}\n\n# A");
    expect(one("Inline `{code}` and $x^{2}$").body).toBe("Inline `{code}` and $x^{2}$");
    expect(one('<label for="a" tabindex="0">x</label>').body).toBe(
      '<label htmlFor="a" tabIndex="0">x</label>',
    );
  });

  test("speaker notes stay notes, their HTML converted too", () => {
    const r = convert('# A\n\n<!--\nSay <span class="x">this</span>\n\n[click] then that\n-->\n');
    expect(r.mdx).toContain('<!--\nSay <span className="x">this</span>\n\n[click] then that\n-->');
  });

  test("layout slots: <template #right> at the top is ::right::; layoutClass styles the layout", () => {
    const r = convert(
      "---\nlayout: two-cols\nlayoutClass: gap-16\n---\n\nLeft\n\n<template #right>\n\nRight\n\n</template>\n",
    );
    const body = slides(r.mdx)[0]!.body;
    expect(body).toContain("::right::\n\n\nRight");
    expect(body).toContain("<style>\n.deck-layout { gap: calc(4 * var(--slidev-rem)); }\n</style>");
  });

  test("a slide's <style>: @apply, lengths and Slidev's class names converted", () => {
    const { body } = one(
      "<style>\n.a { @apply mt-5 opacity-10; width: 10px; }\n.slidev-layout h1 { color: var(--slidev-theme-primary) }\n</style>",
      "canvasWidth: 960\n",
    );
    expect(body).toContain(
      ".a { margin-top: calc(1.25 * var(--slidev-rem)); opacity: 0.1; width: 20px; }",
    );
    expect(body).toContain(".deck-layout h1 { color: var(--deck-accent) }");
  });
});

describe("code", () => {
  test("Kadal reads Slidev's fences as they are", () => {
    const fence = "```ts [app.ts] {2|3}{lines:true} twoslash\nconst a = 1\n```";
    expect(one(fence).body).toBe(fence);
    expect(one("<<< @/snippets/a.ts#region {2|3}").body).toBe("<<< @/snippets/a.ts#region {2|3}");
  });

  test("maxHeight is scaled, `at` is dropped with a warning", () => {
    const r = one("```ts {2}{maxHeight:'100px',at:3}\na\nb\n```", "canvasWidth: 960\n");
    expect(r.body).toBe('```ts {2}{maxHeight: "200px"}\na\nb\n```');
    expect(what(r.r).join()).toContain("A code block's `at`");
  });

  test("{monaco-run} that imports is reported; twoslash's packages come from the project", () => {
    const r = one("```ts {monaco-run}\nimport { x } from './y'\n```");
    expect(what(r.r).join()).toContain("imports `./y`");
    const project = convert("```ts twoslash\nimport { ref } from 'vue'\n```", {
      readFile: (p) =>
        p === "package.json" ? JSON.stringify({ dependencies: { vue: "^3.5.0" } }) : null,
    });
    expect(project.info.devDependencies).toEqual({ vue: "^3.5.0" });
    const bare = convert("```ts twoslash\nimport { z } from 'zod'\n```");
    expect(what(bare).join()).toContain("which the project does not depend on");
  });
});

describe("the project: includes, Vue files, styles", () => {
  const project = (files: Record<string, string>): SlidevImportOptions => ({
    readFile: (p) => files[p] ?? null,
    list: (d) =>
      Object.keys(files)
        .filter((f) => f.startsWith(`${d}/`))
        .map((f) => f.slice(d.length + 1)),
  });

  test("src: includes are converted into pages/*.mdx; a missing one is an error", () => {
    const r = convert(
      "# A\n\n---\nsrc: ./pages/b.md#2\n---\n",
      project({ "pages/b.md": "# B1\n\n---\n\n# B2 <v-click>x</v-click>\n" }),
    );
    expect(slides(r.mdx)[1]!.fm.src).toBe("./pages/b.mdx#2");
    expect(r.files["pages/b.mdx"]).toContain('# B2 <Click as="span">x</Click>');
    const missing = convert("# A\n\n---\nsrc: ./nope.md\n---\n");
    expect(what(missing).join()).toContain(
      "error: src: ./nope.md — the file nope.md is not in the project.",
    );
  });

  test("a Vue component with props, refs and simple handlers becomes a working TSX component", () => {
    const counter = readFileSync(join(fixtures, "starter/components/Counter.vue"), "utf8");
    const r = convert(
      '<Counter :count="10" m="t-4" />',
      project({ "components/Counter.vue": counter }),
    );
    expect(slides(r.mdx)[0]!.body).toBe('<Counter className="m-t-4" count={10} />');
    const tsx = r.files["src/components/Counter.tsx"]!;
    expect(tsx).toContain("const p = { count: 0, ...props };");
    expect(tsx).toContain("const [counter, setCounter] = useState(p.count);");
    expect(tsx).toContain("onClick={() => setCounter((v) => v - 1)}");
    expect(tsx).toContain('<span className="m-auto p-2">{counter}</span>');
    expect(r.files["src/components.tsx"]).toContain(
      'import { Counter } from "./components/Counter.tsx";',
    );
    expect(r.report.filter((x) => x.severity !== "info")).toEqual([]);
  });

  test("a component whose script does more is a stub with one error", () => {
    const r = convert(
      "<Clock />",
      project({
        "components/Clock.vue":
          "<script setup>\nimport { useNow } from '@vueuse/core'\nconst now = useNow()\n</script>\n<template><div class=\"p-2\">{{ now }}</div></template>",
      }),
    );
    expect(r.files["src/components/Clock.tsx"]).toContain("TODO: the Vue file's script did more");
    const errors = r.report.filter((x) => x.severity === "error");
    expect(errors.length).toBe(1);
    expect(errors[0]!.what).toContain("Clock.vue has script logic");
  });

  test("layouts get Kadal's layout contract and named slots; layers read the deck from props", () => {
    const r = convert(
      "---\nlayout: split\n---\n\nL\n\n::side::\n\nS\n",
      project({
        "layouts/split.vue":
          '<template>\n  <div class="grid grid-cols-2">\n    <div><slot /></div>\n    <aside><slot name="side" /></aside>\n  </div>\n</template>',
        "global-top.vue":
          '<template>\n  <footer class="abs-br m-2">{{ $slidev.nav.currentPage }} / {{ $slidev.nav.total }}</footer>\n</template>',
      }),
    );
    expect(slides(r.mdx)[0]!.fm.layout).toBe("split");
    const layout = r.files["src/layouts/LayoutSplit.tsx"]!;
    expect(layout).toContain("export default function LayoutSplit({ children }: LayoutProps)");
    expect(layout).toContain('{slots["side"]}');
    expect(r.files["src/components.tsx"]).toContain('"layout:split": LayoutSplit');
    expect(r.files["src/global-top.tsx"]).toContain("{props.page} / {props.total}");
    expect(r.files["src/slidev.tsx"]).toContain("export function slotsOf");
  });

  test("styles/ are converted and imported; setup/ is reported", () => {
    const r = convert(
      "# A",
      project({ "styles/index.css": ".x { @apply p-4; }", "setup/main.ts": "export default {}" }),
    );
    expect(r.files["src/styles/index.css"]).toBe(".x { padding: var(--slidev-rem); }");
    expect(r.info.styleImports).toEqual(["./slidev.css", "./styles/index.css"]);
    expect(what(r).join()).toContain("setup/main.ts configures Slidev's app in code");
  });

  test("files <<< reads are copied; a missing one is a warning; a root style.css is imported", () => {
    const r = convert(
      "<<< @/src/a.ts#one\n\n<<< ./nope.ts",
      project({
        "src/a.ts": "// #region one\nx\n// #endregion one",
        "style.css": ".big { @apply text-3xl; }",
      }),
    );
    expect(r.info.copy).toEqual(["src/a.ts"]);
    expect(what(r).join()).toContain("<<< ./nope.ts: the file is not in the project.");
    expect(r.files["src/styles/style.css"]).toContain(
      ".big { font-size: calc(1.875 * var(--slidev-rem));",
    );
    expect(r.info.styleImports).toContain("./styles/style.css");
  });

  test("the utility stylesheet holds what the slides use; unknown classes are named once", () => {
    const r = convert(
      '---\nclass: text-center\n---\n\n<div class="abs-br my-own">x</div>\n\n<style>\n.my-own { color: red }\n</style>\n\n<p class="who-knows">y</p>\n',
    );
    const css = r.files["src/slidev.css"]!;
    expect(css).toContain(".abs-br { position: absolute;");
    expect(css).toContain(".text-center { text-align: center; }");
    expect(css).toContain("--slidev-rem: 31.347px;");
    const lines = what(r).filter((l) => l.includes("Classes with no CSS"));
    expect(lines).toEqual([expect.stringContaining("Classes with no CSS: who-knows.")]);
  });

  test("it never throws, whatever it is given", () => {
    for (const junk of [
      "",
      "---",
      "---\n---",
      "<div",
      "{{",
      "<v-click",
      '<p v-click="[[">',
      "```",
      "<!--",
      "---\n: : :\n---",
      "<script setup>const</script>",
      "\u0000",
    ])
      expect(() => convert(junk)).not.toThrow();
  });
});

const fixtures = fileURLToPath(new URL("../../test/fixtures/slidev", import.meta.url));

function fromFolder(dir: string): SlidevImportOptions & { text: string } {
  const read = (p: string) =>
    existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : null;
  return {
    text: read("slides.md")!,
    file: "slides.md",
    readFile: read,
    list: (d) => (existsSync(join(dir, d)) ? readdirSync(join(dir, d)) : []),
  };
}

describe("golden: real Slidev decks", () => {
  for (const name of ["starter", "composable-vue", "apple-basic"]) {
    test(`${name}: converts, compiles in the runtime compiler, and reports what it should`, async () => {
      const { text, ...o } = fromFolder(join(fixtures, name));
      const r = convertSlidev(text, o);
      expect(r.mdx).toMatchSnapshot();
      expect(
        formatImportReport(r, { source: `${name}/slides.md`, titles: r.info.titles }),
      ).toMatchSnapshot();
      // the hosted shell's compiler: every slide and note compiles
      const files: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.files)) if (k.endsWith(".mdx")) files[k] = v;
      if (o.list!("snippets").length)
        for (const f of o.list!("snippets")) files[`snippets/${f}`] = o.readFile!(`snippets/${f}`)!;
      const compiled = await compileDeck(r.mdx, { files, packages: false });
      expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(compiled.missing).toEqual([]);
    });
  }

  test("the starter: every slide but the {monaco-run} one converts with nothing to report", () => {
    const { text, ...o } = fromFolder(join(fixtures, "starter"));
    const r = convertSlidev(text, o);
    // 16 slides as the deck plays them: the `src:` slide is replaced by the one it includes
    expect(r.info.slides).toBe(16);
    expect(r.info.cleanSlides).toBe(15);
    expect(r.report.filter((x) => x.severity !== "info").map((x) => x.slide)).toEqual([15]);
    expect(r.info.titles[13]).toBe("Imported Slides");
    expect(r.info.theme.kadal).toBe("seriph");
    expect(r.info.iconSets).toEqual(["carbon"]);
    expect(r.info.devDependencies).toEqual({ vue: "^3.5.33" });
  });
});
