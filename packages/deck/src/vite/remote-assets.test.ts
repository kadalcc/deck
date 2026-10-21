import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RemoteAssets,
  assetFileName,
  findInCode,
  findInCss,
  isBundlable,
  rewriteCode,
  rewriteCss,
} from "./remote-assets.ts";

describe("which URLs are assets", () => {
  test("by extension, and the font and photo hosts", () => {
    expect(isBundlable("https://x.dev/a/chart.png")).toBe(true);
    expect(isBundlable("https://x.dev/clip.MP4?v=2")).toBe(true);
    expect(isBundlable("https://fonts.googleapis.com/css2?family=Inter&display=swap")).toBe(true);
    expect(isBundlable("https://fonts.gstatic.com/s/inter/v13/abc")).toBe(true);
    expect(isBundlable("https://images.unsplash.com/photo-123?w=1600")).toBe(true);
    expect(isBundlable("https://x.dev/docs/page")).toBe(false);
    expect(isBundlable("ftp://x.dev/a.png")).toBe(false);
    expect(isBundlable("not a url")).toBe(false);
  });
});

describe("finding and rewriting them in code", () => {
  const code = `_jsx(_components.img, { src: "https://x.dev/a.png", alt: "https://x.dev/alt.png" });
_jsx("span", { children: "https://x.dev/sample.png" });
const fm = {"background":"https://images.unsplash.com/photo-1?w=1600","seoMeta":{"ogImage":"https://x.dev/og.png"}};
<img src="https://x.dev/b.jpg" />
const style = { backgroundImage: "url(https://x.dev/c.webp)" };
const page = { href: "https://x.dev/docs" };`;

  test("attribute-like literals and url(), never text, previews or pages", () => {
    expect(findInCode(code).sort()).toEqual(
      [
        "https://x.dev/a.png",
        "https://images.unsplash.com/photo-1?w=1600",
        "https://x.dev/b.jpg",
        "https://x.dev/c.webp",
      ].sort(),
    );
  });

  test("each found URL that has a copy is pointed at it; the others stay", () => {
    const out = rewriteCode(code, (u) =>
      u.includes("b.jpg") ? null : `/remote-assets/${u.length}.bin`,
    );
    expect(out).toContain(`src: "/remote-assets/19.bin"`);
    expect(out).toContain(`src="https://x.dev/b.jpg"`);
    expect(out).toContain(`"background":"/remote-assets/`);
    expect(out).toContain(`url(/remote-assets/`);
    expect(out).toContain(`children: "https://x.dev/sample.png"`);
    expect(out).toContain(`"ogImage":"https://x.dev/og.png"`);
  });

  test("CSS: url() and @import, relative URLs against a remote sheet", () => {
    const css = `@import url("https://fonts.googleapis.com/css2?family=Inter");
@import "https://x.dev/theme.css";
@font-face { src: url(../fonts/a.woff2) format("woff2"); }
.a { background: url('https://x.dev/bg.png') }
.b { background: url(data:image/png;base64,AA) }`;
    expect(findInCss(css, "https://x.dev/css/site.css").sort()).toEqual(
      [
        "https://fonts.googleapis.com/css2?family=Inter",
        "https://x.dev/theme.css",
        "https://x.dev/fonts/a.woff2",
        "https://x.dev/bg.png",
      ].sort(),
    );
    const out = rewriteCss(css, (u) => `L(${u.split("/").pop()})`, "https://x.dev/css/site.css");
    expect(out).toContain(`url("L(css2?family=Inter)")`);
    expect(out).toContain(`@import "L(theme.css)"`);
    expect(out).toContain(`url(L(a.woff2))`);
    expect(out).toContain("url(data:image/png;base64,AA)");
  });

  test("a copy is named by its URL's hash and its type", () => {
    expect(assetFileName("https://x.dev/a.PNG")).toMatch(/^remote-assets\/[0-9a-f]{16}\.png$/);
    expect(assetFileName("https://fonts.googleapis.com/css2?family=Inter")).toMatch(/\.css$/);
    expect(assetFileName("https://images.unsplash.com/photo-1", "image/jpeg; charset=x")).toMatch(
      /\.jpg$/,
    );
    expect(assetFileName("https://x.dev/blob", null)).toMatch(/\.bin$/);
    expect(assetFileName("https://x.dev/a.png")).toBe(assetFileName("https://x.dev/a.png"));
  });
});

