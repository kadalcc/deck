import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "./index.ts";
import { type MediaItem, mediaFileName, mediaSnippet, pickMedia, publicPath } from "./media.ts";

const item = (id: string, name: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  kind: "sticker",
  name,
  contentType: "image/png",
  bytes: 2048,
  width: 200,
  height: 200,
  ...extra,
});

describe("media add: choosing the item and its file", () => {
  const items = [item("mA1", "Rocket"), item("mB2", "Rocket launch"), item("mC3", "Party cat.gif")];

  test("an id, an exact name, or the only name containing the words", () => {
    expect(pickMedia(items, "mB2").name).toBe("Rocket launch");
    expect(pickMedia(items, "rocket").id).toBe("mA1");
    expect(pickMedia(items, "cat").id).toBe("mC3");
    expect(() => pickMedia(items, "rock")).toThrow(/matches 2 items/);
    expect(() => pickMedia(items, "zebra")).toThrow(/No media item/);
  });

  test("file names: safe, short, with the extension the type has", () => {
    expect(mediaFileName(item("m1", "Rocket Launch!"))).toBe("rocket-launch.png");
    expect(mediaFileName(item("m1", "Party cat.gif", { contentType: "image/gif" }))).toBe(
      "party-cat.gif",
    );
    expect(mediaFileName(item("m1", "Café ☕", { contentType: "image/webp" }))).toBe("cafe.webp");
    expect(mediaFileName(item("m1", "🎉", { contentType: "video/mp4" }))).toBe("m1.mp4");
  });

  test("the address under public/, and the line to paste", () => {
    expect(publicPath("/deck", "/deck/public/stickers/a.png")).toBe("/stickers/a.png");
    expect(publicPath("/deck", "/deck/assets/a.png")).toBeNull();
    expect(mediaSnippet({ kind: "sticker", name: "Rocket" }, "/stickers/rocket.png")).toBe(
      '<Sticker src="/stickers/rocket.png" alt="Rocket" />',
    );
    expect(mediaSnippet({ kind: "video", name: "x" }, "/v.mp4")).toContain("<Video");
    expect(mediaSnippet({ kind: "gif", name: "x" }, "/x.gif")).toContain("<Image");
  });
});

describe("kadal-deck media against a host", () => {
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  let dir = "";
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...env };
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("add downloads into public/stickers/ and lists what was asked", async () => {
    dir = mkdtempSync(join(tmpdir(), "kd-media-"));
    process.env.KADAL_DECK_TOKEN = "kd_test";
    process.env.KADAL_DECK_HOST = "https://host.test";
    const seen: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push(`${String(url)} ${(init?.headers as Record<string, string>)?.authorization ?? ""}`);
      const u = new URL(String(url));
      if (u.pathname === "/api/v1/me") return Response.json({ current: { handle: "ana" } });
      if (u.pathname === "/api/v1/workspaces/ana/media")
        return Response.json({ items: [item("mA1", "Rocket")], next: null });
      if (u.pathname === "/api/v1/media/mA1/file") return new Response(new Uint8Array([1, 2, 3]));
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    const logs: string[] = [];
    const log = console.log;
    console.log = (l: string) => void logs.push(l);
    try {
      expect(await main(["media", "add", "rocket", "-C", dir])).toBe(0);
    } finally {
      console.log = log;
    }
    expect([...readFileSync(join(dir, "public", "stickers", "rocket.png"))]).toEqual([1, 2, 3]);
    expect(logs.join("\n")).toContain('<Sticker src="/stickers/rocket.png" alt="Rocket" />');
    expect(seen.some((s) => s.includes("q=rocket") && s.endsWith("Bearer kd_test"))).toBe(true);
    expect(seen.some((s) => s.includes("/media/mA1/file"))).toBe(true);
  });

  test("search --json: KLIPY straight from this machine, with the host's key and the rules", async () => {
    dir = mkdtempSync(join(tmpdir(), "kd-media-"));
    process.env.KADAL_DECK_TOKEN = "kd_test";
    process.env.KADAL_DECK_HOST = "https://host.test";
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(String(url));
      const u = new URL(String(url));
      if (u.host === "host.test" && u.pathname === "/api/v1/media/config")
        return Response.json({ klipy: { key: "pk", customerId: "c9" } });
      if (u.host === "host.test") return new Response("{}", { status: 404 });
      if (u.host === "api.klipy.com")
        return Response.json({
          data: {
            data: [
              {
                id: 1,
                slug: "wave-1",
                title: "Wave",
                type: "gif",
                file: {
                  hd: { gif: { url: "https://static.klipy.com/w.gif", width: 400, height: 300 } },
                },
              },
            ],
          },
        });
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    const logs: string[] = [];
    const log = console.log;
    const err = console.error;
    console.log = (l: string) => void logs.push(l);
    console.error = () => {};
    try {
      expect(
        await main([
          "media",
          "search",
          "gif",
          "wave",
          "hello",
          "--limit",
          "3",
          "--json",
          "-C",
          dir,
        ]),
      ).toBe(0);
    } finally {
      console.log = log;
      console.error = err;
    }
    const out = JSON.parse(logs.join("\n"));
    expect(out.ok).toBe(true);
    expect(out.query).toBe("wave hello");
    expect(out.results[0]).toMatchObject({
      provider: "klipy",
      id: "gifs/wave-1",
      attribution: "via KLIPY",
    });
    expect(out.results[0].mdx).toBe(
      '<Gif provider="klipy" id="1" slug="wave-1" src="https://static.klipy.com/w.gif" title="Wave" width={400} height={300} />',
    );
    const klipy = new URL(seen.find((u) => u.includes("api.klipy.com"))!);
    expect(klipy.pathname).toBe("/api/v1/pk/gifs/search");
    expect(klipy.searchParams.get("customer_id")).toBe("c9");
    expect(klipy.searchParams.get("content_filter")).toBe("high");
    expect(klipy.searchParams.get("per_page")).toBe("3");
    expect(out.sources.find((s: { provider: string }) => s.provider === "kadal").note).toContain(
      "doesn't serve",
    );
  });

  test("an unknown kind, or a search without words, is a usage error", async () => {
    const err = console.error;
    const log = console.log;
    console.error = () => {};
    console.log = () => {};
    try {
      expect(await main(["media", "search", "photo", "x"])).toBe(2);
      expect(await main(["media", "search", "gif"])).toBe(2);
      expect(await main(["media", "trending"])).toBe(2);
      expect(await main(["media", "used", "imgflip", "1"])).toBe(0);
    } finally {
      console.error = err;
      console.log = log;
    }
  });

  test("a missing subcommand is a usage error", async () => {
    const err = console.error;
    console.error = () => {};
    try {
      expect(await main(["media"])).toBe(2);
    } finally {
      console.error = err;
    }
  });
});
