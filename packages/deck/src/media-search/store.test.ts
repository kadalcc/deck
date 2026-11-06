import { describe, expect, test } from "bun:test";
import { parse as parseYaml } from "yaml";

import { collectCredits } from "../credits/model.ts";
import { resolveBackground } from "../core/model.ts";
import { MediaSession } from "./search.ts";
import {
  type StoreElement,
  parseStorePage,
  storeCreditLine,
  storeFileUrl,
  storeFrontmatter,
  storeMdx,
  storeResult,
  storeSearchUrl,
} from "./store.ts";

const host = "https://deck.example";
const ID = "kse_abcdefghijklmnopqrst";

/** A shelf element as the host sends it (@stack/store-shelf ShelfElement). */
function element(over: Partial<StoreElement> = {}): StoreElement {
  return {
    id: ID,
    kind: "pattern",
    title: "Indigo",
    alt: "White waves on indigo",
    tags: ["japanese"],
    product: {
      slug: "seigaiha-waves-pattern",
      name: "Seigaiha Waves Pattern",
      category: "patterns",
      url: "https://store.kadal.cc/p/seigaiha-waves-pattern",
    },
    v: "0123456789ab",
    ext: "png",
    contentType: "image/png",
    bytes: 120000,
    width: 2048,
    height: 2048,
    still: { ext: "webp", contentType: "image/webp", bytes: 9000, width: 512, height: 512 },
    pro: false,
    ...over,
  };
}

const CREDIT = `provider="kadal-store" id="${ID}" credit="Indigo · Seigaiha Waves Pattern" creditUrl="https://store.kadal.cc/p/seigaiha-waves-pattern?ref=deck-credits" license="Kadal Deck licence" licenseUrl="https://store.kadal.cc/licence/#kadal-deck"`;
const SRC = `${host}/api/v1/media/store/files/${ID}/0123456789ab`;

