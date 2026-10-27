import { describe, expect, test } from "bun:test";

import { memeLayout } from "./meme-layouts.ts";
import { MediaSession } from "./search.ts";
import {
  type EmojiIndex,
  type KadalItem,
  emojiResult,
  emojiSetName,
  filterTemplates,
  iconResult,
  imgflipPage,
  imgflipResult,
  kadalFileUrl,
  kadalResult,
  klipyResult,
  klipySearchUrl,
  klipyShareRequest,
  parseIconSearch,
  parseImgflip,
  parseKadalCatalog,
  parseKlipyItem,
  parseKlipyPage,
  parseKlipyRef,
  popularEmoji,
  searchEmoji,
  searchKadal,
} from "./sources.ts";
import { attr, defaultCaptions, gifMdx, iconMdx, memeMdx, stickerMdx } from "./snippets.ts";

const cfg = { key: "app-key", customerId: "cust-hash", contentFilter: "high" };

const klipyRaw = (over: Record<string, unknown> = {}) => ({
  id: 4551195970372378,
  slug: "hello-hi-662",
  title: "Hello",
  type: "gif",
  file: {
    hd: {
      webp: { url: "https://static.klipy.com/hd.webp", width: 498, height: 498, size: 138000 },
    },
    md: { jpg: { url: "https://static.klipy.com/md.jpg", width: 320, height: 320 } },
    sm: { webp: { url: "https://static.klipy.com/sm.webp", width: 200, height: 200 } },
  },
  ...over,
});

