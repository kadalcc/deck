/**
 * What a slide does to the media inside it when it is shown and left, as reveal.js does it
 * (js/controllers/slidecontent.js): lazy `data-src` sources, the `slide:start` / `slide:stop`
 * messages an embedded page listens for, YouTube's and Vimeo's player commands, GIFs that start
 * again from frame one. SlideFrame runs these over a slide, Backgrounds over a background layer.
 *
 * DOM in, DOM out, no React: the shapes are reveal's own, so a page written for a reveal deck
 * hears exactly what it heard there.
 */

/** The players that take commands through `postMessage` once their JS API is switched on. */
export type EmbedPlayer = "youtube" | "vimeo";

// youtube-nocookie.com is the player `<Youtube>` uses; reveal only knew youtube.com.
const YOUTUBE = /youtube(?:-nocookie)?\.com\/embed\//;
const VIMEO = /player\.vimeo\.com\//;

export function embedPlayer(src: string | null | undefined): EmbedPlayer | null {
  if (!src) return null;
  if (YOUTUBE.test(src)) return "youtube";
  if (VIMEO.test(src)) return "vimeo";
  return null;
}

/** The address with the player's JS API switched on (YouTube `enablejsapi=1`, Vimeo `api=1`). */
export function withPlayerApi(src: string): string {
  const player = embedPlayer(src);
  if (!player) return src;
  const param = player === "youtube" ? "enablejsapi=1" : "api=1";
  if (src.includes(param)) return src;
  const hash = src.indexOf("#");
  const [base, frag] = hash < 0 ? [src, ""] : [src.slice(0, hash), src.slice(hash)];
  return `${base}${base.includes("?") ? "&" : "?"}${param}${frag}`;
}

/** reveal's messages, byte for byte: the players parse these strings, not objects. */
export const MESSAGES = {
  start: "slide:start",
  stop: "slide:stop",
  youtubePlay: '{"event":"command","func":"playVideo","args":""}',
  youtubePause: '{"event":"command","func":"pauseVideo","args":""}',
  vimeoPlay: '{"method":"play"}',
  vimeoPause: '{"method":"pause"}',
} as const;

/**
 * What a frame is told when its slide is shown (or it finishes loading on a shown slide). A player
 * that should autoplay is told to play; everything else hears the generic `slide:start` — a
 * player that should not autoplay included, as in reveal.
 */
export function startMessage(src: string | null | undefined, autoplay: boolean): string {
  const player = embedPlayer(src);
  if (autoplay && player === "youtube") return MESSAGES.youtubePlay;
  if (autoplay && player === "vimeo") return MESSAGES.vimeoPlay;
  return MESSAGES.start;
}

/** What a frame is told when its slide is left: `slide:stop`, then pause for a player. */
export function stopMessages(src: string | null | undefined, ignore: boolean): string[] {
  const player = embedPlayer(src);
  if (ignore || !player) return [MESSAGES.stop];
  return [MESSAGES.stop, player === "youtube" ? MESSAGES.youtubePause : MESSAGES.vimeoPause];
}

/**
 * Whether media autoplays: the deck's `autoPlayMedia` when it is set, else the element's own
 * `data-autoplay` — and anything in a background, which reveal always starts.
 */
export function wantsAutoplay(
  autoPlayMedia: boolean | null | undefined,
  el: Pick<Element, "hasAttribute">,
  inBackground = false,
): boolean {
  if (typeof autoPlayMedia === "boolean") return autoPlayMedia;
  return inBackground || el.hasAttribute("data-autoplay");
}

/**
 * reveal's `shouldPreload`: `preloadIframes` when it is set, else the frame's own `data-preload`.
 * A frame that preloads loads while its slide is mounted (within viewDistance) and is not
 * unloaded when the slide is left.
 */
export function shouldPreload(
  preloadIframes: boolean | null | undefined,
  el: Pick<Element, "hasAttribute">,
): boolean {
  if (typeof preloadIframes === "boolean") return preloadIframes;
  return el.hasAttribute("data-preload");
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4a: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mpeg: "video/mpeg",
  webm: "video/webm",
};

