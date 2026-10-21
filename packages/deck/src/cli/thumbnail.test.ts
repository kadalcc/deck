import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { freePort } from "./render.ts";
import { publishThumbnail, serveBuild } from "./thumbnail.ts";

let out = "";
beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "kd-thumb-"));
  await writeFile(join(out, "index.html"), "<!doctype html><title>deck</title>");
  await mkdir(join(out, "assets"));
  await writeFile(join(out, "assets", "a.js"), "console.log(1)");
});
afterAll(() => rm(out, { recursive: true, force: true }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

/** A host that keeps what it is sent, or answers `status`. */
function fakeHost(status = 200) {
  const got: { url: string; method: string; type: string | null; auth: string | null; body: Uint8Array }[] = [];
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
        return PNG;
      },
    });
    expect(r).toEqual({ ok: true });
    expect(photographed).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/@me\/talk\/$/);
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
      render: async () => PNG,
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
    expect(noBrowser).toEqual({ ok: false, reason: "Rendering slides needs Playwright and Chromium." });
  });
});
