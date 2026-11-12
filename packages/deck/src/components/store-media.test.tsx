import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { type ClickRegistry, createClickRegistry } from "../core/clicks.ts";
import { resolveConfig } from "../core/model.ts";
import {
  DeckContext,
  type DeckRuntime,
  SlideContext,
  type SlideContextValue,
  type ViewMode,
} from "../react/context.ts";
import { RenderContextProvider } from "../react/render-context.ts";
import { Audio, soundsOnArrival } from "./Audio.tsx";
import { Image } from "./content.tsx";
import { Lottie, lottieStillFrame } from "./Lottie.tsx";
import { crossesPlay } from "./media-clicks.ts";
import { stickerCredit } from "./media.tsx";
import { Model, modelAttributes, modelPlace } from "./Model.tsx";
import { Video, wantsHevcAlpha } from "./Video.tsx";

/**
 * Just enough of a deck and a slide for the media components: a mode, a config, a click
 * registry, and where the slide is drawn. `registry` is returned so a test can read the steps
 * a component registered.
 */
function render(
  el: ReactElement,
  o: {
    mode?: ViewMode;
    click?: number;
    active?: boolean;
    preview?: boolean;
    overview?: boolean;
  } = {},
): { html: string; registry: ClickRegistry } {
  const deck = {
    mode: o.mode ?? "play",
    config: resolveConfig({ slug: "@ana/talk" }, {}),
    manifest: { dragApi: null },
    projector: false,
  } as unknown as DeckRuntime;
  const registry = createClickRegistry();
  const slide = {
    meta: { frontmatter: {}, source: { file: "deck.mdx", line: 1 } },
    options: {},
    h: 0,
    v: 0,
    registry,
    click: o.click ?? 0,
    active: o.active ?? true,
    preview: o.preview ?? false,
  } as unknown as SlideContextValue;
  const inner = o.overview ? createElement(RenderContextProvider, { value: "overview" }, el) : el;
  const html = renderToStaticMarkup(
    createElement(
      DeckContext.Provider,
      { value: deck },
      createElement(SlideContext.Provider, { value: slide }, inner),
    ),
  );
  return { html, registry };
}

const STORE = {
  provider: "kadal-store",
  id: "kse_abcdefghijklmnopqrst",
  credit: "Indigo · Seigaiha Waves Pattern",
  creditUrl: "https://store.kadal.cc/p/seigaiha-waves-pattern?ref=deck-credits",
  license: "Kadal Deck licence",
  licenseUrl: "https://store.kadal.cc/licence/#kadal-deck",
};

describe("credits on hover", () => {
  test("a store item: its own credit, linked to its page; without one, Kadal Store", () => {
    expect(stickerCredit(STORE)).toEqual({ label: STORE.credit, href: STORE.creditUrl });
    expect(stickerCredit({ provider: "kadal-store" })).toEqual({
      label: "Kadal Store",
      href: "https://store.kadal.cc",
    });
    expect(stickerCredit({ provider: "KADAL" })?.label).toBe("Kadal");
    expect(stickerCredit({})).toBeNull();
  });

  test("a credited <Video> gets a box with the hover credit; a plain one stays a bare <video>", () => {
    const plain = render(<Video src="/a.mp4" autoplay />).html;
    expect(plain.startsWith("<video")).toBe(true);
    const credited = render(<Video src="/a.mp4" autoplay {...STORE} />).html;
    expect(credited).toContain('class="deck-video-frame"');
    expect(credited).toContain(`href="${STORE.creditUrl}"`);
    expect(credited).toContain(STORE.credit);
    // The store's id is the provider's, not the element's.
    expect(credited).not.toContain(`id="${STORE.id}"`);
    expect(render(<Video src="/a.mp4" id="intro" />).html).toContain('id="intro"');
    // Print has no hover.
    expect(render(<Video src="/a.mp4" {...STORE} />, { mode: "print" }).html).not.toContain(
      "deck-media-credit",
    );
  });
});