describe("a build's downloads", () => {
  let root = "";
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "kd-remote-"));
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  const sheet = `@font-face { font-family: Inter; src: url(https://fonts.gstatic.com/s/inter/a.woff2) format("woff2"); }`;
  function fakeNet() {
    const asked: string[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      asked.push(url);
      const ua = new Headers(init?.headers).get("user-agent") ?? "";
      if (url.includes("down.dev"))
        throw new Error("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND") });
      if (url.includes("wght@300")) return new Response("no such weight", { status: 400 });
      if (url.startsWith("https://fonts.googleapis.com/"))
        return new Response(ua.includes("Chrome") ? sheet : "ttf please", {
          headers: { "content-type": "text/css" },
        });
      if (url.endsWith(".woff2"))
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "font/woff2" },
        });
      if (url.endsWith(".png"))
        return new Response(new Uint8Array([0x89, 0x50]), {
          headers: { "content-type": "image/png" },
        });
      return new Response("gone", { status: 404 });
    }) as unknown as typeof fetch;
    return { fetch, asked };
  }

  test("code and stylesheets are rewritten, a sheet's fonts come along, failures stay remote", async () => {
    const net = fakeNet();
    const r = new RemoteAssets({ root, base: "/talk/", fetch: net.fetch });
    const code = await r.code(
      `x({ src: "https://x.dev/a.png" }); y({ src: "https://down.dev/b.png" });`,
    );
    expect(code).toMatch(/src: "\/talk\/remote-assets\/[0-9a-f]{16}\.png"/);
    expect(code).toContain(`src: "https://down.dev/b.png"`);
    const css = await r.css(
      `@import url(https://fonts.googleapis.com/css2?family=Inter);`,
      "assets/index-abc.css",
    );
    expect(css).toMatch(/@import url\(\.\.\/remote-assets\/[0-9a-f]{16}\.css\)/);
    const files = await r.files();
    const fontCss = [...files].find(([n]) => n.endsWith(".css"))!;
    // The sheet points at its font beside it.
    expect(new TextDecoder().decode(fontCss[1])).toMatch(/url\([0-9a-f]{16}\.woff2\)/);
    expect([...files.keys()].filter((n) => n.endsWith(".woff2"))).toHaveLength(1);
    const summary = await r.summary();
    expect(summary[0]).toContain("3 bundled");
    expect(summary[0]).toContain("1 left remote");
    expect(summary.join("\n")).toContain("https://down.dev/b.png (getaddrinfo ENOTFOUND)");
  });

  test("a second build reads the cache and asks the network nothing", async () => {
    const net = fakeNet();
    const r = new RemoteAssets({ root, base: "/talk/", fetch: net.fetch });
    await r.code(`x({ src: "https://x.dev/a.png" })`);
    expect(net.asked).toEqual([]);
    expect((await r.summary())[0]).toContain("1 from the cache");
  });

  test("`fonts:` sheets map for the runtime; a refused weight falls back to its retry", async () => {
    const net = fakeNet();
    const r = new RemoteAssets({ root, base: "/", fetch: net.fetch });
    const map = await r.fonts({ sans: "Inter", weights: "300,400" });
    const keys = Object.keys(map);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toContain("wght@300");
    expect(map[keys[0]!]).toBe(map[keys[1]!]!);
    expect(map[keys[0]!]).toMatch(/^\/remote-assets\/[0-9a-f]{16}\.css$/);
    // The refused URL is not reported as left remote: its family made it.
    expect((await r.summary()).join("\n")).not.toContain("left remote");
  });

  test("index.html: links bundled, meta tags untouched", async () => {
    const r = new RemoteAssets({ root, base: "./", fetch: fakeNet().fetch });
    const html = await r.html(
      `<meta property="og:image" content="https://x.dev/a.png" /><link rel="icon" href="https://x.dev/a.png" />`,
    );
    expect(html).toContain(`content="https://x.dev/a.png"`);
    expect(html).toMatch(/href="\.\/remote-assets\/[0-9a-f]{16}\.png"/);
  });
});