describe("Kadal Store: the shelf as results", () => {
  test("file addresses, the credit line, the search URL", () => {
    const el = element();
    expect(storeFileUrl(host, el)).toBe(`${SRC}.png`);
    expect(storeFileUrl(host, el, true)).toBe(`${SRC}.still.webp`);
    expect(storeCreditLine(el)).toBe("Indigo · Seigaiha Waves Pattern");
    expect(storeCreditLine(element({ title: "Seigaiha Waves Pattern" }))).toBe(
      "Seigaiha Waves Pattern",
    );
    expect(storeSearchUrl(host, "waves", { kind: "pattern", size: 12 })).toBe(
      `${host}/api/v1/media/store/search?q=waves&kinds=pattern&size=12&mdx=1`,
    );
  });

  test("the page is read defensively: odd ids, versions and kinds are dropped", () => {
    const page = parseStorePage({
      items: [
        element(),
        { ...element(), id: "nope" },
        { ...element(), v: "xyz" },
        { ...element(), kind: "spaceship" },
        null,
      ],
      total: 9,
    });
    expect(page.items.map((i) => i.id)).toEqual([ID]);
    expect(page.total).toBe(9);
    expect(parseStorePage([element()]).items).toHaveLength(1);
  });

  test("a pattern tiles and a wallpaper covers, as the slide's frontmatter background", () => {
    const fm = storeFrontmatter(host, element());
    expect(fm).toBe(
      [
        "---",
        "background:",
        `  image: "${SRC}.png"`,
        '  size: "480px"',
        "  repeat: repeat",
        "  provider: kadal-store",
        `  id: ${ID}`,
        '  credit: "Indigo · Seigaiha Waves Pattern"',
        '  creditUrl: "https://store.kadal.cc/p/seigaiha-waves-pattern?ref=deck-credits"',
        "  license: Kadal Deck licence",
        '  licenseUrl: "https://store.kadal.cc/licence/#kadal-deck"',
        "---",
      ].join("\n"),
    );
    // The engine reads it as a tiled, stage-sized, credited background.
    const parsed = parseYaml(fm.replace(/^---\n|\n---$/g, "")) as Record<string, unknown>;
    expect(resolveBackground(parsed)).toMatchObject({
      repeat: "repeat",
      size: "480px",
      stageSize: true,
    });
    expect(collectCredits([{ content: "", frontmatter: parsed }])[0]!.id).toBe("kadal-store");
    expect(storeFrontmatter(host, element({ kind: "wallpaper", ext: "jpg" }))).toContain(
      "  size: cover",
    );
    // A shader is a Pro background, and only that.
    const shader = element({ kind: "shader", ext: "glsl", pro: true });
    expect(storeMdx(host, shader)).toBe(storeFrontmatter(host, shader));
    expect(storeFrontmatter(host, shader)).toContain("  component: pro/shader");
    expect(storeFrontmatter(host, shader)).toContain(`  shader: ${ID}`);
    expect(storeFrontmatter(host, element({ kind: "image" }))).toBe("");
    // …and credited from its background mapping like a pattern.
    const shaderFm = parseYaml(storeFrontmatter(host, shader).replace(/^---\n|\n---$/g, ""));
    expect(collectCredits([{ content: "", frontmatter: shaderFm }])[0]!.items[0]!.title).toBe(
      "Indigo · Seigaiha Waves Pattern",
    );
  });

  test("every placeable kind goes in as the builder inserts it", () => {
    const mdx = (over: Partial<StoreElement>) => storeMdx(host, element(over));
    expect(mdx({ kind: "image", ext: "jpg" })).toBe(
      `<Image src="${SRC}.jpg" alt="White waves on indigo" ${CREDIT} />`,
    );
    expect(mdx({})).toBe(`<Image src="${SRC}.png" alt="White waves on indigo" ${CREDIT} />`);
    expect(mdx({ kind: "sticker", ext: "webp", width: 400, height: 400 })).toBe(
      `<Sticker src="${SRC}.webp" still="${SRC}.still.webp" alt="White waves on indigo" size={360} x={780} y={360} ${CREDIT} />`,
    );
    expect(mdx({ kind: "icon", ext: "svg", width: 64, height: 64 })).toBe(
      `<Sticker src="${SRC}.svg" alt="White waves on indigo" size={200} x={860} y={440} ${CREDIT} />`,
    );
    expect(mdx({ kind: "music", ext: "mp3", loop: true })).toBe(
      `<Audio src="${SRC}.mp3" title="Indigo" loop ${CREDIT} />`,
    );
    expect(mdx({ kind: "sfx", ext: "mp3" })).toBe(
      `<Audio src="${SRC}.mp3" title="Indigo" ${CREDIT} />`,
    );
    expect(mdx({ kind: "video", ext: "webm", loop: true })).toBe(
      `<Video src="${SRC}.webm" poster="${SRC}.still.webp" autoplay loop muted title="Indigo" ${CREDIT} />`,
    );
    expect(mdx({ kind: "lottie", ext: "lottie" })).toBe(
      `<Lottie src="${SRC}.lottie" poster="${SRC}.still.webp" loop autoplay alt="White waves on indigo" ${CREDIT} />`,
    );
    expect(mdx({ kind: "lottie", ext: "json", loop: false })).toContain("loop={false}");
    expect(mdx({ kind: "model", ext: "glb" })).toBe(
      `<Model src="${SRC}.glb" poster="${SRC}.still.webp" alt="White waves on indigo" ${CREDIT} />`,
    );
    expect(mdx({ kind: "lut", ext: "cube" })).toBe(
      `lut="${SRC}.cube" lutCredit="Indigo · Seigaiha Waves Pattern" lutCreditUrl="https://store.kadal.cc/p/seigaiha-waves-pattern?ref=deck-credits"`,
    );
    expect(mdx({ kind: "gif", ext: "webp" })).toContain(`<Sticker src="${SRC}.webp"`);
    const meme = mdx({ kind: "meme-template", ext: "jpg", width: 800, height: 600 });
    expect(meme.startsWith(`<Meme\n  provider="kadal-store"\n  id="${ID}"`)).toBe(true);
    expect(meme).toContain('template={{"provider":"kadal-store"');
  });

  test("what each inserted tag owes is the same item in <Credits />", () => {
    const kinds = [
      "image",
      "sticker",
      "music",
      "video",
      "lottie",
      "model",
      "meme-template",
    ] as const;
    const groups = collectCredits(kinds.map((kind) => storeMdx(host, element({ kind }))));
    // The template's captions are in Anton, credited on its own.
    expect(groups.map((g) => g.id)).toEqual(["kadal-store", "font:anton"]);
    expect(groups[0]!.items).toEqual([
      {
        title: "Indigo · Seigaiha Waves Pattern",
        href: "https://store.kadal.cc/p/seigaiha-waves-pattern?ref=deck-credits",
      },
    ]);
  });

  test("a result: the host's own MDX when it sent it; the store page; the licence", () => {
    const own = storeResult(
      element({ mdx: '<Image src="/x.png" />', frontmatter: "---\nbackground: x\n---" }),
      host,
    );
    expect(own.mdx).toBe('<Image src="/x.png" />');
    expect(own.frontmatter).toBe("---\nbackground: x\n---");
    const r = storeResult(element({ kind: "music", ext: "mp3", still: undefined }), host);
    expect(r).toMatchObject({
      provider: "kadal-store",
      type: "music",
      id: ID,
      title: "Indigo · Seigaiha Waves Pattern",
      preview: null,
      attribution: "Kadal Store — Kadal Deck licence",
      link: "https://store.kadal.cc/p/seigaiha-waves-pattern?ref=deck-credits",
    });
  });
});

describe("MediaSession: Kadal Store", () => {
  function fakeFetch(answer: { status?: number; body: unknown }) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = (async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  test("asks the host (public, no sign-in), narrowed by type, for its MDX", async () => {
    const { f, calls } = fakeFetch({ body: { items: [element()], total: 1 } });
    const s = new MediaSession({ host, token: null, fetch: f });
    const got = await s.find({ kind: "store", query: "waves", type: "pattern", limit: 5 });
    expect(calls[0]!.url).toBe(
      `${host}/api/v1/media/store/search?q=waves&kinds=pattern&size=5&mdx=1`,
    );
    expect(got.sources).toEqual([{ provider: "kadal-store", count: 1 }]);
    expect(got.results[0]!.frontmatter).toContain("repeat: repeat");
  });

  test("a host without the shelf, or without the store behind it: notes, not errors", async () => {
    const session = (status: number) =>
      new MediaSession({ host, token: null, fetch: fakeFetch({ status, body: {} }).f });
    const note = async (status: number) =>
      (await session(status).find({ kind: "store", query: "x" })).sources[0]!.note;
    expect(await note(401)).toBe("this host doesn't serve Kadal Store yet");
    expect(await note(404)).toBe("this host doesn't serve Kadal Store yet");
    expect(await note(503)).toBe("Kadal Store isn't reachable from this host right now");
    const out = session(200);
    expect(out.find({ kind: "store", query: "x", type: "spaceship" })).rejects.toThrow(RangeError);
  });
});
