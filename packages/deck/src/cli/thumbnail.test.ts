import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { freePort } from "./render.ts";
import {
  type Shot,
  hostFiles,
  picturesOf,
  publishThumbnail,
  refreshThumbnail,
  serveBuild,
  withPremiumBase,
} from "./thumbnail.ts";

let out = "";
beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "kd-thumb-"));
  await writeFile(join(out, "index.html"), "<!doctype html><title>deck</title>");
  await mkdir(join(out, "assets"));
  await writeFile(join(out, "assets", "a.js"), "console.log(1)");
});
afterAll(() => rm(out, { recursive: true, force: true }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const DARK = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);

/** A deck drawn in `deck` ("auto": whatever is asked), photographed. */
const drawn =
  (deck: "auto" | "light" | "dark") =>
  async (_url: string, asked: "light" | "dark"): Promise<Shot> => {
    const scheme = deck === "auto" ? asked : deck;
    return { png: scheme === "dark" ? DARK : PNG, scheme };
  };

/** A host that keeps what it is sent, or answers `status`. */
function fakeHost(status = 200) {
  const got: {
    url: string;
    method: string;
    type: string | null;
    auth: string | null;
    body: Uint8Array;
  }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const h = new Headers(init.headers);
    got.push({
      url,
      method: init.method ?? "GET",
      type: h.get("content-type"),
      auth: h.get("authorization"),
      body: new Uint8Array(init.body as ArrayBuffer),
    });
    return new Response(status === 200 ? JSON.stringify({ ok: true }) : JSON.stringify({ error: "not_found" }), {
      status,
    });
  }) as unknown as typeof fetch;
  return { fetch, got };
}

