import type {
  Bullet,
  Cell,
  CellBorder,
  ImageItem,
  Item,
  Paragraph,
  Rect,
  Rgba,
  Run,
  SlideSnapshot,
  TextItem,
} from "./types.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WALKER  —  one printed slide's DOM, as PowerPoint objects
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Runs IN THE PAGE (`page.evaluate(walkSlide, …)`), over one `.deck-print-page`, so it is a
 * single self-contained function: nothing outside it is in scope there. It reads layout and
 * computed style and returns plain JSON (types.ts); the builder turns that into pptxgenjs calls.
 *
 * What it maps natively:
 *   - text: every block of inline content (a heading, a paragraph, a cell, a list) becomes a text
 *     box at the block's own place, with runs that keep the family, size, colour, weight, slant,
 *     underline, strike, sub/superscript, letter spacing and links; alignment and line height.
 *   - lists: one text box per list, a paragraph per item, real bullets and numbering, nesting as
 *     indent levels, the gaps between items as paragraph spacing.
 *   - boxes: an element's own paint — a solid fill, a uniform border, a uniform radius, one
 *     outer shadow — as a rectangle, rounded rectangle or ellipse; uneven borders as edge strips.
 *   - pictures: `<img>` and CSS background images, fetched as the original file, with
 *     object-fit / background-size as a crop.
 *   - tables: a native table, column widths and row heights as laid out, each cell's fill,
 *     borders, padding and text.
 *   - code: monospace text, a coloured run per token, a paragraph per line.
 *   - the background: one colour when the layers behind the slide are flat, else a picture.
 *
 * What it does not, it photographs where it stands (a `raster` item, captured by capture.ts):
 * SVG, canvas, video frames, maths, embedded pages, form controls, anything rotated, filtered,
 * masked, clipped or blended, and boxes whose paint is a gradient or another effect (their own
 * paint only — the text in them stays text). Whatever paints and is in none of those — a
 * pseudo-element's decoration, a custom bullet, a line number — is caught by the residual layer:
 * capture.ts photographs the slide with everything above hidden, so nothing is lost.
 *
 * It leaves marks for those passes: `data-kx-paint` (what of an element is drawn natively, so the
 * residual hides it) and `data-kx-id` (what a raster item photographs). capture.ts removes them.
 *
 * Authors can steer it: `data-export="image"` on an element photographs it whole, and
 * `data-export="skip"` leaves it out of the PowerPoint file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface WalkArgs {
  /** Index of the `.deck-print-page`. */
  page: number;
  /** The authored stage size. */
  width: number;
  height: number;
}

