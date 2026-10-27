import { afterEach, describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveConfig } from "../core/model.ts";
import { DeckContext, type DeckRuntime, type ViewMode } from "../react/context.ts";
import {
  emojiKey,
  emojiSlug,
  emojiUrl,
  Emoji,
  Gif,
  gifMode,
  gifPlaceholder,
  mediaReportHref,
  Meme,
  memeCaptionStyle,
  memeLayout,
  memeTemplateCredit,
  readMediaReport,
  Sticker,
  stickerCredit,
  stickerPlace,
} from "./media.tsx";

/** Just enough of a deck for the media components: a mode, a config, no dev server. */
function render(el: ReactElement, mode: ViewMode = "play") {
  const deck = {
    mode,
    config: resolveConfig({ slug: "@ana/talk" }, { live: { api: "/api", room: "dabc123" } }),
    manifest: { dragApi: null },
    projector: false,
  } as unknown as DeckRuntime;
  return renderToStaticMarkup(createElement(DeckContext.Provider, { value: deck }, el));
}

const g = globalThis as { __KADAL_DECK__?: unknown };
afterEach(() => {
  delete g.__KADAL_DECK__;
});

describe("emoji files", () => {
  test("codepoints in lowercase hex, U+FE0F dropped, ZWJ kept", () => {
    expect(emojiKey("🎉")).toBe("1f389");
    expect(emojiKey("❤️")).toBe("2764");
    expect(emojiKey("❤")).toBe("2764");
    expect(emojiKey("👩‍💻")).toBe("1f469-200d-1f4bb");
    expect(emojiKey("🏳️‍🌈")).toBe("1f3f3-200d-1f308");
    expect(emojiKey("👍🏽")).toBe("1f44d-1f3fd"); // a skin tone is one more codepoint
    expect(emojiKey("1️⃣")).toBe("31-20e3");
  });

  test("names as the index spells them", () => {
    expect(emojiSlug("Party Popper")).toBe("party-popper");
    expect(emojiSlug(":party_popper:")).toBe("party-popper");
    expect(emojiSlug("  thumbs up! ")).toBe("thumbs-up");
  });

  test("the URL: base, set, key or name, extension per set", () => {
    expect(emojiUrl({ char: "🎉" })).toBe("https://decks.kadal.cc/emoji/fluent-3d/1f389.png");
    expect(emojiUrl({ char: "🎉", set: "twemoji", base: "/emoji/" })).toBe(
      "/emoji/twemoji/1f389.svg",
    );
    expect(emojiUrl({ name: "party-popper", set: "fluent-flat" })).toBe(
      "https://decks.kadal.cc/emoji/fluent-flat/party-popper.svg",
    );
    // char wins over name; an unknown set is the default one
    expect(emojiUrl({ name: "nope", char: "👍🏽", set: "comic-sans" as never })).toBe(
      "https://decks.kadal.cc/emoji/fluent-3d/1f44d-1f3fd.png",
    );
    expect(emojiUrl({})).toBeNull();
  });

  test("Noto Animated: the WebP, or a still PNG under reduced motion and in print", () => {
    expect(emojiUrl({ char: "🎉", set: "noto-animated" })).toBe(
      "https://decks.kadal.cc/emoji/noto-animated/1f389.webp",
    );
    expect(emojiUrl({ char: "🎉", set: "noto-animated", still: true })).toBe(
      "https://decks.kadal.cc/emoji/noto-animated/1f389.png",
    );
    // a still set stays as it is
    expect(emojiUrl({ char: "🎉", set: "fluent-3d", still: true })).toEndWith(".png");
    expect(render(createElement(Emoji, { char: "🎉", set: "noto-animated" }), "print")).toContain(
      "noto-animated/1f389.png",
    );
    expect(render(createElement(Emoji, { char: "🎉", set: "noto-animated" }))).toContain(
      "noto-animated/1f389.webp",
    );
  });

  test("the host's base wins over the default", () => {
    g.__KADAL_DECK__ = { emoji: "/emoji" };
    expect(render(createElement(Emoji, { name: "Party Popper" }))).toContain(
      'src="/emoji/fluent-3d/party-popper.png"',
    );
    expect(render(createElement(Emoji, { name: "Party Popper" }))).toContain('alt="party popper"');
  });
});