describe("the MDX each source inserts (the builder's media-snippets.ts)", () => {
  test("attributes: strings quoted, unsafe strings and objects as expressions", () => {
    expect(attr("alt", "Ship it")).toBe('alt="Ship it"');
    expect(attr("alt", 'say "hi"')).toBe('alt={"say \\"hi\\""}');
    expect(attr("size", 360)).toBe("size={360}");
    expect(attr("loop", true)).toBe("loop");
    expect(attr("x", undefined)).toBe("");
  });

  test("a sticker is centred on the 1920×1080 stage, attributes in the builder's order", () => {
    expect(stickerMdx({ src: "/s.png", alt: "rocket", size: 360 })).toBe(
      '<Sticker src="/s.png" alt="rocket" size={360} x={780} y={360} />',
    );
    expect(
      stickerMdx({
        provider: "kadal",
        id: "kadal/ship-it",
        src: "/a.webp",
        still: "/a.png",
        alt: "Ship it",
        size: 360,
        aspect: 2,
      }),
    ).toBe(
      '<Sticker provider="kadal" id="kadal/ship-it" src="/a.webp" still="/a.png" alt="Ship it" size={360} x={780} y={450} />',
    );
  });

  test("KLIPY: a <Gif> with its id kept as a string, hd WebP, still, size", () => {
    const r = klipyResult(parseKlipyItem(klipyRaw()), "gifs");
    expect(r.mdx).toBe(
      '<Gif provider="klipy" id="4551195970372378" slug="hello-hi-662" src="https://static.klipy.com/hd.webp" still="https://static.klipy.com/md.jpg" title="Hello" width={498} height={498} />',
    );
    expect(r).toMatchObject({
      provider: "klipy",
      type: "gif",
      id: "gifs/hello-hi-662",
      preview: "https://static.klipy.com/sm.webp",
      bytes: 138000,
      attribution: "via KLIPY",
      link: "https://klipy.com/gifs/hello-hi-662",
      reportUse: true,
    });
    // Static memes have no still, and link to /memes/.
    const meme = klipyResult(parseKlipyItem(klipyRaw()), "static-memes");
    expect(meme.mdx).not.toContain("still=");
    expect(meme.link).toBe("https://klipy.com/memes/hello-hi-662");
    expect(meme.type).toBe("meme");
  });

  test("KLIPY: an ad keeps its place with nothing to insert", () => {
    const items = parseKlipyPage({
      data: { data: [klipyRaw(), klipyRaw({ type: "ad" }), klipyRaw({ slug: "b" })] },
    });
    expect(items.map((i) => i.renderable)).toEqual([true, false, true]);
    expect(klipyResult(items[1]!, "gifs").mdx).toBeNull();
  });

  test("emoji: <Emoji name set> inline, or the CDN image as a sticker", () => {
    const index: EmojiIndex = {
      sets: { twemoji: { label: "Twemoji", license: "CC-BY-4.0", ext: "svg" } },
      emoji: [
        { n: "party-popper", c: "🎉", k: "1f389", g: "Activities", w: ["tada"], s: ["twemoji"] },
      ],
    };
    const e = index.emoji[0]!;
    expect(emojiResult(index, e, "twemoji").mdx).toBe(
      '<Emoji name="party-popper" set="twemoji" />',
    );
    const sticker = emojiResult(index, e, "twemoji", true);
    expect(sticker.mdx).toBe(
      '<Sticker src="https://decks.kadal.cc/emoji/twemoji/1f389.svg" alt="party popper" size={320} x={800} y={380} />',
    );
    expect(sticker.attribution).toBe("Twemoji by Twitter, Inc and other contributors — CC BY 4.0");
  });

  test("icons: Lucide bare, any other set as set:name, at the builder's 1.5em", () => {
    expect(iconMdx({ name: "lucide:rocket", size: "1.5em" })).toBe(
      '<Icon name="rocket" size="1.5em" />',
    );
    const set = {
      prefix: "mdi",
      name: "Material Design Icons",
      author: "Pictogrammers",
      licence: { spdx: "Apache-2.0" },
      palette: false,
      samples: [],
    };
    const r = iconResult("mdi:rocket", set);
    expect(r.mdx).toBe('<Icon name="mdi:rocket" size="1.5em" />');
    expect(r.attribution).toBe("Material Design Icons by Pictogrammers — Apache 2.0");
    expect(r.preview).toBe("https://api.iconify.design/mdi/rocket.svg");
    expect(iconResult("lucide:rocket", undefined).mdx).toBe('<Icon name="rocket" size="1.5em" />');
  });

  test("icons: sets whose licence would not let an icon go in any deck are left out", () => {
    const got = parseIconSearch({
      icons: ["mdi:rocket", "nc:rocket", "gpl:rocket", "nope:rocket"],
      collections: {
        mdi: { name: "MDI", license: { spdx: "Apache-2.0" } },
        nc: { name: "NC", license: { spdx: "CC-BY-NC-4.0" } },
        gpl: { name: "GPL", license: { spdx: "GPL-3.0" } },
      },
    });
    expect(got.icons).toEqual(["mdi:rocket"]);
  });

  test("Imgflip: the template with its caption boxes where the meme editor puts them", () => {
    const [drake] = parseImgflip({
      success: true,
      data: {
        memes: [
          {
            id: "181913649",
            name: "Drake Hotline Bling",
            url: "https://i.imgflip.com/30b1gx.jpg",
            width: 1200,
            height: 1200,
            box_count: 2,
          },
        ],
      },
    });
    const r = imgflipResult(drake!);
    expect(r.mdx).toBe(
      memeMdx({
        src: "https://i.imgflip.com/30b1gx.jpg",
        alt: "Drake Hotline Bling",
        template: {
          provider: "imgflip",
          id: "181913649",
          url: imgflipPage(drake!),
          name: "Drake Hotline Bling",
        },
        captions: memeLayout("181913649")!,
        natural: { width: 1200, height: 1200 },
      }),
    );
    expect(r.mdx).toContain(
      '"x":52,"y":16,"width":45,"size":7,"color":"#000000","stroke":"transparent"',
    );
    expect(r.mdx).toContain("width={820}");
    expect(imgflipPage(drake!)).toBe("https://imgflip.com/meme/181913649/Drake-Hotline-Bling");
    // A template without a layout: top and bottom text (size 9 is the default, left out).
    const [plain] = parseImgflip({
      success: true,
      data: {
        memes: [
          {
            id: "1",
            name: "Plain",
            url: "https://i.imgflip.com/p.jpg",
            width: 600,
            height: 400,
            box_count: 2,
          },
        ],
      },
    });
    expect(imgflipResult(plain!).mdx).toContain('{"text":"Top text","x":5,"y":3,"width":90}');
    expect(filterTemplates([drake!, plain!], "drake")).toEqual([drake!]);
    expect(parseImgflip({ success: false })).toEqual([]);
  });

  test("defaultCaptions follows the meme editor's rule", () => {
    expect(defaultCaptions(1)).toHaveLength(1);
    expect(defaultCaptions(4).map((c) => c.y)).toEqual([3, 26, 48, 71]);
  });

  test('Kadal: stickers, GIF loops and meme templates, all provider="kadal"', () => {
    const cat = parseKadalCatalog({
      version: "v3",
      items: [
        {
          id: "kadal/ship-it",
          kind: "sticker",
          title: "Ship it",
          tags: ["deploy", "launch"],
          animated: true,
          width: 512,
          height: 512,
          files: {
            main: "stickers/ship-it.webp",
            still: "stickers/ship-it.png",
            gif: "stickers/ship-it.gif",
          },
          credit: "Kadal",
        },
        {
          id: "kadal/loading-forever",
          kind: "gif",
          title: "Loading forever",
          tags: ["wait"],
          animated: true,
          width: 800,
          height: 450,
          files: { main: "gifs/loading.webp", still: "gifs/loading.png" },
          credit: "Kadal",
        },
        {
          id: "kadal/two-doors",
          kind: "meme-template",
          title: "Two doors",
          tags: ["choice"],
          animated: false,
          width: 1200,
          height: 800,
          files: { main: "memes/two-doors.webp", still: "memes/two-doors.png" },
          captionBoxes: [
            { x: 0.05, y: 0.1, w: 0.4, h: 0.2 },
            { x: 0.55, y: 0.1, w: 0.4, h: 0.2 },
          ],
          credit: "Kadal",
        },
        { id: "broken", kind: "nope", files: {} },
      ],
    });
    expect(cat.items.map((i) => i.id)).toEqual([
      "kadal/ship-it",
      "kadal/loading-forever",
      "kadal/two-doors",
    ]);
    const host = "https://deck.kadal.cc";
    const [sticker, gif, tpl] = cat.items.map((i) => kadalResult(i, host, cat.version));
    expect(sticker!.mdx).toBe(
      `<Sticker provider="kadal" id="kadal/ship-it" src="${host}/api/v1/media/kadal/files/v3/stickers/ship-it.webp" still="${host}/api/v1/media/kadal/files/v3/stickers/ship-it.png" alt="Ship it" size={360} x={780} y={360} />`,
    );
    expect(gif!.mdx).toContain('<Gif provider="kadal" id="kadal/loading-forever"');
    expect(gif!.mdx).toContain("width={800} height={450}");
    expect(tpl!.type).toBe("template");
    expect(tpl!.mdx!.startsWith('<Meme\n  provider="kadal"\n  id="kadal/two-doors"\n')).toBe(true);
    expect(tpl!.mdx).toContain(
      'template={{"provider":"kadal","id":"kadal/two-doors","name":"Two doors"}}',
    );
    expect(tpl!.mdx).toContain('{"text":"Bottom text","x":55,"y":10,"width":40,"size":10.7}');
    expect(sticker!.attribution).toBe("Kadal — CC BY 4.0");
    // The host's rule: the version encoded, the (already checked) path as listed; unsafe paths are dropped.
    expect(kadalFileUrl(host, "v 3", "a/c.png")).toBe(
      `${host}/api/v1/media/kadal/files/v%203/a/c.png`,
    );
    expect(
      parseKadalCatalog({
        version: "v",
        items: [{ id: "kadal/x", kind: "sticker", files: { main: "../x.webp" } }],
      }).items,
    ).toEqual([]);
    expect(searchKadal(cat.items, "deploy").map((i) => i.id)).toEqual(["kadal/ship-it"]);
    expect(searchKadal(cat.items, "ship").map((i) => i.id)).toEqual(["kadal/ship-it"]);
  });
});