export async function walkSlide(args: WalkArgs): Promise<SlideSnapshot> {
  const { page: index, width: W, height: H } = args;
  const pageEl = document.querySelectorAll<HTMLElement>(".deck-print-page")[index];
  if (!pageEl) throw new Error(`no print page ${index}`);
  // Background pictures' natural sizes, before the walk (which cannot wait): a crop needs them.
  const natural = new Map<string, { w: number; h: number }>();
  {
    const urls = new Set<string>();
    for (const el of pageEl.querySelectorAll("*")) {
      const m = /^url\("?(.*?)"?\)$/.exec(getComputedStyle(el).backgroundImage);
      if (m) urls.add(m[1]!);
    }
    await Promise.all(
      [...urls].map(async (url) => {
        const img = new Image();
        img.src = url;
        await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
        if (img.naturalWidth) natural.set(url, { w: img.naturalWidth, h: img.naturalHeight });
      }),
    );
  }
  const origin = pageEl.getBoundingClientRect();
  const zx = origin.width / W || 1;
  const zy = origin.height / H || 1;
  const rel = (r: DOMRect | DOMRectReadOnly): Rect => ({
    x: (r.left - origin.left) / zx,
    y: (r.top - origin.top) / zy,
    w: r.width / zx,
    h: r.height / zy,
  });
  const root = document.documentElement;
  let nextId = Number(root.dataset.kxNext || "1");
  const under: Item[] = [];
  const over: TextItem[] = [];
  const fonts = new Set<string>();
  const slideEl = pageEl.querySelector<HTMLElement>(":scope > .deck-slide") ?? pageEl;

  interface Ctx {
    alpha: number;
    scale: number;
  }

  // ── marks ──────────────────────────────────────────────────────────────────────────────────
  const mark = (el: Element, token: string) => {
    const cur = el.getAttribute("data-kx-paint");
    const list = cur ? cur.split(" ") : [];
    if (!list.includes(token)) el.setAttribute("data-kx-paint", [...list, token].join(" "));
  };
  const idOf = (el: Element): number => {
    const have = el.getAttribute("data-kx-id");
    if (have) return Number(have);
    const id = nextId++;
    el.setAttribute("data-kx-id", String(id));
    return id;
  };

  // ── colours ────────────────────────────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const g2 = canvas.getContext("2d", { willReadFrequently: true })!;
  const colours = new Map<string, Rgba | null>();
  /** Any computed colour (rgb(), color(srgb …), oklab(), a keyword) as sRGB + alpha. */
  const colour = (css: string | null | undefined, alpha = 1): Rgba | null => {
    if (!css || css === "transparent" || css === "none" || css === "currentcolor") return null;
    let c = colours.get(css);
    if (c === undefined) {
      const m =
        /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(
          css,
        );
      if (m) {
        const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
        c = [Number(m[1]), Number(m[2]), Number(m[3]), a];
      } else {
        // Anything else the browser can draw: draw it and read the pixel back.
        g2.clearRect(0, 0, 1, 1);
        g2.fillStyle = "rgba(0, 0, 0, 0)";
        g2.fillStyle = css;
        g2.fillRect(0, 0, 1, 1);
        const d = g2.getImageData(0, 0, 1, 1).data;
        c = d[3] ? [d[0]!, d[1]!, d[2]!, d[3]! / 255] : null;
      }
      colours.set(css, c);
    }
    if (!c) return null;
    const a = c[3] * alpha;
    return a < 0.004 ? null : [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), a];
  };
  /** `top` painted over `bottom`. */
  const over2 = (top: Rgba, bottom: Rgba): Rgba => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (a <= 0) return [0, 0, 0, 0];
    const mix = (i: 0 | 1 | 2) =>
      Math.round((top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a);
    return [mix(0), mix(1), mix(2), a];
  };
  /** The first colour stop of a gradient (gradient text keeps a colour, PowerPoint has none). */
  const firstStop = (image: string, alpha: number): Rgba | null => {
    const m =
      /(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]{3,8}\b)/i.exec(image);
    return m ? colour(m[1], alpha) : null;
  };

  // ── fonts ──────────────────────────────────────────────────────────────────────────────────
  const loaded = new Set<string>();
  for (const f of document.fonts)
    if (f.status === "loaded") loaded.add(f.family.replace(/^["']|["']$/g, "").toLowerCase());
  const GENERIC: Record<string, string> = {
    "sans-serif": "Arial",
    "system-ui": "Arial",
    "-apple-system": "Arial",
    blinkmacsystemfont: "Arial",
    "ui-sans-serif": "Arial",
    "ui-rounded": "Arial",
    serif: "Times New Roman",
    "ui-serif": "Times New Roman",
    monospace: "Courier New",
    "ui-monospace": "Courier New",
    cursive: "Comic Sans MS",
    fantasy: "Impact",
    math: "Cambria Math",
    emoji: "Segoe UI Emoji",
  };
  const installed = (name: string): boolean => {
    const probe = "mmmmmmmmmmlliiWW@#0";
    for (const base of ["monospace", "serif", "sans-serif"]) {
      g2.font = `40px ${base}`;
      const a = g2.measureText(probe).width;
      g2.font = `40px "${name}", ${base}`;
      if (g2.measureText(probe).width !== a) return true;
    }
    return false;
  };
  const families = new Map<string, string>();
  /** The family PowerPoint should name: the first of the stack this browser actually has. */
  const family = (stack: string): string => {
    let name = families.get(stack);
    if (name) return name;
    name = "Arial";
    for (const raw of stack.split(",")) {
      const f = raw.trim().replace(/^["']|["']$/g, "");
      const key = f.toLowerCase();
      if (!f) continue;
      if (GENERIC[key]) {
        name = GENERIC[key]!;
        break;
      }
      if (loaded.has(key) || installed(f)) {
        name = f;
        break;
      }
    }
    families.set(stack, name);
    return name;
  };

  // ── geometry and style helpers ─────────────────────────────────────────────────────────────
  const px = (v: string) => parseFloat(v) || 0;
  const inSlide = (r: Rect) => r.x < W && r.y < H && r.x + r.w > 0 && r.y + r.h > 0;
  const full = (r: Rect) =>
    r.x <= W * 0.02 && r.y <= H * 0.02 && r.x + r.w >= W * 0.98 && r.y + r.h >= H * 0.98;
  const union = (rects: Rect[]): Rect | null => {
    if (!rects.length) return null;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const r of rects) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  /** Uniform scale from a transform, 1 for none, null for anything PowerPoint cannot follow. */
  const scaleOf = (t: string): number | null => {
    if (!t || t === "none") return 1;
    const m = /^matrix\(([^)]+)\)$/.exec(t);
    if (!m) return null;
    const [a, b, c, d] = m[1]!.split(",").map(Number) as [number, number, number, number];
    return Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4 && Math.abs(a - d) < 1e-3 && a > 0 ? a : null;
  };
  const pseudoPaints = (el: Element, which: "::before" | "::after"): boolean => {
    const ps = getComputedStyle(el, which);
    if (!ps.content || ps.content === "none" || ps.content === "normal") return false;
    if (ps.display === "none") return false;
    return (
      ps.content !== '""' ||
      !!colour(ps.backgroundColor) ||
      ps.backgroundImage !== "none" ||
      px(ps.borderTopWidth) + px(ps.borderLeftWidth) > 0 ||
      ps.boxShadow !== "none"
    );
  };

  /** Why an element is photographed whole rather than rebuilt, or null. */
  const rasterReason = (el: Element, cs: CSSStyleDeclaration): string | null => {
    const tag = el.tagName.toUpperCase();
    if (el.getAttribute("data-export") === "image") return "asked for (data-export)";
    if (el instanceof SVGElement) return "SVG";
    if (tag === "CANVAS") return "canvas";
    if (tag === "VIDEO") return "video";
    if (tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED") return "embedded page";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "PROGRESS")
      return "form control";
    if (tag === "METER" || tag === "MATH" || tag === "MJX-CONTAINER") return "maths";
    const cls = el.classList;
    if (cls.contains("katex") || cls.contains("katex-display")) return "maths";
    if (cls.contains("mermaid") || cls.contains("excalidraw")) return "diagram";
    if ((el as HTMLElement).shadowRoot) return "shadow DOM";
    if (scaleOf(cs.transform) === null) return "transform";
    if (cs.filter && cs.filter !== "none") return "filter";
    if (cs.mixBlendMode && cs.mixBlendMode !== "normal") return "blend mode";
    if (cs.clipPath && cs.clipPath !== "none") return "clip-path";
    const mask = cs.getPropertyValue("mask-image") || cs.getPropertyValue("-webkit-mask-image");
    if (mask && mask !== "none") return "mask";
    if (cs.writingMode && !cs.writingMode.startsWith("horizontal")) return "vertical text";
    return null;
  };

  // ── pictures and rasters ───────────────────────────────────────────────────────────────────
  /** How far an element's paint reaches past its box: shadows, glows, filter shadows. */
  const bleedOf = (el: Element): number => {
    const cs = getComputedStyle(el);
    let out = 0;
    for (const s of shadows(cs.boxShadow))
      if (!s.inset)
        out = Math.max(
          out,
          Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur + Math.max(0, s.spread),
        );
    if (cs.filter && cs.filter !== "none") {
      const nums = (cs.filter.match(/-?[\d.]+px/g) ?? []).map(px);
      out = Math.max(
        out,
        nums.reduce((a, b) => a + Math.abs(b), 0),
      );
    }
    if (cs.outlineStyle !== "none") out = Math.max(out, px(cs.outlineWidth) + px(cs.outlineOffset));
    return Math.min(out, 200);
  };
  const raster = (el: Element, r: Rect, mode: "all" | "own", reason: string) => {
    if (!inSlide(r) || r.w < 1 || r.h < 1) return;
    mark(el, mode === "all" ? "all" : "box");
    under.push({ kind: "raster", rect: r, id: idOf(el), mode, reason, bleed: bleedOf(el) });
  };

  /** Where a picture of natural size `nw`×`nh` lands in box `b` under object-fit / -position. */
  const fitRect = (
    b: Rect,
    nw: number,
    nh: number,
    fit: string,
    position: string,
    scale: number,
  ): Rect => {
    let w = b.w,
      h = b.h;
    if (fit === "contain" || fit === "cover" || fit === "scale-down" || fit === "none") {
      const k =
        fit === "none"
          ? scale
          : fit === "cover"
            ? Math.max(b.w / nw, b.h / nh)
            : Math.min(b.w / nw, b.h / nh, fit === "scale-down" ? scale : Infinity);
      w = nw * k;
      h = nh * k;
    }
    const [px0 = "50%", py0 = "50%"] = position.split(/\s+/);
    const at = (v: string, free: number) =>
      v.endsWith("%") ? (free * parseFloat(v)) / 100 : parseFloat(v) * scale || 0;
    return { x: b.x + at(px0, b.w - w), y: b.y + at(py0, b.h - h), w, h };
  };

  /**
   * Where a link goes: an http(s) or mailto address, or `slide:<flat index>` for a link to a slide
   * of this deck (`#/2`, `#/2/1`, `#/slide-id`), which the builder turns into a jump to that
   * slide's first page in the file. A link to anywhere else on the deck's own site is left out.
   */
  const deckRt = (
    window as unknown as {
      __deck?: {
        columns: { slides: { id: string }[] }[];
        config: { hashOneBasedIndex?: boolean };
      };
    }
  ).__deck;
  const linkOf = (el: Element): string | undefined => {
    const a = el.closest("a[href]") as HTMLAnchorElement | null;
    if (!a || !pageEl.contains(a)) return undefined;
    const raw = a.getAttribute("href") ?? "";
    const here = new URL(location.href);
    const there = new URL(a.href);
    if (raw.startsWith("#") || (there.origin === here.origin && there.pathname === here.pathname)) {
      if (!deckRt) return undefined;
      const hash = decodeURIComponent(there.hash.replace(/^#\/?/, ""));
      const off = deckRt.config.hashOneBasedIndex ? 1 : 0;
      const m = /^(\d+)(?:\/(\d+))?/.exec(hash);
      let flat = 0;
      for (let h = 0; h < deckRt.columns.length; h++) {
        const col = deckRt.columns[h]!;
        for (let v = 0; v < col.slides.length; v++, flat++) {
          if (
            m
              ? h === Number(m[1]) - off && v === Number(m[2] ?? off) - off
              : col.slides[v]!.id === hash
          )
            return `slide:${flat}`;
        }
      }
      return undefined;
    }
    return /^(https?:|mailto:)/.test(a.href) ? a.href : undefined;
  };

  const image = (img: HTMLImageElement, cs: CSSStyleDeclaration, r: Rect, c: Ctx) => {
    if (!inSlide(r) || !img.naturalWidth) return;
    const radius = px(cs.borderTopLeftRadius) + px(cs.borderBottomRightRadius);
    if (radius > 0.5) return raster(img, r, "all", "rounded picture");
    // The picture sits in the content box; a border or padding around it is a box of its own.
    paint(img, cs, r, c, true);
    const box: Rect = {
      x: r.x + (px(cs.borderLeftWidth) + px(cs.paddingLeft)) * c.scale,
      y: r.y + (px(cs.borderTopWidth) + px(cs.paddingTop)) * c.scale,
      w:
        r.w -
        (px(cs.borderLeftWidth) +
          px(cs.paddingLeft) +
          px(cs.borderRightWidth) +
          px(cs.paddingRight)) *
          c.scale,
      h:
        r.h -
        (px(cs.borderTopWidth) +
          px(cs.paddingTop) +
          px(cs.borderBottomWidth) +
          px(cs.paddingBottom)) *
          c.scale,
    };
    const drawn = fitRect(
      box,
      img.naturalWidth,
      img.naturalHeight,
      cs.objectFit,
      cs.objectPosition,
      c.scale,
    );
    const same =
      Math.abs(drawn.x - box.x) < 0.5 &&
      Math.abs(drawn.y - box.y) < 0.5 &&
      Math.abs(drawn.w - box.w) < 0.5 &&
      Math.abs(drawn.h - box.h) < 0.5;
    mark(img, "all");
    const item: ImageItem = {
      kind: "image",
      rect: box,
      src: img.currentSrc || img.src,
      opacity: c.alpha,
      id: idOf(img),
    };
    if (!same) item.drawn = drawn;
    const href = linkOf(img);
    if (href) item.href = href;
    under.push(item);
  };

  // ── boxes ──────────────────────────────────────────────────────────────────────────────────
  /** Parse `box-shadow` into its layers (colour first, as computed). */
  const shadows = (v: string) => {
    if (!v || v === "none") return [];
    const out: {
      color: Rgba | null;
      x: number;
      y: number;
      blur: number;
      spread: number;
      inset: boolean;
    }[] = [];
    let depth = 0,
      cur = "";
    const parts: string[] = [];
    for (const ch of v) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts) {
      const col = /^(\S+\([^)]*\)|#\w+|[a-z]+)\s*/i.exec(p.trim());
      const rest = p.trim().slice(col ? col[0].length : 0);
      const nums = rest.match(/-?[\d.]+px/g)?.map(px) ?? [];
      out.push({
        color: colour(col?.[1]),
        x: nums[0] ?? 0,
        y: nums[1] ?? 0,
        blur: nums[2] ?? 0,
        spread: nums[3] ?? 0,
        inset: /\binset\b/.test(p),
      });
    }
    return out.filter((s) => s.color);
  };

  /**
   * An element's own paint — fill, border, radius, shadow — as a native shape, a photograph of
   * that paint alone, or nothing. `bare` skips the background image check (an `<img>`'s border).
   */
  const paint = (el: Element, cs: CSSStyleDeclaration, r: Rect, c: Ctx, bare = false): void => {
    if (!inSlide(r)) return;
    const fill = colour(cs.backgroundColor, c.alpha);
    const image = bare ? "none" : cs.backgroundImage;
    const side = (s: "Top" | "Right" | "Bottom" | "Left") => {
      const w = px(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) * c.scale;
      const style = cs.getPropertyValue(`border-${s.toLowerCase()}-style`);
      const col = colour(cs.getPropertyValue(`border-${s.toLowerCase()}-color`), c.alpha);
      return w > 0.1 && col && style !== "none" && style !== "hidden" ? { w, style, col } : null;
    };
    const sides = [side("Top"), side("Right"), side("Bottom"), side("Left")];
    const layers = shadows(cs.boxShadow);
    if (!fill && image === "none" && !sides.some(Boolean) && !layers.length) return;

    const radii = [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ].map((v) => {
      const first = v.split(/\s+/)[0] ?? "0";
      return first.endsWith("%")
        ? (Math.min(r.w, r.h) * parseFloat(first)) / 100
        : px(first) * c.scale;
    });
    const even = radii.every((x) => Math.abs(x - radii[0]!) < 0.75);
    const shown = sides.filter(Boolean) as { w: number; style: string; col: Rgba }[];
    const uniform =
      shown.length === 4 &&
      shown.every(
        (s) =>
          Math.abs(s.w - shown[0]!.w) < 0.1 &&
          s.style === shown[0]!.style &&
          s.col.every((v, i) => Math.abs(v - shown[0]!.col[i]!) < 0.01),
      );
    const odd = (s: string) => !/^(solid|dashed|dotted)$/.test(s);
    const complex =
      (image !== "none" && !image.startsWith("url(")) ||
      /,\s*url\(/.test(image) ||
      layers.length > 1 ||
      layers.some((l) => l.inset) ||
      (cs.backdropFilter && cs.backdropFilter !== "none") ||
      (cs.getPropertyValue("-webkit-backdrop-filter") || "none") !== "none" ||
      shown.some((s) => odd(s.style)) ||
      (!even && (fill || uniform));
    if (complex) return raster(el, r, "own", image !== "none" ? "gradient or pattern" : "effect");

    // A single picture as the background: the fill and border natively, the picture natively.
    let picture: ImageItem | null = null;
    if (image !== "none") {
      const url = /^url\("?(.*?)"?\)$/.exec(image)?.[1];
      const repeat = cs.backgroundRepeat;
      const nw = (url && natural.get(url)?.w) || 0;
      const nh = (url && natural.get(url)?.h) || 0;
      if (!url || !nw || !nh) return raster(el, r, "own", "background picture");
      const size = cs.backgroundSize;
      const fit =
        size === "cover"
          ? "cover"
          : size === "contain"
            ? "contain"
            : size === "100% 100%"
              ? "fill"
              : null;
      let drawn: Rect;
      if (fit === "fill") drawn = r;
      else if (fit) drawn = fitRect(r, nw, nh, fit, cs.backgroundPosition, c.scale);
      else if (size === "auto" || size === "auto auto")
        drawn = fitRect(r, nw, nh, "none", cs.backgroundPosition, c.scale);
      else return raster(el, r, "own", "background picture size");
      const tiles = !/no-repeat/.test(repeat) && (drawn.w < r.w - 0.5 || drawn.h < r.h - 0.5);
      if (tiles || radii.some((x) => x > 1)) return raster(el, r, "own", "background picture");
      picture = {
        kind: "image",
        rect: r,
        src: new URL(url, location.href).href,
        opacity: c.alpha,
        id: idOf(el),
      };
      if (
        Math.abs(drawn.w - r.w) > 0.5 ||
        Math.abs(drawn.h - r.h) > 0.5 ||
        Math.abs(drawn.x - r.x) > 0.5
      )
        picture.drawn = drawn;
    }

    mark(el, "box");
    const radius = radii[0]!;
    const round = radius > 0.75;
    const square = Math.abs(r.w - r.h) < 1;
    const shadow = layers[0];
    if (fill || uniform || shadow) {
      under.push({
        kind: "box",
        rect: r,
        shape:
          round && square && radius >= r.w / 2 - 0.75 ? "ellipse" : round ? "roundRect" : "rect",
        radius: Math.min(radius, Math.min(r.w, r.h) / 2),
        ...(fill ? { fill } : {}),
        ...(uniform
          ? {
              line: {
                width: shown[0]!.w,
                color: shown[0]!.col,
                dash:
                  shown[0]!.style === "dashed"
                    ? "dash"
                    : shown[0]!.style === "dotted"
                      ? "sysDot"
                      : "solid",
              },
            }
          : {}),
        ...(shadow
          ? { shadow: { blur: shadow.blur, x: shadow.x, y: shadow.y, color: shadow.color! } }
          : {}),
      });
    }
    if (picture) under.push(picture);
    if (!uniform) {
      // Uneven borders: a strip per side (an accent rule, a divider).
      const [t, rt, b, l] = sides;
      if (t)
        under.push({
          kind: "box",
          shape: "rect",
          radius: 0,
          rect: { x: r.x, y: r.y, w: r.w, h: t.w },
          fill: t.col,
        });
      if (b)
        under.push({
          kind: "box",
          shape: "rect",
          radius: 0,
          rect: { x: r.x, y: r.y + r.h - b.w, w: r.w, h: b.w },
          fill: b.col,
        });
      if (l)
        under.push({
          kind: "box",
          shape: "rect",
          radius: 0,
          rect: { x: r.x, y: r.y, w: l.w, h: r.h },
          fill: l.col,
        });
      if (rt)
        under.push({
          kind: "box",
          shape: "rect",
          radius: 0,
          rect: { x: r.x + r.w - rt.w, y: r.y, w: rt.w, h: r.h },
          fill: rt.col,
        });
    }
  };

  /** An inline element's own paint (a code chip, a highlight, a key): one box per line fragment. */
  const inlinePaint = (el: Element, cs: CSSStyleDeclaration, c: Ctx) => {
    const fill = colour(cs.backgroundColor, c.alpha);
    const bw = px(cs.borderTopWidth) * c.scale;
    const bc = colour(cs.borderTopColor, c.alpha);
    const image = cs.backgroundImage;
    if (!fill && !(bw > 0.1 && bc && cs.borderTopStyle !== "none") && image === "none") return;
    if (image !== "none")
      return raster(el, rel(el.getBoundingClientRect()), "own", "inline effect");
    const frags = [...el.getClientRects()].map(rel).filter((r) => r.w > 0.5 && r.h > 0.5);
    mark(el, "box");
    const radius = px(cs.borderTopLeftRadius) * c.scale;
    for (const r of frags)
      under.push({
        kind: "box",
        rect: r,
        shape: radius > 0.75 ? "roundRect" : "rect",
        radius: Math.min(radius, Math.min(r.w, r.h) / 2),
        ...(fill ? { fill } : {}),
        ...(bw > 0.1 && bc && cs.borderTopStyle !== "none"
          ? { line: { width: bw, color: bc, dash: "solid" as const } }
          : {}),
      });
  };

  // ── text ───────────────────────────────────────────────────────────────────────────────────
  const isInline = (el: Element, cs: CSSStyleDeclaration): boolean => {
    const d = cs.display;
    if (el.tagName === "BR") return true;
    if (d === "inline") return true;
    if (/^inline-(block|flex|grid)$/.test(d)) {
      // A chip or a key is inline; an inline-block holding blocks is laid out on its own.
      for (const k of el.querySelectorAll("*")) {
        const kd = getComputedStyle(k).display;
        if (!/^(inline|contents|none)/.test(kd) && !(k instanceof SVGElement)) return false;
      }
      return true;
    }
    return false;
  };

  interface Collect {
    paragraphs: Paragraph[];
    para: Paragraph;
    rects: Rect[];
    alpha: number;
    scale: number;
    u: boolean;
    s: boolean;
    br: boolean;
    /** Fill colour of gradient text above, if any. */
    ink: Rgba | null;
    /** Visible characters (not spaces) collected. */
    chars: number;
  }

  const newPara = (cs: CSSStyleDeclaration, scale: number): Paragraph => {
    const a = cs.textAlign;
    const lh = cs.lineHeight;
    return {
      runs: [],
      align:
        a === "center"
          ? "center"
          : a === "right" || a === "end"
            ? "right"
            : a === "justify"
              ? "justify"
              : "left",
      lineHeight: lh === "normal" ? null : px(lh) * scale,
      before: 0,
      ...(cs.direction === "rtl" ? { rtl: true } : {}),
    };
  };

  const pushRun = (
    s: Collect,
    text: string,
    cs: CSSStyleDeclaration,
    el: Element,
    spacer = false,
  ) => {
    const tt = cs.textTransform;
    if (tt === "uppercase") text = text.toUpperCase();
    else if (tt === "lowercase") text = text.toLowerCase();
    else if (tt === "capitalize")
      text = text.replace(/(^|\s)(\p{L})/gu, (_, a, b: string) => a + b.toUpperCase());
    const runs = s.para.runs;
    const prev = runs[runs.length - 1];
    // Collapsed white space: one space between words, none at a paragraph's start.
    if (
      !spacer &&
      /^\s/.test(text) &&
      (!prev || /\s$/.test(prev.text)) &&
      !/^(pre|pre-wrap|break-spaces)$/.test(cs.whiteSpace)
    )
      text = text.replace(/^\s+/, "");
    if (!text) return;
    const fillCss = cs.getPropertyValue("-webkit-text-fill-color");
    const clip =
      cs.getPropertyValue("background-clip") === "text" ||
      cs.getPropertyValue("-webkit-background-clip") === "text";
    let color =
      (clip ? firstStop(cs.backgroundImage, s.alpha) : null) ??
      (fillCss && fillCss !== cs.color ? colour(fillCss, s.alpha) : null) ??
      s.ink ??
      colour(cs.color, s.alpha) ??
      ([0, 0, 0, 1] as Rgba);
    if (spacer) color = [0, 0, 0, 0];
    const font = family(cs.fontFamily);
    fonts.add(font);
    const run: Run = {
      text,
      font,
      size: px(cs.fontSize) * s.scale,
      color,
    };
    if (!spacer) {
      const weight = Number(cs.fontWeight) || (cs.fontWeight === "bold" ? 700 : 400);
      if (weight >= 600) run.bold = true;
      if (cs.fontStyle === "italic" || cs.fontStyle.startsWith("oblique")) run.italic = true;
      const line = cs.textDecorationLine;
      if (s.u || /underline/.test(line)) run.underline = true;
      if (s.s || /line-through/.test(line)) run.strike = true;
      const va = cs.verticalAlign;
      if (va === "super") run.sup = true;
      else if (va === "sub") run.sub = true;
      const ls = px(cs.letterSpacing) * s.scale;
      if (Math.abs(ls) > 0.05) run.spacing = ls;
      const href = linkOf(el);
      if (href) run.href = href;
    } else run.spacer = true;
    if (s.br) {
      run.breakBefore = true;
      s.br = false;
    }
    // Same look as the run before: one run.
    if (
      prev &&
      !run.breakBefore &&
      !prev.spacer &&
      !run.spacer &&
      prev.font === run.font &&
      prev.size === run.size &&
      prev.color.join() === run.color.join() &&
      !!prev.bold === !!run.bold &&
      !!prev.italic === !!run.italic &&
      !!prev.underline === !!run.underline &&
      !!prev.strike === !!run.strike &&
      !!prev.sup === !!run.sup &&
      !!prev.sub === !!run.sub &&
      prev.spacing === run.spacing &&
      prev.href === run.href
    ) {
      prev.text += text;
      return;
    }
    runs.push(run);
  };

  const collectNode = (n: Node, s: Collect, block: Element) => {
    if (n.nodeType === 3) {
      const t = n as Text;
      const parent = t.parentElement;
      if (!parent) return;
      const cs = getComputedStyle(parent);
      if (cs.visibility !== "visible") return;
      let text = t.data;
      const ws = cs.whiteSpace;
      if (ws === "pre-line") text = text.replace(/[ \t]+/g, " ").replace(/\n/g, " ");
      else if (!/^(pre|pre-wrap|break-spaces)$/.test(ws)) text = text.replace(/[\t\n\r ]+/g, " ");
      else text = text.replace(/\t/g, "    ").replace(/\n/g, " ");
      if (!text) return;
      const range = document.createRange();
      range.selectNodeContents(t);
      const rects = [...range.getClientRects()].map(rel).filter((r) => r.w > 0.5 && r.h > 0.5);
      if (!rects.length) return;
      s.rects.push(...rects);
      s.chars += text.replace(/\s/g, "").length;
      pushRun(s, text, cs, parent);
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    if (el.getAttribute("data-export") === "skip") return mark(el, "all");
    if (cs.display === "contents") {
      for (const k of el.childNodes) collectNode(k, s, block);
      return;
    }
    const alpha = s.alpha * (parseFloat(cs.opacity) || 0);
    if (alpha < 0.01) return;
    if (el.tagName === "BR") {
      s.br = true;
      return;
    }
    const r = rel(el.getBoundingClientRect());
    const reason = el.tagName === "IMG" ? null : rasterReason(el, cs);
    if (el.tagName === "IMG" || reason) {
      if (cs.visibility === "visible") {
        if (el.tagName === "IMG") image(el as HTMLImageElement, cs, r, { alpha, scale: s.scale });
        else raster(el, r, "all", reason!);
      }
      // Hold the picture's place in the line: en spaces about as wide as it is.
      const size = px(getComputedStyle(block).fontSize) * s.scale || 16;
      const n = Math.max(1, Math.round(r.w / (size * 0.5)));
      pushRun(s, " ".repeat(n), cs, el, true);
      return;
    }
    if (!isInline(el, cs)) {
      // A block inside inline content: laid out on its own, and the paragraph breaks around it.
      visit(el, { alpha: s.alpha, scale: s.scale });
      s.br = s.para.runs.length > 0;
      return;
    }
    if (cs.visibility === "visible") inlinePaint(el, cs, { alpha, scale: s.scale });
    const saved = { alpha: s.alpha, u: s.u, s: s.s, ink: s.ink };
    s.alpha = alpha;
    s.u ||= /underline/.test(cs.textDecorationLine);
    s.s ||= /line-through/.test(cs.textDecorationLine);
    if (
      cs.getPropertyValue("-webkit-background-clip") === "text" ||
      cs.getPropertyValue("background-clip") === "text"
    )
      s.ink = firstStop(cs.backgroundImage, alpha) ?? s.ink;
    for (const k of el.childNodes) collectNode(k, s, block);
    Object.assign(s, saved);
  };

  /** Drop a paragraph's leading and trailing spaces, and paragraphs left with nothing to show. */
  const tidy = (paras: Paragraph[]): Paragraph[] =>
    paras.filter((p) => {
      const first = p.runs.find((r) => !r.spacer);
      if (first) first.text = first.text.replace(/^\s+/, "");
      const last = [...p.runs].reverse().find((r) => !r.spacer);
      if (last) last.text = last.text.replace(/\s+$/, "");
      p.runs = p.runs.filter((r) => r.text.length > 0);
      return p.runs.some((r) => r.spacer || r.text.trim());
    });

  /** Line tops of a set of glyph rects (the boxes of their lines), top to bottom. */
  const lineTops = (rects: Rect[]): { top: number; h: number }[] => {
    const lines: { top: number; h: number }[] = [];
    for (const r of [...rects].sort((a, b) => a.y - b.y)) {
      const last = lines[lines.length - 1];
      if (last && r.y < last.top + last.h * 0.5) last.h = Math.max(last.h, r.y + r.h - last.top);
      else lines.push({ top: r.y, h: r.h });
    }
    return lines;
  };

  /** Inline nodes of `el` as one text box at `el`'s content box. */
  const textBox = (
    el: Element,
    cs: CSSStyleDeclaration,
    nodes: Node[],
    c: Ctx,
    bullet?: Bullet,
  ): boolean => {
    const s: Collect = {
      paragraphs: [],
      para: newPara(cs, c.scale),
      rects: [],
      alpha: c.alpha,
      scale: c.scale,
      u: false,
      s: false,
      br: false,
      ink: null,
      chars: 0,
    };
    if (bullet) s.para.bullet = bullet;
    for (const n of nodes) collectNode(n, s, el);
    const paragraphs = tidy([s.para]);
    if (!paragraphs.length || !s.rects.length || !s.chars) return false;
    const box = rel(el.getBoundingClientRect());
    const k = c.scale;
    const left = box.x + (px(cs.borderLeftWidth) + px(cs.paddingLeft)) * k;
    const right = box.x + box.w - (px(cs.borderRightWidth) + px(cs.paddingRight)) * k;
    const glyphs = union(s.rects)!;
    const lines = lineTops(s.rects);
    const para = paragraphs[0]!;
    const size = Math.max(...para.runs.map((r) => r.size));
    const L = para.lineHeight ?? size * 1.2;
    const g = lines[0]?.h ?? size;
    const lead = Math.max(0, (L - g) / 2);
    let x0 = Math.min(left, glyphs.x);
    let x1 = Math.max(right, glyphs.x + glyphs.w);
    if (bullet) x0 -= bullet.indent * (bullet.level + 1);
    const wrap = lines.length > 1;
    // Something inline before the words (a counter in a ::before, a text-indent) pushes the first
    // line in: the residue draws it, and the text box must leave it room.
    const first = lines[0];
    const firstX = first
      ? Math.min(...s.rects.filter((r) => r.y < first.top + first.h * 0.5).map((r) => r.x))
      : x0;
    if (para.align === "left" && !bullet && firstX - x0 > 1) {
      if (!wrap) x0 = firstX;
      else {
        const n = Math.round((firstX - x0) / (size * 0.5));
        if (n > 0)
          para.runs.unshift({
            ...para.runs[0]!,
            text: "\u2002".repeat(n),
            color: [0, 0, 0, 0],
            spacer: true,
            href: undefined,
          });
      }
    }
    // A little room, so a font with slightly wider metrics does not wrap a line early.
    const slack = wrap ? (x1 - x0) * 0.015 : Math.max(2, size * 0.15);
    if (para.align === "center") {
      x0 -= slack / 2;
      x1 += slack / 2;
    } else if (para.align === "right") x0 -= slack;
    else x1 += slack;
    mark(el, "text");
    over.push({
      kind: "text",
      rect: { x: x0, y: glyphs.y - lead, w: x1 - x0, h: glyphs.h + 2 * lead },
      paragraphs,
      wrap,
    });
    return true;
  };

  // ── lists ──────────────────────────────────────────────────────────────────────────────────
  const BULLETS: Record<string, string> = {
    disc: "•",
    circle: "◦",
    square: "▪",
    "disclosure-closed": "▸",
    "disclosure-open": "▾",
  };
  const NUMBERS: Record<string, string> = {
    decimal: "arabicPeriod",
    "decimal-leading-zero": "arabicPeriod",
    "lower-alpha": "alphaLcPeriod",
    "lower-latin": "alphaLcPeriod",
    "upper-alpha": "alphaUcPeriod",
    "upper-latin": "alphaUcPeriod",
    "lower-roman": "romanLcPeriod",
    "upper-roman": "romanUcPeriod",
  };

  interface ListLine {
    para: Paragraph;
    rects: Rect[];
  }

  /** A list whose items are inline content, `<p>`s of it and lists like itself; else null. */
  const listLines = (list: Element, c: Ctx, level: number, out: ListLine[]): boolean => {
    const lcs = getComputedStyle(list);
    const indent = px(lcs.paddingLeft) * c.scale || 24;
    let ordinal = (list as HTMLOListElement).start || 1;
    // Every item of a run carries the first one's number: PowerPoint counts on from there.
    let start: number | null = null;
    for (const li of list.children) {
      const cs = getComputedStyle(li);
      if (cs.display === "none") continue;
      if (li.tagName !== "LI") return false;
      const alpha = c.alpha * (parseFloat(cs.opacity) || 0);
      const n = ordinal++;
      if (alpha < 0.01 || cs.visibility !== "visible") continue;
      const type = cs.listStyleType;
      const quoted = /^"(.*)"$/.exec(type)?.[1];
      let bullet: Bullet | undefined;
      if (NUMBERS[type]) {
        start ??= n;
        bullet = { kind: "number", numberType: NUMBERS[type], level, indent, start };
      } else if (BULLETS[type] || quoted)
        bullet = { kind: "bullet", char: (BULLETS[type] ?? quoted!.trim()) || "•", level, indent };
      // No marker (`list-style: none`, a reset stylesheet): PowerPoint indents a paragraph only
      // under a bullet, so these items are laid out one by one, each at its own place.
      else return false;
      // The item's own runs, then its nested lists.
      const s: Collect = {
        paragraphs: [],
        para: newPara(cs, c.scale),
        rects: [],
        alpha,
        scale: c.scale,
        u: false,
        s: false,
        br: false,
        ink: null,
        chars: 0,
      };
      if (bullet) s.para.bullet = bullet;
      const nested: Element[] = [];
      let paras = 0;
      for (const k of li.childNodes) {
        if (k.nodeType === 1) {
          const ke = k as Element;
          const kcs = getComputedStyle(ke);
          if (kcs.display === "none") continue;
          if (ke.tagName === "UL" || ke.tagName === "OL") {
            nested.push(ke);
            continue;
          }
          if (!isInline(ke, kcs)) {
            if (ke.tagName !== "P" || nested.length) return false;
            // A loose list's <p>: its words are the item's (a second one breaks the line).
            if (paras++ > 0) s.br = true;
            for (const kk of ke.childNodes) collectNode(kk, s, ke);
            mark(ke, "text");
            continue;
          }
          if (nested.length) return false;
        }
        collectNode(k, s, li);
      }
      const [para] = tidy([s.para]);
      if (para) {
        mark(li, "text");
        mark(li, "marker");
        out.push({ para, rects: s.rects });
      }
      for (const sub of nested) {
        mark(sub, "list");
        if (!listLines(sub, { alpha, scale: c.scale }, level + 1, out)) return false;
      }
    }
    return true;
  };

  const listBox = (list: Element, cs: CSSStyleDeclaration, r: Rect, c: Ctx): boolean => {
    const lines: ListLine[] = [];
    // Collected into a scratch list first: a list that turns out not to be simple leaves no trace.
    const before = { under: under.length, over: over.length };
    if (!listLines(list, c, 0, lines) || !lines.length) {
      under.length = before.under;
      over.length = before.over;
      return false;
    }
    const paragraphs: Paragraph[] = [];
    let prevTop: number | null = null;
    let top = Infinity;
    let bottom = -Infinity;
    let size0 = 16;
    for (const line of lines) {
      const tops = lineTops(line.rects);
      if (!tops.length) continue;
      const size = Math.max(...line.para.runs.map((x) => x.size));
      const L = line.para.lineHeight ?? size * 1.2;
      const g = tops[0]!.h;
      if (prevTop !== null) line.para.before = Math.max(0, tops[0]!.top - prevTop - L);
      else size0 = size;
      prevTop = tops[tops.length - 1]!.top;
      top = Math.min(top, tops[0]!.top - Math.max(0, (L - g) / 2));
      bottom = Math.max(
        bottom,
        tops[tops.length - 1]!.top + tops[tops.length - 1]!.h + Math.max(0, (L - g) / 2),
      );
      paragraphs.push(line.para);
    }
    if (!paragraphs.length) return false;
    const indent = paragraphs[0]!.bullet?.indent ?? px(cs.paddingLeft) * c.scale;
    const x0 = r.x + (px(cs.borderLeftWidth) + px(cs.paddingLeft)) * c.scale - indent;
    const x1 = r.x + r.w + Math.max(2, size0 * 0.15);
    mark(list, "list");
    over.push({
      kind: "text",
      rect: { x: x0, y: top, w: x1 - x0, h: bottom - top },
      paragraphs,
      wrap: true,
    });
    return true;
  };

  // ── code ───────────────────────────────────────────────────────────────────────────────────
  const code = (pre: Element, cs: CSSStyleDeclaration, r: Rect, c: Ctx): boolean => {
    const k = c.scale;
    // Highlighted lines, diff marks: their fills as boxes under the text.
    for (const el of pre.querySelectorAll("*")) {
      const ecs = getComputedStyle(el);
      if (ecs.display === "none" || ecs.visibility !== "visible") continue;
      let alpha = c.alpha;
      for (let p: Element | null = el; p && p !== pre; p = p.parentElement)
        alpha *= parseFloat(getComputedStyle(p).opacity) || 0;
      if (alpha < 0.01) continue;
      const er = rel(el.getBoundingClientRect());
      if (ecs.display === "inline") inlinePaint(el, ecs, { alpha, scale: k });
      else paint(el, ecs, er, { alpha, scale: k });
    }
    const tokens: {
      text: string;
      rect: Rect;
      cs: CSSStyleDeclaration;
      alpha: number;
      el: Element;
    }[] = [];
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const alphaOf = new Map<Element, number>();
    const alphaFor = (el: Element): number => {
      if (el === pre) return c.alpha;
      let a = alphaOf.get(el);
      if (a === undefined) {
        const ecs = getComputedStyle(el);
        a =
          ecs.display === "none" || ecs.visibility !== "visible"
            ? 0
            : (parseFloat(ecs.opacity) || 0) * alphaFor(el.parentElement ?? pre);
        alphaOf.set(el, a);
      }
      return a;
    };
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      const parent = t.parentElement!;
      const alpha = alphaFor(parent);
      if (alpha < 0.01) continue;
      const pieces = t.data.replace(/\t/g, "    ").split("\n");
      const range = document.createRange();
      range.selectNodeContents(t);
      const rects = [...range.getClientRects()].map(rel).filter((x) => x.w > 0.5 && x.h > 0.5);
      // A token sits on one line; a plain block is one node over many: a piece per line box.
      const texts = pieces.filter((p, i) => p.length || (i > 0 && i < pieces.length - 1));
      if (rects.length === 1 && texts.length <= 1) {
        if (texts[0])
          tokens.push({
            text: texts[0],
            rect: rects[0]!,
            cs: getComputedStyle(parent),
            alpha,
            el: parent,
          });
        continue;
      }
      let ri = 0;
      for (const p of pieces) {
        if (!p.length) continue;
        const rect = rects[ri++];
        if (rect) tokens.push({ text: p, rect, cs: getComputedStyle(parent), alpha, el: parent });
      }
    }
    if (!tokens.length) return false;
    const rows: { top: number; h: number; tokens: typeof tokens }[] = [];
    for (const t of [...tokens].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)) {
      const row = rows.find((x) => Math.abs(x.top - t.rect.y) < x.h * 0.5);
      if (row) row.tokens.push(t);
      else rows.push({ top: t.rect.y, h: t.rect.h, tokens: [t] });
    }
    rows.sort((a, b) => a.top - b.top);
    const L = cs.lineHeight === "normal" ? px(cs.fontSize) * 1.2 * k : px(cs.lineHeight) * k;
    const left = r.x + (px(cs.borderLeftWidth) + px(cs.paddingLeft)) * k;
    const charW = (() => {
      const t = tokens.find((x) => x.text.trim().length > 1);
      return t ? t.rect.w / t.text.length : px(cs.fontSize) * 0.6 * k;
    })();
    const paragraphs: Paragraph[] = [];
    let prev: number | null = null;
    let maxRight = left;
    for (const row of rows) {
      row.tokens.sort((a, b) => a.rect.x - b.rect.x);
      const para: Paragraph = { runs: [], align: "left", lineHeight: L, before: 0 };
      if (prev !== null) para.before = Math.max(0, row.top - prev - L);
      prev = row.top;
      // Indentation drawn as space before the first token (a line-numbers gutter, a padding).
      const lead = Math.round((row.tokens[0]!.rect.x - left) / charW);
      if (lead > 0)
        para.runs.push({
          text: " ".repeat(lead),
          font: family(cs.fontFamily),
          size: px(cs.fontSize) * k,
          color: [0, 0, 0, 0],
          spacer: true,
        });
      for (const t of row.tokens) {
        const s: Collect = {
          paragraphs: [],
          para,
          rects: [],
          alpha: t.alpha,
          scale: k,
          u: false,
          s: false,
          br: false,
          ink: null,
          chars: 0,
        };
        pushRun(s, t.text, t.cs, t.el);
        maxRight = Math.max(maxRight, t.rect.x + t.rect.w);
      }
      paragraphs.push(para);
    }
    const g = rows[0]!.h;
    const lead = Math.max(0, (L - g) / 2);
    const right = Math.max(
      r.x + r.w - (px(cs.borderRightWidth) + px(cs.paddingRight)) * k,
      maxRight,
    );
    mark(pre, "text");
    over.push({
      kind: "text",
      rect: {
        x: left,
        y: rows[0]!.top - lead,
        w: right - left + charW * 2,
        h: rows.length * L + 2 * lead,
      },
      paragraphs,
      wrap: false,
      code: true,
    });
    return true;
  };

  // ── tables ─────────────────────────────────────────────────────────────────────────────────
  const table = (el: HTMLTableElement, r: Rect, c: Ctx): boolean => {
    if (el.querySelector("img, svg, canvas, video, iframe, table, pre, .katex, ul, ol"))
      return false;
    const rows = [...el.rows].filter((tr) => getComputedStyle(tr).display !== "none");
    if (!rows.length) return false;
    const cellsOf = (tr: HTMLTableRowElement) =>
      [...tr.cells].filter((td) => getComputedStyle(td).display !== "none");
    const edges: number[] = [];
    const addEdge = (x: number) => {
      if (!edges.some((e) => Math.abs(e - x) < 1.5)) edges.push(x);
    };
    for (const tr of rows)
      for (const td of cellsOf(tr)) {
        const cr = rel(td.getBoundingClientRect());
        addEdge(cr.x);
        addEdge(cr.x + cr.w);
      }
    edges.sort((a, b) => a - b);
    const colW = edges.slice(1).map((e, i) => e - edges[i]!);
    if (!colW.length) return false;
    const col = (x: number) => edges.findIndex((e) => Math.abs(e - x) < 1.5);
    const rowH = rows.map((tr) => rel(tr.getBoundingClientRect()).h);
    const k = c.scale;
    const out: Cell[][] = [];
    for (const tr of rows) {
      const trcs = getComputedStyle(tr);
      const sect = tr.parentElement ? getComputedStyle(tr.parentElement) : null;
      const line: Cell[] = [];
      for (const td of cellsOf(tr)) {
        const cs = getComputedStyle(td);
        const cr = rel(td.getBoundingClientRect());
        const a = col(cr.x);
        const b = col(cr.x + cr.w);
        const alpha = c.alpha * (parseFloat(cs.opacity) || 0);
        const s: Collect = {
          paragraphs: [],
          para: newPara(cs, k),
          rects: [],
          alpha,
          scale: k,
          u: false,
          s: false,
          br: false,
          ink: null,
          chars: 0,
        };
        const paras: Paragraph[] = [];
        const flush = () => {
          paras.push(s.para);
          s.para = newPara(cs, k);
        };
        for (const n of td.childNodes) {
          if (n.nodeType === 1 && !isInline(n as Element, getComputedStyle(n as Element))) {
            if (s.para.runs.length) flush();
            const kcs = getComputedStyle(n as Element);
            s.para = newPara(kcs, k);
            for (const kk of (n as Element).childNodes) collectNode(kk, s, n as Element);
            flush();
          } else collectNode(n, s, td);
        }
        if (s.para.runs.length) flush();
        const side = (name: string): CellBorder | null => {
          const w = px(cs.getPropertyValue(`border-${name}-width`)) * k;
          const color = colour(cs.getPropertyValue(`border-${name}-color`), c.alpha);
          const style = cs.getPropertyValue(`border-${name}-style`);
          return w > 0.1 && color && style !== "none" && style !== "hidden"
            ? { width: w, color }
            : null;
        };
        const fill =
          colour(cs.backgroundColor, alpha) ??
          colour(trcs.backgroundColor, c.alpha) ??
          (sect ? colour(sect.backgroundColor, c.alpha) : null);
        const va = cs.verticalAlign;
        line.push({
          paragraphs: tidy(paras),
          ...(fill ? { fill } : {}),
          border: [side("top"), side("right"), side("bottom"), side("left")],
          padding: [
            px(cs.paddingTop) * k,
            px(cs.paddingRight) * k,
            px(cs.paddingBottom) * k,
            px(cs.paddingLeft) * k,
          ],
          valign: va === "middle" ? "middle" : va === "bottom" ? "bottom" : "top",
          colspan: Math.max(1, b - a),
          rowspan: Math.max(1, td.rowSpan || 1),
        });
        mark(td, "text");
        mark(td, "box");
      }
      mark(tr, "box");
      out.push(line);
    }
    for (const sec of el.querySelectorAll("thead, tbody, tfoot")) mark(sec, "box");
    under.push({
      kind: "table",
      rect: { x: edges[0]!, y: r.y, w: edges[edges.length - 1]! - edges[0]!, h: r.h },
      colW,
      rowH,
      rows: out,
    });
    return true;
  };

  // ── the walk ───────────────────────────────────────────────────────────────────────────────
  /** Child nodes, with `display: contents` wrappers opened up. */
  const flowChildren = (el: Element): Node[] => {
    const out: Node[] = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 1 && getComputedStyle(n as Element).display === "contents")
        out.push(...flowChildren(n as Element));
      else out.push(n);
    }
    return out;
  };

  // Background: the page, its background layer, and every element that covers the whole stage
  // from the slide down. Flat colours compose into one; anything else makes it a picture.
  let bg: Rgba = [255, 255, 255, 0];
  let bgPicture = false;
  const background = (el: Element, cs: CSSStyleDeclaration, alpha: number) => {
    mark(el, "bg");
    const fill = colour(cs.backgroundColor, alpha);
    if (fill) bg = over2(fill, bg);
    // The page's own shadow (on screen only) falls outside the slide.
    const shadow = el !== pageEl && cs.boxShadow !== "none";
    if (
      cs.backgroundImage !== "none" ||
      shadow ||
      px(cs.borderTopWidth) + px(cs.borderLeftWidth) > 0
    )
      bgPicture = true;
    if (pseudoPaints(el, "::before") || pseudoPaints(el, "::after")) {
      bgPicture = true;
      mark(el, "bgpseudo");
    }
  };
  background(pageEl, getComputedStyle(pageEl), 1);
  const layer = pageEl.querySelector(":scope > .deck-background");
  if (layer) {
    mark(layer, "all");
    for (const d of layer.querySelectorAll("*")) {
      const dcs = getComputedStyle(d);
      if (dcs.display === "none" || dcs.visibility !== "visible" || !(parseFloat(dcs.opacity) > 0))
        continue;
      const dr = rel(d.getBoundingClientRect());
      if (dr.w < 1 || dr.h < 1) continue;
      const fill = colour(dcs.backgroundColor, parseFloat(dcs.opacity));
      const media = /^(IMG|VIDEO|CANVAS|IFRAME)$/.test(d.tagName) || d instanceof SVGElement;
      if (
        media ||
        dcs.backgroundImage !== "none" ||
        (fill && !full(dr)) ||
        pseudoPaints(d, "::before") ||
        pseudoPaints(d, "::after")
      )
        bgPicture = true;
      else if (fill) bg = over2(fill, bg);
    }
  }

  function visit(el: Element, ctx: Ctx, contributor = false): void {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    if (el.getAttribute("data-export") === "skip") return mark(el, "all");
    const alpha = ctx.alpha * (parseFloat(cs.opacity) || 0);
    if (alpha < 0.01) return;
    const r = rel(el.getBoundingClientRect());
    const visible = cs.visibility === "visible";
    const tag = el.tagName.toUpperCase();
    const reason = tag === "IMG" ? null : rasterReason(el, cs);
    if (reason) {
      if (visible) raster(el, r, "all", reason);
      return;
    }
    if (!inSlide(r) && cs.overflow !== "visible") return;
    // A transform's scale, and CSS `zoom` (a slide's `zoom:`): computed sizes leave both out.
    const scale = ctx.scale * (scaleOf(cs.transform) ?? 1) * (parseFloat(cs.zoom) || 1);
    const c: Ctx = { alpha, scale };
    if (tag === "IMG") {
      if (visible) image(el as HTMLImageElement, cs, r, c);
      return;
    }
    // Still the stage's backdrop (the slide, a full-bleed layout): its paint is the background.
    const backdrop =
      contributor && full(r) && !/^(TABLE|PRE|UL|OL|P|H[1-6]|A|BUTTON)$/.test(tag) && alpha > 0.99;
    if (backdrop && visible) background(el, cs, alpha);
    else if (visible) paint(el, cs, r, c);
    if (visible && tag === "TABLE" && table(el as HTMLTableElement, r, c)) return;
    if (visible && tag === "PRE" && code(el, cs, r, c)) return;
    if ((tag === "UL" || tag === "OL") && visible && listBox(el, cs, r, c)) return;

    // The flow: runs of inline content become text boxes; blocks are visited.
    const flex = /(flex|grid)$/.test(cs.display);
    let group: Node[] = [];
    const flush = () => {
      if (group.some((n) => n.nodeType === 1 || (n.textContent ?? "").trim())) {
        const li =
          tag === "LI" &&
          !group.some(
            (n) => n.nodeType === 1 && !isInline(n as Element, getComputedStyle(n as Element)),
          );
        const bullet = li ? liBullet(el, cs, scale) : undefined;
        textBox(el, cs, group, c, bullet);
      }
      group = [];
    };
    for (const n of flowChildren(el)) {
      if (n.nodeType === 3) {
        group.push(n);
        continue;
      }
      if (n.nodeType !== 1) continue;
      const kid = n as Element;
      const kcs = getComputedStyle(kid);
      if (kcs.display === "none") continue;
      if (!flex && isInline(kid, kcs)) {
        group.push(kid);
        continue;
      }
      flush();
      visit(kid, c, backdrop);
    }
    flush();
  }

  /** The bullet of a list item laid out on its own (a list too rich for one text box). */
  const liBullet = (li: Element, cs: CSSStyleDeclaration, scale: number): Bullet | undefined => {
    const list = li.parentElement;
    if (!list) return undefined;
    const indent = px(getComputedStyle(list).paddingLeft) * scale || 24;
    const type = cs.listStyleType;
    mark(li, "marker");
    if (NUMBERS[type]) {
      const n =
        [...list.children].filter((x) => x.tagName === "LI").indexOf(li) +
        ((list as HTMLOListElement).start || 1);
      return { kind: "number", numberType: NUMBERS[type], level: 0, indent, start: n };
    }
    const quoted = /^"(.*)"$/.exec(type)?.[1];
    if (BULLETS[type] || quoted)
      return { kind: "bullet", char: (BULLETS[type] ?? quoted!.trim()) || "•", level: 0, indent };
    return undefined;
  };

  visit(slideEl, { alpha: 1, scale: 1 }, true);
  root.dataset.kxNext = String(nextId);

  const page = pageEl;
  const slide = page.querySelector<HTMLElement>(".deck-slide");
  const opaque: Rgba | null = bg[3] > 0.004 ? over2(bg, [255, 255, 255, 1]) : null;
  return {
    page: index,
    slide: Number(page.dataset.slide ?? slide?.dataset.index ?? index),
    h: Number(page.dataset.h ?? 0),
    v: Number(page.dataset.v ?? 0),
    click: Number(page.dataset.click ?? 0),
    width: W,
    height: H,
    background: { color: opaque, raster: bgPicture },
    under,
    over,
    fonts: [...fonts],
  };
}