/** The type a browser can decide on before fetching, from the address's extension. */
export function videoType(src: string): string | undefined {
  const path = src.split(/[?#]/)[0] ?? "";
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext];
}

/**
 * A background video's sources: one address, or reveal's comma-separated list (`a.webm, a.mp4`),
 * best first. A `data:` address is one source whatever it contains.
 */
export function videoSources(spec: string): { src: string; type?: string }[] {
  const parts = spec.trim().startsWith("data:") ? [spec.trim()] : spec.split(",");
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .map((src) => {
      const type = videoType(src);
      return type ? { src, type } : { src };
    });
}

/** An animated GIF, by its address (a CSS `url("…")` or a plain path). */
export function isGif(url: string | null | undefined): boolean {
  return !!url && /\.gif(?:[?#"')]|$)/i.test(url);
}

/**
 * How an `<img>` draws a background image of this size and repeat (`object-fit`), or null when
 * it cannot: a tiled image, or a size in lengths.
 */
export function gifFit(size: string, repeat: string): "cover" | "contain" | "none" | "fill" | null {
  if (repeat.trim() !== "no-repeat") return null;
  const s = size.trim();
  if (s === "cover" || s === "contain") return s;
  if (s === "" || s === "auto" || s === "auto auto") return "none";
  if (s === "100% 100%") return "fill";
  return null;
}

// ─── DOM ────────────────────────────────────────────────────────────────────────────────────────

function post(frame: HTMLIFrameElement, message: string) {
  try {
    frame.contentWindow?.postMessage(message, "*");
  } catch {
    /* a frame torn down mid-call */
  }
}

/** Switch the player API on in every YouTube / Vimeo frame under `root`, before it loads. */
export function formatEmbeds(root: ParentNode) {
  for (const attr of ["src", "data-src"] as const) {
    for (const f of root.querySelectorAll<HTMLIFrameElement>(`iframe[${attr}]`)) {
      const src = f.getAttribute(attr);
      if (!src) continue;
      const next = withPlayerApi(src);
      if (next !== src) f.setAttribute(attr, next);
    }
  }
}

/**
 * Lazy sources that are not frames: `<img|video|audio data-src>` get their `src`, and a
 * `<source data-src>` gets its own and makes its media element load again (a `<source>` added or
 * changed after the element chose one is otherwise never looked at). Frames have their own
 * schedule (SlideFrame).
 */
export function loadLazyMedia(root: ParentNode) {
  for (const el of root.querySelectorAll<HTMLElement>(
    "img[data-src], video[data-src], audio[data-src]",
  )) {
    const src = el.getAttribute("data-src");
    if (src && el.getAttribute("src") !== src) el.setAttribute("src", src);
  }
  const reload = new Set<HTMLMediaElement>();
  for (const el of root.querySelectorAll<HTMLSourceElement>("source[data-src]")) {
    const src = el.getAttribute("data-src");
    if (!src || el.getAttribute("src") === src) continue;
    el.setAttribute("src", src);
    const media = el.parentElement;
    if (media && (media.tagName === "VIDEO" || media.tagName === "AUDIO"))
      reload.add(media as HTMLMediaElement);
  }
  for (const m of reload) m.load();
}

/** Tell one frame its slide is showing (see `startMessage`). */
export function startFrame(frame: HTMLIFrameElement, autoplay: boolean) {
  post(frame, startMessage(frame.getAttribute("src"), autoplay));
}

/** Tell every loaded frame under `root` its slide is showing. */
export function startFrames(root: ParentNode, autoplay: (frame: HTMLIFrameElement) => boolean) {
  for (const f of root.querySelectorAll<HTMLIFrameElement>("iframe[src]"))
    startFrame(f, autoplay(f));
}

/** Tell every frame under `root` its slide has gone, and pause the players among them. */
export function stopFrames(root: ParentNode) {
  for (const f of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    for (const m of stopMessages(f.getAttribute("src"), f.hasAttribute("data-ignore"))) post(f, m);
  }
}

/**
 * Unload a frame. Removing `src` alone leaves the document running in some browsers (a video
 * keeps playing, hidden), so it goes to about:blank first, as reveal does.
 */
export function unloadFrame(frame: HTMLIFrameElement) {
  if (!frame.getAttribute("src")) return;
  frame.setAttribute("src", "about:blank");
  frame.removeAttribute("src");
}

/**
 * Start every `<img>` GIF under `root` again from frame one. Setting the same address again is
 * what restarts it in Chrome, Firefox and Safari (reveal's note); a GIF's frames are otherwise
 * shared by every element showing it, so a slide seen a second time picked up mid-loop.
 */
export function restartGifs(root: ParentNode) {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = img.getAttribute("src");
    if (isGif(src)) img.setAttribute("src", src!);
  }
}

// ─── Parallax (reveal's Backgrounds.updateParallax) ───────────────────────────────────────────

/** `2100px 900px` → [2100, 900]; one length is both; anything not in pixels is null. */
export function parallaxSize(size: string | null | undefined): [number, number] | null {
  const parts = (size ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 2 || !parts.every((p) => /^\d+(\.\d+)?px$/.test(p)))
    return null;
  const w = Number.parseFloat(parts[0]!);
  const h = Number.parseFloat(parts[1] ?? parts[0]!);
  return [w, h];
}

/**
 * The parallax image's `background-position` on slide (h, v), in pixels, as reveal works it out:
 * the image moves `horizontal` px left per column and `vertical` px up per step down — or, when
 * those are not given, by however much spreads the image's spare width over the columns (and its
 * spare height over the deck's vertical slides).
 */
export function parallaxOffset(o: {
  h: number;
  v: number;
  /** Horizontal slides (columns). */
  columns: number;
  /** Every slide that sits in a vertical stack, across the deck (reveal's getVerticalSlides). */
  verticalSlides: number;
  image: [number, number];
  box: [number, number];
  horizontal: number | null | undefined;
  vertical: number | null | undefined;
}): { x: number; y: number } {
  const stepX =
    typeof o.horizontal === "number"
      ? o.horizontal
      : o.columns > 1
        ? (o.image[0] - o.box[0]) / (o.columns - 1)
        : 0;
  const stepY =
    typeof o.vertical === "number"
      ? o.vertical
      : o.verticalSlides > 1
        ? (o.image[1] - o.box[1]) / (o.verticalSlides - 1)
        : 0;
  // `|| 0` folds -0 (a first slide) into 0.
  return { x: -stepX * o.h || 0, y: -stepY * o.v || 0 };
}