describe("<Gif>", () => {
  const props = {
    provider: "klipy",
    slug: "hello-hi-662",
    src: "https://static.klipy.com/ii/abc/hello.gif",
    title: "Hello",
    width: 498,
    height: 498,
  };

  test("plays hot-linked from the provider, credited", () => {
    const html = render(createElement(Gif, props));
    expect(html).toContain(`src="${props.src}"`);
    expect(html).toContain("via KLIPY");
    expect(html).toContain('href="https://klipy.com/gifs/hello-hi-662"');
  });

  test("print and export: a card with the title and the link, never the media", () => {
    const html = render(createElement(Gif, props), "print");
    expect(html).toContain("GIF: Hello — via KLIPY");
    expect(html).toContain("https://klipy.com/gifs/hello-hi-662");
    expect(html).not.toContain("static.klipy.com");
    expect(html).not.toContain("<img");
    expect(render(createElement(Gif, props), "export")).not.toContain("<img");
  });

  test("the placeholder's words, for any provider", () => {
    expect(gifPlaceholder({ provider: "klipy", title: " " }).label).toBe(
      "GIF: untitled — via KLIPY",
    );
    expect(gifPlaceholder({ provider: "giphy", id: "xT9Ig" }).href).toBe(
      "https://giphy.com/gifs/xT9Ig",
    );
    expect(gifPlaceholder({ provider: "acme" }).provider).toBe("Acme");
    expect(gifPlaceholder({ provider: "klipy", href: "javascript:alert(1)" }).href).toBe(
      "https://klipy.com",
    );
  });

  test("reduced motion: the still frame when the provider gave one; video stays a video", () => {
    const src = "https://static.klipy.com/a.gif";
    expect(
      gifMode({ src, still: "https://static.klipy.com/a.jpg", reduced: true, print: false }),
    ).toBe("still");
    expect(gifMode({ src, reduced: true, print: false })).toBe("image");
    expect(gifMode({ src: "https://x.test/a.mp4?t=1", reduced: false, print: false })).toBe(
      "video",
    );
    expect(gifMode({ src, still: "s", reduced: true, print: true })).toBe("card");
  });

  test("an MP4 renders muted and looping", () => {
    const html = render(createElement(Gif, { ...props, src: "https://static.klipy.com/a.mp4" }));
    expect(html).toContain("<video");
    expect(html).toContain("muted");
    expect(html).toContain("loop");
  });
});

describe("<Meme>", () => {
  test("defaults fill in and numbers stay on the image", () => {
    const [a, b] = memeLayout([
      { text: "Top" },
      { text: "Bottom", x: 80, y: 120, width: 50, size: 99, align: "left", color: "red; x" },
    ]);
    expect(a).toEqual({
      text: "Top",
      x: 5,
      y: 4,
      width: 90,
      size: 9,
      align: "center",
      color: "#fff",
      stroke: "#000",
    });
    expect(b).toMatchObject({ x: 80, y: 95, width: 20, size: 30, align: "left", color: "#fff" });
    expect(memeLayout("nope")).toEqual([]);
  });

  test("a caption's box: % of the image, letters in container units, an outline", () => {
    const s = memeCaptionStyle(memeLayout([{ text: "Hi", x: 10, y: 20, width: 80, size: 10 }])[0]!);
    expect(s).toMatchObject({
      left: "10%",
      top: "20%",
      width: "80%",
      fontSize: "10cqw",
      textAlign: "center",
      color: "#fff",
      WebkitTextStroke: "1.6cqw #000",
    });
  });

  test("the Imgflip link back, on screen and in print", () => {
    const template = {
      provider: "imgflip",
      id: "181913649",
      url: "https://imgflip.com/memetemplate/181913649",
    };
    expect(memeTemplateCredit(template)).toEqual({
      label: "Template via imgflip.com",
      href: "https://imgflip.com/memetemplate/181913649",
    });
    expect(memeTemplateCredit({ provider: "imgflip", url: "https://evil.test/" })?.href).toBe(
      "https://imgflip.com",
    );
    const el = createElement(Meme, {
      src: "https://i.imgflip.com/30b1gx.jpg",
      template,
      captions: [{ text: "Slides" }, { text: "Kadal Deck", y: 80 }],
    });
    const html = render(el, "print");
    expect(html).toContain("Template via imgflip.com");
    expect(html).toContain("is-print");
    expect(html).toContain(">Slides<");
    expect(html).toContain('alt="Slides / Kadal Deck"');
  });
});