describe("KLIPY requests follow its integration rules", () => {
  test("search: per-person customer_id, content_filter=high, the key in the path", () => {
    const url = new URL(klipySearchUrl(cfg, "gifs", " mind blown ", 12));
    expect(url.origin).toBe("https://api.klipy.com");
    expect(url.pathname).toBe("/api/v1/app-key/gifs/search");
    expect(url.searchParams.get("q")).toBe("mind blown");
    expect(url.searchParams.get("customer_id")).toBe("cust-hash");
    expect(url.searchParams.get("content_filter")).toBe("high");
    expect(url.searchParams.get("per_page")).toBe("12");
  });

  test("no query is Trending; the filter is high even when the config forgets it", () => {
    const url = new URL(klipySearchUrl({ key: "k", customerId: "c" }, "stickers", ""));
    expect(url.pathname).toBe("/api/v1/k/stickers/trending");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.get("content_filter")).toBe("high");
  });

  test("the share trigger: POST with the customer id and the query", () => {
    const r = klipyShareRequest(cfg, "static-memes", "drake-1", " yes ");
    expect(r.url).toBe("https://api.klipy.com/api/v1/app-key/static-memes/share/drake-1");
    expect(r.init.method).toBe("POST");
    expect(JSON.parse(String(r.init.body))).toEqual({ customer_id: "cust-hash", q: "yes" });
  });

  test("result ids carry the kind", () => {
    expect(parseKlipyRef("stickers/abc")).toEqual({ kind: "stickers", slug: "abc" });
    expect(parseKlipyRef("abc")).toEqual({ kind: "gifs", slug: "abc" });
    expect(parseKlipyRef("other/abc")).toBeNull();
  });
});

