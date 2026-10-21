import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ogImagePlan } from "./pictures.ts";
import { siteSettings, subdirConfig } from "./site.ts";
import { DECK_ROUTES, writeStaticHostFiles } from "./static-host.ts";

describe("what the build is asked for", () => {
  test("the headmatter's keys, Slidev's spellings, and the CLI's switches over them", () => {
    expect(siteSettings({}, {})).toEqual({ pwa: false, remoteAssets: false, staticHost: true });
    expect(siteSettings({ pwa: true, bundleRemoteAssets: true }, {})).toEqual({
      pwa: true,
      remoteAssets: true,
      staticHost: true,
    });
    expect(siteSettings({ pwa: { name: "x" }, remoteAssets: "build" }, {}).remoteAssets).toBe(true);
    expect(siteSettings({ pwa: { name: "x" } }, {}).pwa).toBe(true);
    expect(siteSettings({ pwa: "dev", remoteAssets: "dev" }, {})).toMatchObject({
      pwa: false,
      remoteAssets: false,
    });
    expect(siteSettings({ pwa: true }, { KADAL_DECK_PWA: "0" }).pwa).toBe(false);
    expect(siteSettings({}, { KADAL_DECK_REMOTE_ASSETS: "1" }).remoteAssets).toBe(true);
    // The Kadal host: no fallbacks, no worker unless asked.
    expect(siteSettings({ pwa: true }, { KADAL_DECK_TARGET: "host" })).toEqual({
      pwa: false,
      remoteAssets: false,
      staticHost: false,
    });
    expect(siteSettings({}, { KADAL_DECK_TARGET: "host", KADAL_DECK_PWA: "1" }).pwa).toBe(true);
  });

  test("one of several decks: its folder on the base and the outDir, for the build only", () => {
    expect(subdirConfig({}, "build", "a")).toEqual({ base: "/a/", build: { outDir: "dist/a" } });
    expect(subdirConfig({ base: "/talks", build: { outDir: "out" } }, "build", "b")).toEqual({
      base: "/talks/b/",
      build: { outDir: "out/b" },
    });
    expect(subdirConfig({}, "serve", "a")).toBeNull();
    expect(subdirConfig({}, "build", undefined)).toBeNull();
  });
});

describe("the Open Graph card's plan", () => {
  let root = "";
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "kd-og-"));
    await mkdir(join(root, "public"));
    await writeFile(join(root, "cover.png"), "x");
    await writeFile(join(root, "public", "card.png"), "x");
  });
  afterAll(() => rm(root, { recursive: true, force: true }));
  const pub = () => join(root, "public");

  test("auto draws slide 1 unless a committed og-image.png is there", async () => {
    expect(ogImagePlan("auto", root, pub())).toEqual({
      file: "og-image.png",
      render: true,
      copyFrom: null,
    });
    await writeFile(join(root, "og-image.png"), "x");
    expect(ogImagePlan("auto", root, pub())).toEqual({
      file: "og-image.png",
      render: false,
      copyFrom: join(root, "og-image.png"),
    });
    // No key at all still picks the committed one up, as Slidev does.
    expect(ogImagePlan(undefined, root, pub()).file).toBe("og-image.png");
    await rm(join(root, "og-image.png"));
    expect(ogImagePlan(undefined, root, pub()).file).toBeNull();
  });

  test("a path is copied in (public/ needs nothing); a URL is the head's business; a missing file is no card", () => {
    expect(ogImagePlan("./cover.png", root, pub())).toEqual({
      file: "cover.png",
      render: false,
      copyFrom: join(root, "cover.png"),
    });
    expect(ogImagePlan("/card.png", root, pub())).toEqual({
      file: "card.png",
      render: false,
      copyFrom: null,
    });
    expect(ogImagePlan("https://cdn.dev/c.png", root, pub()).file).toBeNull();
    expect(ogImagePlan("./nope.png", root, pub()).file).toBeNull();
  });
});

describe("static hosts", () => {
  let out = "";
  let pub = "";
  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), "kd-static-"));
    pub = await mkdtemp(join(tmpdir(), "kd-public-"));
    await writeFile(join(out, "index.html"), "<html>deck</html>");
  });
  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
    await rm(pub, { recursive: true, force: true });
  });

  test("each route gets the page, plus 404.html and Netlify's rule; public/ files are kept", async () => {
    await writeFile(join(pub, "_redirects"), "/old /new 301\n");
    await writeFile(join(out, "_redirects"), "/old /new 301\n");
    const written = writeStaticHostFiles(out, "/talks/x/", pub);
    for (const r of DECK_ROUTES)
      expect(await readFile(join(out, r, "index.html"), "utf8")).toBe("<html>deck</html>");
    expect(await readFile(join(out, "404.html"), "utf8")).toBe("<html>deck</html>");
    expect(written).not.toContain("_redirects");
    expect(await readFile(join(out, "_redirects"), "utf8")).toBe("/old /new 301\n");
    await rm(join(pub, "_redirects"));
    writeStaticHostFiles(out, "/talks/x/", pub);
    expect(await readFile(join(out, "_redirects"), "utf8")).toBe(
      "/talks/x/*    /talks/x/index.html    200\n",
    );
  });

  test("a relative base gets 404.html only", async () => {
    const rel = await mkdtemp(join(tmpdir(), "kd-static-rel-"));
    await writeFile(join(rel, "index.html"), "x");
    expect(writeStaticHostFiles(rel, "./", null)).toEqual(["404.html"]);
    expect(existsSync(join(rel, "presenter"))).toBe(false);
    await rm(rel, { recursive: true, force: true });
  });
});