describe("<Sticker>", () => {
  test("starts at x/y/size/rotate, or centred on the stage", () => {
    expect(
      stickerPlace({ x: 100, y: 50, size: 300, rotate: -8 }, { width: 1920, height: 1080 }),
    ).toBe("100,50,300,_,-8");
    expect(stickerPlace({}, { width: 1920, height: 1080 })).toBe("840,420,240,_");
  });

  test("is placed absolutely, mirrored on the image only", () => {
    const html = render(
      createElement(Sticker, { src: "/s/rocket.webp", x: 10, y: 20, flip: true }),
    );
    expect(html).toContain("deck-sticker");
    expect(html).toContain("left:10px");
    expect(html).toContain("top:20px");
    expect(html).toContain("scaleX(-1)");
  });

  test("a written pos wins", () => {
    const html = render(createElement(Sticker, { src: "/s.png", x: 10, pos: "500,600,120,_" }));
    expect(html).toContain("left:500px");
  });
});

describe("the report link", () => {
  test("only an http(s) URL or a same-site path, with the room and the address", () => {
    expect(
      readMediaReport({ __KADAL_DECK__: { mediaReport: "https://deck.kadal.cc/app/report" } }),
    ).toBe("https://deck.kadal.cc/app/report");
    expect(readMediaReport({ __KADAL_DECK__: { mediaReport: "javascript:x" } })).toBeNull();
    expect(readMediaReport({})).toBeNull();
    expect(mediaReportHref("/app/report", "d1", "assets/media/a b.png")).toBe(
      "/app/report?deck=d1&src=assets%2Fmedia%2Fa%20b.png",
    );
  });

  test("shown on screen, never in print", () => {
    g.__KADAL_DECK__ = { mediaReport: "https://deck.kadal.cc/app/report" };
    const gif = { src: "https://static.klipy.com/a.gif", title: "A" };
    expect(render(createElement(Gif, gif))).toContain("deck=dabc123");
    expect(render(createElement(Gif, gif), "print")).not.toContain("Report");
  });
});

describe('provider="kadal": our own media', () => {
  test("a Kadal GIF is drawn in print (its still first), a provider's is a card", () => {
    const src = "https://deck.kadal.cc/api/v1/media/kadal/files/v1/a.webp";
    expect(gifMode({ src, still: "s.png", reduced: false, print: true, own: true })).toBe("still");
    expect(gifMode({ src, reduced: false, print: true, own: true })).toBe("image");
    expect(gifMode({ src, still: "s.png", reduced: false, print: true })).toBe("card");
    expect(gifPlaceholder({ provider: "kadal", title: "Loading" }).label).toBe(
      "GIF: Loading — via Kadal",
    );
    const html = render(
      createElement(Gif, { provider: "kadal", src, still: "https://x/s.png", title: "Loading" }),
      "print",
    );
    expect(html).toContain('src="https://x/s.png"');
    expect(html).not.toContain("deck-gif-card");
  });

  test("stickers and memes are credited Kadal; a sticker's own credit wins", () => {
    expect(stickerCredit({ provider: "kadal" })).toEqual({
      label: "Kadal",
      href: "https://kadal.cc",
    });
    expect(stickerCredit({ credit: "Photo by Ana", creditUrl: "https://a.test/p" })).toEqual({
      label: "Photo by Ana",
      href: "https://a.test/p",
    });
    expect(stickerCredit({})).toBeNull();
    expect(memeTemplateCredit({ provider: "kadal", id: "kadal/two-doors" })).toEqual({
      label: "Template by Kadal",
      href: "https://kadal.cc",
    });
    const meme = render(
      createElement(Meme, { src: "https://x/m.webp", provider: "kadal", captions: [] }),
    );
    expect(meme).toContain("Template by Kadal");
  });

  test("a sticker shows its still in print, and its provider id is not the element's id", () => {
    const html = render(
      createElement(Sticker, {
        provider: "kadal",
        id: "kadal/ship-it",
        src: "https://x/a.webp",
        still: "https://x/a.png",
      }),
      "print",
    );
    expect(html).toContain('src="https://x/a.png"');
    expect(html).not.toContain('id="kadal/ship-it"');
    expect(html).toContain(">Kadal</a>");
  });
});