describe("<Video hevc>", () => {
  test("WebKit takes the HEVC-alpha clip; Blink and Gecko keep the WebM", () => {
    const UA = {
      safari:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
      iosSafari:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      iosChrome:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
      iosFirefox:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
      macChrome:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      macEdge:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      android:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0",
    };
    expect(
      Object.fromEntries(Object.entries(UA).map(([k, ua]) => [k, wantsHevcAlpha(ua)])),
    ).toEqual({
      safari: true,
      iosSafari: true,
      iosChrome: true,
      iosFirefox: true,
      macChrome: false,
      macEdge: false,
      android: false,
      firefox: false,
    });
  });

  test("rendered on the server (and while hydrating) it names the WebM, as every browser starts", () => {
    const html = render(<Video src="/a.webm" hevc="/a.mp4" autoplay loop />).html;
    expect(html).toContain('data-src="/a.webm"');
    expect(html).not.toContain("/a.mp4");
    expect(html).not.toContain("hevc=");
  });
});

describe("<Audio>", () => {
  test("a sound on a click: a step of the slide, invisible, run by itself", () => {
    const { html, registry } = render(<Audio src="/whoosh.mp3" at={2} {...STORE} />);
    expect(registry.total()).toBe(2);
    expect(html).toContain("data-clicks");
    expect(html).not.toContain("controls");
    expect(html).toContain('data-src="/whoosh.mp3"');
  });

  test("a player by default, and still one with autoplay (as before); a bed can hide it", () => {
    expect(render(<Audio src="/a.mp3" />).html).toContain("controls");
    expect(render(<Audio src="/a.mp3" autoplay />).html).toContain("controls");
    const bed = render(<Audio src="/bed.mp3" autoplay loop controls={false} fade={1200} />);
    expect(bed.html).not.toContain("controls");
    expect(bed.html).toContain("loop");
    expect(bed.registry.total()).toBe(0);
  });

  test("a credited player shows its credit on hover", () => {
    const html = render(<Audio src="/a.mp3" {...STORE} />).html;
    expect(html).toContain('class="deck-audio-frame"');
    expect(html).toContain(STORE.credit);
  });

  test("print draws nothing; a preview never loads it", () => {
    expect(render(<Audio src="/a.mp3" at={1} />, { mode: "print" }).html).toBe("");
    expect(render(<Audio src="/a.mp3" />, { preview: true }).html).toContain('preload="none"');
  });

  test("a cue passed is not replayed on arriving; a bed or an arrival sound is", () => {
    const cue = { events: [{ click: 2, action: "play" as const }] };
    expect(soundsOnArrival(cue, 3, { startClick: 2 })).toBe(false);
    expect(soundsOnArrival(cue, 3, { startClick: 2, loop: true })).toBe(true);
    expect(soundsOnArrival(cue, 1, { startClick: 2, loop: true })).toBe(false);
    const arrival = { events: [{ click: 0, action: "play" as const }] };
    expect(soundsOnArrival(arrival, 0, { startClick: 0 })).toBe(true);
    expect(crossesPlay(cue, 1, 2)).toBe(true);
    expect(crossesPlay(cue, 2, 3)).toBe(false);
  });
});

describe("<Lottie>", () => {
  test("print, the overview and a preview show the poster and never load the player", () => {
    for (const o of [{ mode: "print" as const }, { overview: true }, { preview: true }]) {
      const { html } = render(<Lottie src="/a.lottie" poster="/a.png" alt="A rocket" />, o);
      expect(html).toContain('class="deck-lottie-poster" src="/a.png"');
      expect(html).not.toContain("deck-lottie-player");
      expect(html).toContain('aria-label="A rocket"');
    }
  });

  test("live: the player's box, the poster until it is ready", () => {
    const { html } = render(<Lottie src="/a.json" poster="/a.png" size={320} />);
    expect(html).toContain("deck-lottie-player");
    expect(html).toContain("deck-lottie-poster");
    expect(html).toContain("width:320px");
  });

  test("x / y / pos place it like a sticker; `at` is a step of the slide", () => {
    const { html, registry } = render(<Lottie src="/a.json" x={100} y={200} size={300} at={1} />);
    expect(html).toContain("deck-lottie-placed");
    expect(html).toContain("deck-drag");
    expect(registry.total()).toBe(1);
    expect(render(<Lottie src="/a.json" />).html).not.toContain("deck-lottie-placed");
  });

  test("a still frame: the last once it has played by then (not looping), else the first", () => {
    const cue = { events: [{ click: 2, action: "play" as const }] };
    expect(lottieStillFrame(cue, 1, { loop: false, totalFrames: 90 })).toBe(0);
    expect(lottieStillFrame(cue, 2, { loop: false, totalFrames: 90 })).toBe(89);
    expect(lottieStillFrame(cue, 2, { loop: true, totalFrames: 90 })).toBe(0);
    expect(lottieStillFrame({ events: [] }, 5, { loop: false, totalFrames: 90 })).toBe(0);
  });
});