describe("emoji: the builder's ranking and sets", () => {
  const list = [
    { n: "red-heart", c: "❤️", k: "2764", g: "Smileys & Emotion", w: ["heart"], s: ["noto"] },
    {
      n: "smiling-face-with-heart-eyes",
      c: "😍",
      k: "1f60d",
      g: "Smileys & Emotion",
      w: ["heart", "love"],
      s: ["noto"],
    },
    {
      n: "heart-on-fire",
      c: "❤️‍🔥",
      k: "2764-200d-1f525",
      g: "Smileys & Emotion",
      w: [],
      s: ["noto"],
    },
  ];
  test("a name that starts with the words beats a keyword", () => {
    expect(searchEmoji(list, "heart").map((e) => e.n)).toEqual([
      "heart-on-fire",
      "red-heart",
      "smiling-face-with-heart-eyes",
    ]);
  });
  test("set names: fluent is fluent-3d, unknown is refused", () => {
    expect(emojiSetName(undefined)).toBe("fluent-3d");
    expect(emojiSetName("fluent")).toBe("fluent-3d");
    expect(emojiSetName("Twemoji")).toBe("twemoji");
    expect(emojiSetName("apple")).toBeNull();
  });
  test("trending is the index's hand-picked run", () => {
    const popular = ["party-popper", "thumbs-up", "red-heart", "fire", "rocket"].map((n) => ({
      n,
      c: "",
      k: n,
      g: "",
      w: [],
      s: [],
    }));
    const tail = ["a", "b", "c", "d", "e"].map((n) => ({ n, c: "", k: n, g: "", w: [], s: [] }));
    expect(popularEmoji([...popular, ...tail]).map((e) => e.n)).toEqual(popular.map((e) => e.n));
  });
});

