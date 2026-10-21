import { describe, expect, test } from "bun:test";

import { deckUrl, headTags, injectHead, metaName, renderTag } from "./head.ts";

const metas = (tags: ReturnType<typeof headTags>) =>
  Object.fromEntries(
    tags.flatMap((t) => (t.tag === "meta" && !t.media ? [[t.name, t.content]] : [])),
  );

describe("the deck's head from its headmatter", () => {
  test("title, info, author and lang become the page's and Open Graph's", () => {
    const tags = headTags({ title: "Maps", info: "How we map", author: "Ana", lang: "pt-BR" });
    expect(tags[0]).toEqual({ tag: "title", text: "Maps" });
    expect(metas(tags)).toMatchObject({
      description: "How we map",
      author: "Ana",
      "og:title": "Maps",
      "og:description": "How we map",
      "og:type": "website",
      "og:locale": "pt_BR",
      "twitter:card": "summary",
    });
  });

  test("seoMeta keys take unhead's names and win over the deck's own values", () => {
    const tags = headTags({
      title: "Maps",
      seoMeta: {
        ogTitle: "Maps, the talk",
        ogSiteName: "Talks",
        ogImageAlt: "A map",
        twitterSite: "@ana",
        twitterCreator: "@ana",
        robots: "noindex",
        googleSiteVerification: "abc",
      },
    });
    expect(metas(tags)).toMatchObject({
      "og:title": "Maps, the talk",
      "og:site_name": "Talks",
      "og:image:alt": "A map",
      "twitter:site": "@ana",
      "twitter:creator": "@ana",
      robots: "noindex",
      "google-site-verification": "abc",
    });
    expect(metaName("ogImageSecureUrl")).toEqual({ key: "property", name: "og:image:secure_url" });
    expect(metaName("twitterCard")).toEqual({ key: "name", name: "twitter:card" });
  });

  test("og:image is absolute at the deck's address when ogUrl is known, and asks for the large card", () => {
    const at = (ogImage: string, base = "/") =>
      metas(
        headTags(
          { seoMeta: { ogImage, ogUrl: "https://talks.ana.dev/maps" } },
          { base, ogImageFile: "og-image.png" },
        ),
      );
    expect(at("auto")["og:image"]).toBe("https://talks.ana.dev/maps/og-image.png");
    expect(at("./cover.png")["og:image"]).toBe("https://talks.ana.dev/maps/cover.png");
    expect(at("/cover.png", "/talks/maps/")["og:image"]).toBe(
      "https://talks.ana.dev/maps/cover.png",
    );
    expect(at("https://cdn.example/c.png")["og:image"]).toBe("https://cdn.example/c.png");
    expect(at("auto")["twitter:card"]).toBe("summary_large_image");
    // Without an address it stays a path under the base.
    expect(
      metas(
        headTags({ seoMeta: { ogImage: "auto" } }, { base: "/x/", ogImageFile: "og-image.png" }),
      )["og:image"],
    ).toBe("/x/og-image.png");
    // `auto` with nothing made (the runtime) names no picture.
    expect(
      metas(headTags({ seoMeta: { ogImage: "auto" } }, { ogImageFile: null }))["og:image"],
    ).toBeUndefined();
  });

  test("canonical, favicon and theme-color (one, or one per scheme)", () => {
    const tags = headTags(
      { favicon: "/logo.svg", seoMeta: { canonical: "https://a.dev/x/" } },
      { base: "/x/", themeColor: { light: "#fff", dark: "#000" } },
    );
    expect(tags).toContainEqual({
      tag: "link",
      rel: "icon",
      href: "/x/logo.svg",
      type: "image/svg+xml",
    });
    expect(tags).toContainEqual({ tag: "link", rel: "canonical", href: "https://a.dev/x/" });
    expect(tags.filter((t) => t.tag === "meta" && t.name === "theme-color")).toHaveLength(2);
    const one = headTags(
      { seoMeta: { themeColor: "#0f766e" } },
      { themeColor: { light: "#fff", dark: "#000" } },
    );
    expect(one.filter((t) => t.tag === "meta" && t.name === "theme-color")).toEqual([
      { tag: "meta", key: "name", name: "theme-color", content: "#0f766e" },
    ]);
  });

  test("deckUrl puts a deck path under the base and leaves URLs alone", () => {
    expect(deckUrl("cover.png", "/t/")).toBe("/t/cover.png");
    expect(deckUrl("./cover.png", "/t/")).toBe("/t/cover.png");
    expect(deckUrl("/cover.png", "/t/")).toBe("/t/cover.png");
    expect(deckUrl("/t/cover.png", "/t/")).toBe("/t/cover.png");
    expect(deckUrl("data:image/png;base64,AA", "/t/")).toBe("data:image/png;base64,AA");
  });

  test("values are escaped", () => {
    expect(
      renderTag({ tag: "meta", key: "name", name: "description", content: `a "b" <c> & d` }),
    ).toBe(`<meta name="description" content="a &quot;b&quot; &lt;c&gt; &amp; d" />`);
  });
});

describe("injectHead", () => {
  const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="theme-color" content="#0a0a0a" />
    <title>Deck</title>
    <meta name="description" content="old" />
    <script type="module" src="/assets/x.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

  test("replaces the template's tags, adds the rest before </head>, sets lang, keeps the rest", () => {
    const out = injectHead(
      page,
      headTags({ title: "Maps", info: "New", lang: "ta" }, { themeColor: "#123456" }),
      {
        lang: "ta",
      },
    );
    expect(out).toContain(`<html lang="ta">`);
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).toContain("<title>Maps</title>");
    expect(out).not.toContain(`content="old"`);
    expect(out).not.toContain("#0a0a0a");
    expect(out).toContain(`<meta name="theme-color" content="#123456" />`);
    expect(out).toContain(`<script type="module" src="/assets/x.js"></script>`);
    expect(out.indexOf("og:title")).toBeLessThan(out.indexOf("</head>"));
  });

  test("a page without lang gets one; nothing to add changes nothing", () => {
    expect(injectHead("<html><head></head></html>", [], { lang: "de" })).toBe(
      `<html lang="de"><head></head></html>`,
    );
    expect(injectHead(page, [])).toBe(page);
  });
});