describe("<Model>", () => {
  test("print and the overview show the poster", () => {
    for (const o of [{ mode: "print" as const }, { overview: true }]) {
      const { html } = render(<Model src="/m.glb" poster="/m.png" alt="A chair" />, o);
      expect(html).toContain('class="deck-model-poster" src="/m.png"');
      expect(html).not.toContain("<model-viewer");
      expect(html).toContain('aria-label="A chair"');
    }
  });

  test("its box: square by default, `height` when given; placed with x / y", () => {
    expect(render(<Model src="/m.glb" size={400} />).html).toContain("aspect-ratio:400 / 400");
    expect(render(<Model src="/m.glb" size={400} height={300} />).html).toContain(
      "aspect-ratio:400 / 300",
    );
    expect(render(<Model src="/m.glb" x={10} y={20} />).html).toContain("deck-model-placed");
    expect(modelPlace({ x: 10, y: 20, size: 300 }, { width: 1920, height: 1080 })).toBe(
      "10,20,300,300",
    );
    expect(modelPlace({}, { width: 1920, height: 1080 })).toBe("720,300,480,480");
  });

  test("turns by itself only live and without reduced motion; the wheel stays the deck's", () => {
    const live = modelAttributes({ src: "/m.glb" }, { live: true, still: false, reduced: false });
    expect(live["auto-rotate"]).toBe(true);
    expect(live["rotation-per-second"]).toBe("30deg");
    expect(live["camera-controls"]).toBe(true);
    expect(live["disable-zoom"]).toBe(true);
    const calm = modelAttributes({ src: "/m.glb" }, { live: true, still: false, reduced: true });
    expect(calm["auto-rotate"]).toBeUndefined();
    const hidden = modelAttributes(
      { src: "/m.glb" },
      { live: false, still: false, reduced: false },
    );
    expect(hidden["auto-rotate"]).toBeUndefined();
    const still = modelAttributes({ src: "/m.glb" }, { live: false, still: true, reduced: false });
    expect(still["camera-controls"]).toBeUndefined();
    const zoom = modelAttributes(
      { src: "/m.glb", zoom: true, camera: "0deg 75deg 2m", exposure: 1.2, shadow: 0 },
      { live: true, still: false, reduced: false },
    );
    expect(zoom["disable-zoom"]).toBeUndefined();
    expect(zoom["camera-orbit"]).toBe("0deg 75deg 2m");
    expect(zoom.exposure).toBe("1.2");
    expect(zoom["shadow-intensity"]).toBe("0");
  });
});

describe("LUT grading", () => {
  test("an <Image lut> is kept out of sight until graded, loading with CORS once", () => {
    const html = render(<Image src="/photo.jpg" alt="Harbour" lut="/film.cube" />).html;
    expect(html).toContain('data-lut="pending"');
    expect(html).toContain('crossorigin="anonymous"');
    expect(render(<Image src="/photo.jpg" lut="/film.cube" lutStrength={0} />).html).not.toContain(
      "data-lut",
    );
    expect(render(<Image src="/photo.jpg" />).html).not.toContain("data-lut");
  });

  test("a <Video lut> loads with CORS in a box the grade's canvas goes into", () => {
    const html = render(<Video src="/clip.mp4" lut="/film.cube" autoplay />).html;
    expect(html).toContain('class="deck-video-frame"');
    expect(html).toContain('crossorigin="anonymous"');
  });

  test("the store's props never reach the DOM", () => {
    const html = render(
      <Image src="/a.png" {...STORE} lut="/x.cube" lutCredit="Teal" lutCreditUrl="https://x" />,
    ).html;
    expect(html).not.toContain("provider");
    expect(html).not.toContain("lutcredit");
    expect(html).not.toContain(`id="${STORE.id}"`);
  });
});