describe("the deck's picture after a publish", () => {
  test("the build is served at the host's base, falling back to the app's page", async () => {
    const port = await freePort();
    const server = await serveBuild(out, "/@me/talk/", port);
    try {
      const page = await fetch(`http://127.0.0.1:${port}/@me/talk/`);
      expect(await page.text()).toContain("<title>deck</title>");
      const js = await fetch(`http://127.0.0.1:${port}/@me/talk/assets/a.js`);
      expect(js.headers.get("content-type")).toContain("javascript");
      const route = await fetch(`http://127.0.0.1:${port}/@me/talk/presenter`);
      expect(await route.text()).toContain("<title>deck</title>");
      expect((await fetch(`http://127.0.0.1:${port}/elsewhere/`)).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${port}/@me/talk/assets/missing.js`)).status).toBe(404);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("slide 1 is photographed from the build and PUT to the host with the token", async () => {
    const host = fakeHost();
    let photographed = "";
    const r = await publishThumbnail({
      dir: out,
      outDir: out,
      base: "/@me/talk/",
      host: "https://host.test",
      token: "kd_tok",
      deckId: "d1",
      version: 7,
      fetch: host.fetch,
      render: async (url) => {
        photographed = url;
        expect(await (await fetch(url)).text()).toContain("deck");
        return { png: PNG, scheme: "light" };
      },
    });
    expect(r).toEqual({ ok: true, schemes: "fixed" });
    expect(photographed).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/@me\/talk\/$/);
    // Asked for dark, it came back light: a light deck, one picture.
    expect(host.got).toHaveLength(1);
    expect(host.got[0]).toMatchObject({
      url: "https://host.test/api/v1/decks/d1/thumbnail?version=7",
      method: "PUT",
      type: "image/png",
      auth: "Bearer kd_tok",
    });
    expect([...host.got[0]!.body]).toEqual([...PNG]);
  });

  test("an older host, or no Playwright, is a skipped picture — never a failed publish", async () => {
    const old = await publishThumbnail({
      dir: out,
      outDir: out,
      base: "/@me/talk/",
      host: "https://host.test",
      token: "t",
      deckId: "d1",
      version: 1,
      fetch: fakeHost(404).fetch,
      render: drawn("light"),
    });
    expect(old).toEqual({ ok: false, reason: "this host doesn't keep deck pictures yet" });
    const noBrowser = await publishThumbnail({
      dir: out,
      outDir: out,
      base: "/@me/talk/",
      host: "https://host.test",
      token: "t",
      deckId: "d1",
      version: 1,
      fetch: fakeHost().fetch,
      render: async () => {
        throw new Error("Rendering slides needs Playwright and Chromium.\nmore");
      },
    });
    expect(noBrowser).toEqual({
      ok: false,
      reason: "Rendering slides needs Playwright and Chromium.",
    });
  });
});

describe("as people see it: light or dark", () => {
  test("a deck that follows the viewer is sent as a pair, dark first (an old host keeps light)", async () => {
    const host = fakeHost();
    const r = await publishThumbnail({
      dir: out,
      outDir: out,
      base: "/@me/talk/",
      host: "https://host.test",
      token: "t",
      deckId: "d1",
      version: 3,
      fetch: host.fetch,
      render: drawn("auto"),
    });
    expect(r).toEqual({ ok: true, schemes: "both" });
    expect(host.got.map((g) => g.url)).toEqual([
      "https://host.test/api/v1/decks/d1/thumbnail?version=3&scheme=dark",
      "https://host.test/api/v1/decks/d1/thumbnail?version=3&scheme=light",
    ]);
    expect([...host.got[0]!.body]).toEqual([...DARK]);
    expect([...host.got[1]!.body]).toEqual([...PNG]);
  });

  test("a deck with a fixed scheme gets one picture, in its scheme", async () => {
    expect(await picturesOf((s) => drawn("dark")("", s))).toEqual([{ png: DARK, variant: null }]);
    expect(await picturesOf((s) => drawn("light")("", s))).toEqual([{ png: PNG, variant: null }]);
    expect(await picturesOf((s) => drawn("auto")("", s))).toEqual([
      { png: DARK, variant: "dark" },
      { png: PNG, variant: "light" },
    ]);
  });
});

describe("as people see it: the Pro library", () => {
  test("the page gets the host's premium base, answered through the host as the workspace", async () => {
    const asked: { url: string; auth: string | null }[] = [];
    const upstream = (async (url: string, init?: RequestInit) => {
      asked.push({ url, auth: new Headers(init?.headers).get("authorization") });
      if (url.endsWith("/catalog.json"))
        return new Response("[]", { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: "premium_required" }), { status: 402 });
    }) as unknown as typeof fetch;
    let seen = "";
    const r = await publishThumbnail({
      dir: out,
      outDir: out,
      base: "/@me/talk/",
      host: "https://host.test",
      token: "kd_tok",
      deckId: "d1",
      version: 1,
      workspace: "me",
      fetch: upstream,
      keep: async () => {},
      render: async (url, scheme) => {
        seen = await (await fetch(url)).text();
        const cat = await fetch(`${url}__kadal/premium/catalog.json`);
        expect(cat.status).toBe(200);
        expect(cat.headers.get("content-type")).toBe("application/json");
        // Whatever the host says — a Free workspace's 402 — the engine hears, as it does live.
        expect((await fetch(`${url}__kadal/premium/items/orbit.js`)).status).toBe(402);
        return { png: PNG, scheme };
      },
    });
    expect(r.ok).toBe(true);
    expect(seen).toContain(
      '<script>window.__KADAL_DECK__={"premium":"/@me/talk/__kadal/premium/"}</script>',
    );
    expect(asked[0]).toEqual({
      url: "https://host.test/api/v1/premium/w/me/catalog.json",
      auth: "Bearer kd_tok",
    });
  });

  test("withPremiumBase goes before the first script, or at the end of <head>", () => {
    expect(withPremiumBase("<head><script src=a.js></script>", "/@a/b/")).toBe(
      '<head><script>window.__KADAL_DECK__={"premium":"/@a/b/__kadal/premium/"}</script><script src=a.js></script>',
    );
    expect(withPremiumBase("<head></head>", "/@a/b/")).toContain("</script></head>");
  });
});

describe("kadal-deck thumbnail: the live version again", () => {
  test("the build is read from the host by hash, and the picture sent for the live version", async () => {
    const got: string[] = [];
    const host = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      got.push(`${method} ${url}`);
      if (url.endsWith("/decks/d9/files"))
        return Response.json({
          id: "d9",
          handle: "me",
          slug: "talk",
          version: 12,
          base: "/@me/talk/",
          files: [
            { path: "index.html", sha256: "a".repeat(64) },
            { path: "assets/a.js", sha256: "b".repeat(64) },
          ],
        });
      if (url.endsWith(`/files/${"a".repeat(64)}`))
        return new Response("<!doctype html><title>live deck</title><script src=x></script>");
      if (url.endsWith(`/files/${"b".repeat(64)}`)) return new Response("console.log(2)");
      if (method === "PUT") return Response.json({ ok: true });
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    const r = await refreshThumbnail({
      dir: out,
      host: "https://host.test",
      token: "t",
      deckId: "d9",
      fetch: host,
      render: async (url, scheme) => {
        const page = await (await fetch(url)).text();
        expect(page).toContain("live deck");
        expect(page).toContain("__kadal/premium/");
        expect(await (await fetch(`${url}assets/a.js`)).text()).toBe("console.log(2)");
        expect(await (await fetch(`${url}presenter`)).text()).toContain("live deck");
        expect((await fetch(`${url}assets/gone.js`)).status).toBe(404);
        return { png: scheme === "dark" ? DARK : PNG, scheme };
      },
    });
    expect(r).toMatchObject({ ok: true, schemes: "both", version: 12, base: "/@me/talk/" });
    expect(got.filter((g) => g.startsWith("PUT"))).toEqual([
      "PUT https://host.test/api/v1/decks/d9/thumbnail?version=12&scheme=dark",
      "PUT https://host.test/api/v1/decks/d9/thumbnail?version=12&scheme=light",
    ]);
    // Each file once, however often the page asks.
    expect(got.filter((g) => g.includes(`/files/${"a".repeat(64)}`))).toHaveLength(1);
  });

  test("hostFiles: a path the version doesn't list is no file, without asking", async () => {
    let asked = 0;
    const files = hostFiles({
      host: "https://host.test",
      token: "t",
      deckId: "d",
      files: [],
      fetch: (async () => {
        asked++;
        return new Response("x");
      }) as unknown as typeof fetch,
    });
    expect(await files("index.html")).toBeNull();
    expect(asked).toBe(0);
  });
});
