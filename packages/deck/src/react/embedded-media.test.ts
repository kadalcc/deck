import { describe, expect, test } from "bun:test";

import {
  MESSAGES,
  embedPlayer,
  formatEmbeds,
  gifFit,
  isGif,
  loadLazyMedia,
  parallaxOffset,
  parallaxSize,
  shouldPreload,
  startFrames,
  startMessage,
  stopFrames,
  stopMessages,
  unloadFrame,
  videoSources,
  videoType,
  wantsAutoplay,
  withPlayerApi,
} from "./embedded-media.ts";

/** Just enough of an element for these helpers: attributes, a tag, a parent, a window. */
class FakeEl {
  attrs = new Map<string, string>();
  posted: string[] = [];
  loads = 0;
  parentElement: FakeEl | null = null;
  contentWindow = { postMessage: (m: string) => this.posted.push(m) };
  constructor(
    public tagName: string,
    attrs: Record<string, string> = {},
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  load() {
    this.loads++;
  }
}

/** A root whose querySelectorAll understands `tag[attr]` and `tag[attr], tag[attr]`. */
function root(els: FakeEl[]) {
  return {
    querySelectorAll(sel: string) {
      const parts = sel.split(",").map((p) => /^(\w+)(?:\[([\w-]+)\])?$/.exec(p.trim())!);
      return els.filter((e) =>
        parts.some(
          ([, tag, attr]) => e.tagName === tag!.toUpperCase() && (!attr || e.hasAttribute(attr)),
        ),
      );
    },
  } as unknown as ParentNode;
}

const YT = "https://www.youtube.com/embed/aqz-KE-bpKQ";
const YT_NOCOOKIE = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0";
const VIMEO = "https://player.vimeo.com/video/76979871";

describe("YouTube and Vimeo frames (R023)", () => {
  test("players are recognised by their embed address, the privacy-enhanced one included", () => {
    expect(embedPlayer(YT)).toBe("youtube");
    expect(embedPlayer(YT_NOCOOKIE)).toBe("youtube");
    expect(embedPlayer(VIMEO)).toBe("vimeo");
    expect(embedPlayer("https://www.youtube.com/watch?v=x")).toBeNull();
    expect(embedPlayer("https://example.com/demo.html")).toBeNull();
    expect(embedPlayer(null)).toBeNull();
  });

  test("the player API is switched on once, before a fragment, with ? or &", () => {
    expect(withPlayerApi(YT)).toBe(`${YT}?enablejsapi=1`);
    expect(withPlayerApi(YT_NOCOOKIE)).toBe(`${YT_NOCOOKIE}&enablejsapi=1`);
    expect(withPlayerApi(`${YT}?enablejsapi=1`)).toBe(`${YT}?enablejsapi=1`);
    expect(withPlayerApi(`${YT}?start=5#t=5`)).toBe(`${YT}?start=5&enablejsapi=1#t=5`);
    expect(withPlayerApi(VIMEO)).toBe(`${VIMEO}?api=1`);
    expect(withPlayerApi("https://example.com/a")).toBe("https://example.com/a");
  });

  test("the commands are reveal's strings, byte for byte", () => {
    expect(MESSAGES.youtubePlay).toBe('{"event":"command","func":"playVideo","args":""}');
    expect(MESSAGES.youtubePause).toBe('{"event":"command","func":"pauseVideo","args":""}');
    expect(MESSAGES.vimeoPlay).toBe('{"method":"play"}');
    expect(MESSAGES.vimeoPause).toBe('{"method":"pause"}');
    expect(JSON.parse(MESSAGES.youtubePlay)).toEqual({
      event: "command",
      func: "playVideo",
      args: "",
    });
  });

  test("an autoplaying player is told to play; otherwise it hears slide:start, as in reveal", () => {
    expect(startMessage(YT, true)).toBe(MESSAGES.youtubePlay);
    expect(startMessage(VIMEO, true)).toBe(MESSAGES.vimeoPlay);
    expect(startMessage(YT, false)).toBe("slide:start");
    expect(startMessage("https://example.com/demo", true)).toBe("slide:start");
  });

  test("leaving: slide:stop, then pause — not for a data-ignore player", () => {
    expect(stopMessages(YT, false)).toEqual(["slide:stop", MESSAGES.youtubePause]);
    expect(stopMessages(VIMEO, false)).toEqual(["slide:stop", MESSAGES.vimeoPause]);
    expect(stopMessages(YT, true)).toEqual(["slide:stop"]);
    expect(stopMessages("https://example.com/demo", false)).toEqual(["slide:stop"]);
  });

  test("formatEmbeds rewrites src and data-src of players only", () => {
    const a = new FakeEl("IFRAME", { src: YT });
    const b = new FakeEl("IFRAME", { "data-src": VIMEO });
    const c = new FakeEl("IFRAME", { src: "https://example.com/demo" });
    formatEmbeds(root([a, b, c]));
    expect(a.getAttribute("src")).toBe(`${YT}?enablejsapi=1`);
    expect(b.getAttribute("data-src")).toBe(`${VIMEO}?api=1`);
    expect(c.getAttribute("src")).toBe("https://example.com/demo");
  });
});

describe("slide:start / slide:stop (R027)", () => {
  test("every loaded frame hears slide:start; a player told to autoplay hears play", () => {
    const demo = new FakeEl("IFRAME", { src: "/demo.html" });
    const yt = new FakeEl("IFRAME", { src: `${YT}?enablejsapi=1`, "data-autoplay": "" });
    const unloaded = new FakeEl("IFRAME", { "data-src": "/lazy.html" });
    startFrames(root([demo, yt, unloaded]), (f) => f.hasAttribute("data-autoplay"));
    expect(demo.posted).toEqual(["slide:start"]);
    expect(yt.posted).toEqual([MESSAGES.youtubePlay]);
    expect(unloaded.posted).toEqual([]);
  });

  test("every frame hears slide:stop; players pause too", () => {
    const demo = new FakeEl("IFRAME", { src: "/demo.html" });
    const yt = new FakeEl("IFRAME", { src: YT });
    const ignored = new FakeEl("IFRAME", { src: VIMEO, "data-ignore": "" });
    stopFrames(root([demo, yt, ignored]));
    expect(demo.posted).toEqual(["slide:stop"]);
    expect(yt.posted).toEqual(["slide:stop", MESSAGES.youtubePause]);
    expect(ignored.posted).toEqual(["slide:stop"]);
  });

  test("unloading goes through about:blank, and leaves an unloaded frame alone", () => {
    const f = new FakeEl("IFRAME", { src: "/demo.html", "data-src": "/demo.html" });
    const seen: (string | null)[] = [];
    const set = f.setAttribute.bind(f);
    f.setAttribute = (k, v) => {
      seen.push(v);
      set(k, v);
    };
    unloadFrame(f as unknown as HTMLIFrameElement);
    expect(seen).toEqual(["about:blank"]);
    expect(f.getAttribute("src")).toBeNull();
    unloadFrame(f as unknown as HTMLIFrameElement);
    expect(seen).toEqual(["about:blank"]);
  });
});

describe("lazy data-src (R024)", () => {
  test("img, video and audio get their src; a <source> makes its media load again", () => {
    const img = new FakeEl("IMG", { "data-src": "/a.png" });
    const video = new FakeEl("VIDEO");
    const s1 = new FakeEl("SOURCE", { "data-src": "/a.webm" });
    const s2 = new FakeEl("SOURCE", { "data-src": "/a.mp4" });
    s1.parentElement = video;
    s2.parentElement = video;
    const audio = new FakeEl("AUDIO", { "data-src": "/a.mp3" });
    const done = new FakeEl("IMG", { "data-src": "/b.png", src: "/b.png" });
    loadLazyMedia(root([img, video, s1, s2, audio, done]));
    expect(img.getAttribute("src")).toBe("/a.png");
    expect(s1.getAttribute("src")).toBe("/a.webm");
    expect(s2.getAttribute("src")).toBe("/a.mp4");
    expect(video.loads).toBe(1);
    expect(audio.getAttribute("src")).toBe("/a.mp3");
    // Run again (the slide re-rendered): nothing reloads.
    loadLazyMedia(root([img, video, s1, s2, audio, done]));
    expect(video.loads).toBe(1);
  });
});

describe("autoplay and preload rules", () => {
  const el = (attrs: Record<string, string> = {}) => new FakeEl("IFRAME", attrs);
  test("autoPlayMedia wins; null falls back to data-autoplay, and a background always plays", () => {
    expect(wantsAutoplay(true, el())).toBe(true);
    expect(wantsAutoplay(false, el({ "data-autoplay": "" }))).toBe(false);
    expect(wantsAutoplay(null, el({ "data-autoplay": "" }))).toBe(true);
    expect(wantsAutoplay(null, el())).toBe(false);
    expect(wantsAutoplay(null, el(), true)).toBe(true);
    expect(wantsAutoplay(false, el(), true)).toBe(false);
  });

  test("preloadIframes (R026): true and false override data-preload; null defers to it", () => {
    expect(shouldPreload(true, el())).toBe(true);
    expect(shouldPreload(false, el({ "data-preload": "" }))).toBe(false);
    expect(shouldPreload(null, el({ "data-preload": "" }))).toBe(true);
    expect(shouldPreload(null, el())).toBe(false);
    expect(shouldPreload(undefined, el())).toBe(false);
  });
});

describe("background video sources (R015)", () => {
  test("one address or reveal's comma-separated list, typed from the extension", () => {
    expect(videoSources("/loop.mp4")).toEqual([{ src: "/loop.mp4", type: "video/mp4" }]);
    expect(videoSources("/a.webm, /a.mp4")).toEqual([
      { src: "/a.webm", type: "video/webm" },
      { src: "/a.mp4", type: "video/mp4" },
    ]);
    expect(videoSources("https://cdn.example/v?id=1")).toEqual([
      { src: "https://cdn.example/v?id=1" },
    ]);
    expect(videoSources("data:video/mp4;base64,AAA,BBB")).toHaveLength(1);
    expect(videoType("/clip.MOV?x=1")).toBe("video/quicktime");
    expect(videoType("/clip.ogv")).toBe("video/ogg");
  });
});

describe("GIFs (R014)", () => {
  test("a GIF is known by its address, in a url() or bare", () => {
    expect(isGif("/party.gif")).toBe(true);
    expect(isGif('url("/party.GIF")')).toBe(true);
    expect(isGif("/party.gif?v=2")).toBe(true);
    expect(isGif("/party.png")).toBe(false);
    expect(isGif("/gifs/a.webp")).toBe(false);
    expect(isGif(null)).toBe(false);
  });

  test("a GIF background is drawn as a restartable <img> when object-fit can say its size", () => {
    expect(gifFit("cover", "no-repeat")).toBe("cover");
    expect(gifFit("contain", "no-repeat")).toBe("contain");
    expect(gifFit("auto", "no-repeat")).toBe("none");
    expect(gifFit("100% 100%", "no-repeat")).toBe("fill");
    // Tiled, or sized in lengths: a CSS background, restarted under a new address instead.
    expect(gifFit("cover", "repeat")).toBeNull();
    expect(gifFit("160px 90px", "no-repeat")).toBeNull();
  });
});

describe("parallax (R018): reveal's updateParallax", () => {
  test("background size in pixels: one value is both; anything else is unknown", () => {
    expect(parallaxSize("2100px 900px")).toEqual([2100, 900]);
    expect(parallaxSize("1200px")).toEqual([1200, 1200]);
    expect(parallaxSize("cover")).toBeNull();
    expect(parallaxSize("50% 100%")).toBeNull();
    expect(parallaxSize("")).toBeNull();
  });

  test("worked out from the image: its spare width over the columns, spare height over the stacks", () => {
    const base = {
      columns: 5,
      verticalSlides: 3,
      image: [2100, 900] as [number, number],
      box: [1300, 700] as [number, number],
      horizontal: null,
      vertical: null,
    };
    // (2100 - 1300) / 4 = 200 px per column; (900 - 700) / 2 = 100 px per vertical step.
    expect(parallaxOffset({ ...base, h: 0, v: 0 })).toEqual({ x: 0, y: 0 });
    expect(parallaxOffset({ ...base, h: 1, v: 0 })).toEqual({ x: -200, y: 0 });
    expect(parallaxOffset({ ...base, h: 4, v: 2 })).toEqual({ x: -800, y: -200 });
  });

  test("explicit steps win; one column or no stacks do not move", () => {
    const o = {
      h: 3,
      v: 1,
      columns: 1,
      verticalSlides: 0,
      image: [2100, 900] as [number, number],
      box: [1300, 700] as [number, number],
    };
    expect(parallaxOffset({ ...o, horizontal: null, vertical: null })).toEqual({ x: 0, y: 0 });
    expect(parallaxOffset({ ...o, horizontal: 200, vertical: 50 })).toEqual({ x: -600, y: -50 });
  });
});