/** A fake network: answers by URL prefix, and remembers every request. */
function fakeFetch(
  routes: Record<string, (init?: RequestInit) => { status?: number; body: unknown }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const hit = Object.keys(routes).find((k) => url.startsWith(k));
    if (!hit) return new Response("no route", { status: 599 });
    const r = routes[hit]!(init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const host = "https://deck.example";

describe("MediaSession: the sources together", () => {
  test("signed out: KLIPY is skipped with a note, Kadal's 404 is a note, the rest answer", async () => {
    const { f, calls } = fakeFetch({
      [`${host}/api/v1/media/kadal/catalog`]: () => ({ status: 404, body: { error: "not_found" } }),
      "https://decks.kadal.cc/emoji/index.json": () => ({
        body: {
          sets: { "fluent-3d": { label: "Fluent 3D", ext: "png", license: "MIT" } },
          emoji: [
            {
              n: "rocket",
              c: "🚀",
              k: "1f680",
              g: "Travel & Places",
              w: ["space"],
              s: ["fluent-3d"],
            },
          ],
        },
      }),
    });
    const s = new MediaSession({ host, token: null, fetch: f });
    const got = await s.find({ kind: "sticker", query: "rocket" });
    expect(got.sources).toEqual([
      { provider: "kadal", count: 0, note: "this host doesn't serve Kadal's library yet" },
      {
        provider: "klipy",
        count: 0,
        note: "not signed in — run `kadal-deck login` to search KLIPY",
      },
      { provider: "emoji", count: 1 },
    ]);
    expect(got.results.map((r) => r.mdx)).toEqual([
      '<Sticker src="https://decks.kadal.cc/emoji/fluent-3d/1f680.png" alt="rocket" size={320} x={800} y={380} />',
    ]);
    expect(calls.some((c) => c.url.includes("klipy"))).toBe(false);
  });

  test("signed in: the key from the host (bearer), KLIPY asked directly, its order kept, use reported", async () => {
    const shares: unknown[] = [];
    const { f, calls } = fakeFetch({
      [`${host}/api/v1/media/config`]: () => ({
        body: { klipy: { key: "k1", customerId: "c1" }, operator: false },
      }),
      [`${host}/api/v1/media/kadal/catalog`]: () => ({ body: { version: "v1", items: [] } }),
      "https://api.klipy.com/api/v1/k1/gifs/search": () => ({
        body: {
          data: {
            data: [
              klipyRaw({ slug: "z-last", title: "Z" }),
              klipyRaw({ slug: "a-first", title: "A" }),
            ],
          },
        },
      }),
      "https://api.klipy.com/api/v1/k1/gifs/share/": (init) => {
        shares.push(JSON.parse(String(init?.body)));
        return { body: { result: true } };
      },
    });
    const s = new MediaSession({ host, token: "tok", fetch: f });
    const got = await s.find({ kind: "gif", query: "wave", limit: 5 });
    const config = calls.find((c) => c.url.endsWith("/api/v1/media/config"))!;
    const headers = (config.init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    const search = new URL(calls.find((c) => c.url.includes("/gifs/search"))!.url);
    expect(search.searchParams.get("customer_id")).toBe("c1");
    expect(search.searchParams.get("content_filter")).toBe("high");
    expect(search.searchParams.get("per_page")).toBe("5");
    // Nothing in KLIPY's answer is re-sorted.
    expect(got.results.map((r) => r.id)).toEqual(["gifs/z-last", "gifs/a-first"]);
    // A use found in an edit, once.
    const text = got.results[1]!.mdx!;
    expect(s.usedIn(`# Hi\n\n${text}`)).toEqual([{ kind: "gifs", slug: "a-first", query: "wave" }]);
    expect(await s.used("klipy", "gifs/a-first")).toEqual({
      reported: true,
      note: "Reported to KLIPY.",
    });
    expect(shares).toEqual([{ customer_id: "c1", q: "wave" }]);
    expect(s.usedIn(text)).toEqual([]);
    expect((await s.used("klipy", "gifs/a-first")).note).toBe("Already reported.");
    expect(shares).toHaveLength(1);
  });

  test("a host without a KLIPY key says so; a refused token says to log in again", async () => {
    const none = new MediaSession({
      host,
      token: "t",
      fetch: fakeFetch({ [`${host}/api/v1/media/config`]: () => ({ body: { klipy: null } }) }).f,
    });
    expect((await none.find({ kind: "meme", query: "yes" })).sources[0]!.note).toBe(
      "the host has no KLIPY key set up",
    );
    const refused = new MediaSession({
      host,
      token: "t",
      fetch: fakeFetch({ [`${host}/api/v1/media/config`]: () => ({ status: 401, body: {} }) }).f,
    });
    expect((await refused.find({ kind: "gif", query: "x" })).sources[1]!.note).toContain(
      "kadal-deck login",
    );
  });

  test("an unknown emoji set is a usage error", async () => {
    const s = new MediaSession({ host, token: null, fetch: fakeFetch({}).f });
    await expect(s.find({ kind: "emoji", query: "x", set: "apple" })).rejects.toThrow(RangeError);
  });
});

test("a typed KadalItem matches the contract's shape", () => {
  const item: KadalItem = {
    id: "kadal/x",
    kind: "illustration",
    title: "X",
    tags: [],
    animated: false,
    width: 10,
    height: 10,
    files: { main: "a.webp", still: "a.png", svg: "a.svg" },
    credit: "Kadal",
  };
  expect(kadalResult(item, host, "v").mdx).toContain("size={640}");
  expect(gifMdx({ provider: "klipy", src: "https://x" })).toBe(
    '<Gif provider="klipy" src="https://x" />',
  );
});
