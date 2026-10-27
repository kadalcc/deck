import { inflateSync } from "node:zlib";

/**
 * The arithmetic behind `kadal-deck contrast`, kept free of the browser so it can be tested:
 * CSS colours as Chromium computes them, alpha blending, WCAG 2.x relative luminance and
 * contrast ratio, the large-text rule, percentiles, and a PNG decoder for Chromium's pictures.
 */

/** sRGB, 0–255 per channel (fractional allowed), alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
export type Rgb = Omit<Rgba, "a">;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Linear-light sRGB (0–1) → gamma-encoded 0–255. */
function encode(l: number): number {
  const c = clamp(l, 0, 1);
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
}
/** Gamma-encoded 0–1 → linear light. */
function decode(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(r: number, g: number, b: number, a: number): Rgba {
  return { r: encode(r), g: encode(g), b: encode(b), a };
}

/** OKLab → linear sRGB (Björn Ottosson's matrices). */
function oklabToLinear(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** CIE Lab (D50) → linear sRGB, through XYZ and the Bradford adaptation to D65. */
function labToLinear(L: number, A: number, B: number): [number, number, number] {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const x = ((fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * 0.3457) / 0.3585;
  const y = L > k * e ? fy ** 3 : L / k;
  const z = ((fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * (1 - 0.3457 - 0.3585)) / 0.3585;
  // D50 → D65 (Bradford), then XYZ → linear sRGB.
  const X = 0.9554734527042182 * x - 0.023098536874261423 * y + 0.0632593086610217 * z;
  const Y = -0.028369706963208136 * x + 1.0099954580058226 * y + 0.021041398966943008 * z;
  const Z = 0.012314001688319899 * x - 0.020507696433477912 * y + 1.3303659366080753 * z;
  return [
    3.2409699419045226 * X - 1.537383177570094 * Y - 0.4986107602930034 * Z,
    -0.9692436362808796 * X + 1.8759675015077202 * Y + 0.04155505740717559 * Z,
    0.05563007969699366 * X - 0.20397695888897652 * Y + 1.0569715142428786 * Z,
  ];
}

/** Display P3 (linear) → linear sRGB. */
function p3ToLinearSrgb(r: number, g: number, b: number): [number, number, number] {
  return [
    1.2249401762805598 * r - 0.22494017628055996 * g,
    -0.042056954709688 * r + 1.042056954709688 * g,
    -0.019637554590334432 * r - 0.07863604555063189 * g + 1.0982736001409663 * b,
  ];
}

const NAMED: Record<string, Rgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
};

/** A number token, with `%` read against `pct` (100% = pct) and `none` as 0. */
function num(tok: string | undefined, pct = 1): number {
  if (tok === undefined || tok === "none") return 0;
  if (tok.endsWith("%")) return (parseFloat(tok) / 100) * pct;
  if (tok.endsWith("deg")) return parseFloat(tok);
  if (tok.endsWith("turn")) return parseFloat(tok) * 360;
  if (tok.endsWith("rad")) return (parseFloat(tok) * 180) / Math.PI;
  return parseFloat(tok);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * A CSS colour as `getComputedStyle` gives it — `rgb()`/`rgba()`, `color(srgb|srgb-linear|
 * display-p3 …)`, `oklab()`, `oklch()`, `lab()`, `lch()`, `hsl()`, hex, `transparent` — in sRGB.
 * Null for what is not a plain colour (`url(#gradient)`, `none`, `currentcolor`).
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (NAMED[s]) return { ...NAMED[s]! };
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
    const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
    const v = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: full.length === 8 ? v(6) / 255 : 1 };
  }
  const m = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!m) return null;
  const fn = m[1]!;
  // `rgb(1, 2, 3, 0.5)`, `rgb(1 2 3 / 50%)`, `color(srgb 0.1 0.2 0.3 / 0.5)` all split alike.
  const [main, alphaPart] = m[2]!.replace(/,/g, " ").split("/");
  const parts = main!.trim().split(/\s+/);
  let alphaTok: string | undefined = alphaPart?.trim();
  if (fn === "color") {
    const space = parts.shift();
    const [r, g, b] = parts.map((p) => num(p, 1));
    const a = alphaTok === undefined ? 1 : clamp(num(alphaTok, 1), 0, 1);
    if ([r, g, b].some((x) => x === undefined || Number.isNaN(x))) return null;
    if (space === "srgb") return { r: r! * 255, g: g! * 255, b: b! * 255, a };
    if (space === "srgb-linear") return fromLinear(r!, g!, b!, a);
    if (space === "display-p3") {
      const [lr, lg, lb] = p3ToLinearSrgb(decode(r!), decode(g!), decode(b!));
      return fromLinear(lr, lg, lb, a);
    }
    return null;
  }
  if (alphaTok === undefined && parts.length === 4) alphaTok = parts.pop();
  const a = alphaTok === undefined ? 1 : clamp(num(alphaTok, 1), 0, 1);
  if (parts.length !== 3) return null;
  let out: Rgba | null = null;
  switch (fn) {
    case "rgb":
    case "rgba": {
      const [r, g, b] = parts.map((p) => num(p, 255));
      out = { r: r!, g: g!, b: b!, a };
      break;
    }
    case "hsl":
    case "hsla": {
      const [r, g, b] = hslToRgb(num(parts[0]), num(parts[1], 1), num(parts[2], 1));
      out = { r, g, b, a };
      break;
    }
    case "oklab": {
      const [l, aa, bb] = oklabToLinear(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4));
      out = fromLinear(l, aa, bb, a);
      break;
    }
    case "oklch": {
      const L = num(parts[0], 1);
      const C = num(parts[1], 0.4);
      const H = (num(parts[2]) * Math.PI) / 180;
      const [l, aa, bb] = oklabToLinear(L, C * Math.cos(H), C * Math.sin(H));
      out = fromLinear(l, aa, bb, a);
      break;
    }
    case "lab": {
      const [l, aa, bb] = labToLinear(num(parts[0], 100), num(parts[1], 125), num(parts[2], 125));
      out = fromLinear(l, aa, bb, a);
      break;
    }
    case "lch": {
      const L = num(parts[0], 100);
      const C = num(parts[1], 150);
      const H = (num(parts[2]) * Math.PI) / 180;
      const [l, aa, bb] = labToLinear(L, C * Math.cos(H), C * Math.sin(H));
      out = fromLinear(l, aa, bb, a);
      break;
    }
    default:
      return null;
  }
  if ([out.r, out.g, out.b, out.a].some((x) => Number.isNaN(x))) return null;
  return {
    r: clamp(out.r, 0, 255),
    g: clamp(out.g, 0, 255),
    b: clamp(out.b, 0, 255),
    a: out.a,
  };
}

/** `fg` (with its alpha, times `opacity`) painted over the opaque `bg`. */
export function blend(fg: Rgba, bg: Rgb, opacity = 1): Rgb {
  const a = clamp(fg.a * opacity, 0, 1);
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

/** WCAG 2.x relative luminance of an sRGB colour, 0 (black) – 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * decode(clamp(r, 0, 255) / 255) +
    0.7152 * decode(clamp(g, 0, 255) / 255) +
    0.0722 * decode(clamp(b, 0, 255) / 255)
  );
}

/** WCAG 2.x contrast ratio of two opaque colours, 1–21, either order. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * WCAG's large text: at least 18pt (24 CSS px), or 14pt (18.66 px) bold. Measured in stage
 * pixels — the 1920 × 1080 slide — because that is the page's own size.
 */
export function isLargeText(px: number, weight: number): boolean {
  return px >= 24 || (weight >= 700 && px >= 18.66);
}

/** The `p`th percentile (0–100) of `values`, linearly interpolated; NaN for none. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  const at = (clamp(p, 0, 100) / 100) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where to sample the background under some lines of text: a grid over each line box, rows at a
 * quarter, half and three quarters of its height (glyph bodies, not the line's leading), columns
 * about every 12px — at most `max` points across all the boxes, spread by area.
 */
export function sampleGrid(boxes: readonly Box[], max = 96): Array<[number, number]> {
  const area = boxes.reduce((s, b) => s + b.w * b.h, 0);
  if (!area) return [];
  const pts: Array<[number, number]> = [];
  for (const b of boxes) {
    const share = Math.max(3, Math.round((max * b.w * b.h) / area));
    const rows = b.h >= 12 ? 3 : 1;
    const cols = Math.max(1, Math.min(Math.ceil(b.w / 12), Math.floor(share / rows)));
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        pts.push([b.x + (b.w * (j + 0.5)) / cols, b.y + (b.h * (i + 1)) / (rows + 1)]);
  }
  return pts;
}

export interface Judged {
  /** The contrast the check goes by: the `pct`th percentile across samples. */
  ratio: number;
  /** The text colour as painted (its alpha and opacity applied) over the background there. */
  fg: Rgb;
  /** The background at that sample. */
  bg: Rgb;
  /** The best sample, for the report (a ratio that ranges widely means a busy background). */
  best: number;
}

/** Contrast of `fg` × `opacity` over each sampled background, judged at the `pct`th percentile. */
export function judge(fg: Rgba, opacity: number, samples: readonly Rgb[], pct = 10): Judged | null {
  if (!samples.length) return null;
  const rows = samples.map((bg) => {
    const painted = blend(fg, bg, opacity);
    return { bg, fg: painted, ratio: contrastRatio(painted, bg) };
  });
  const ratio = percentile(
    rows.map((r) => r.ratio),
    pct,
  );
  // The sample closest to the percentile stands for it in the report.
  let pick = rows[0]!;
  for (const r of rows) if (Math.abs(r.ratio - ratio) < Math.abs(pick.ratio - ratio)) pick = r;
  return { ratio, fg: pick.fg, bg: pick.bg, best: Math.max(...rows.map((r) => r.ratio)) };
}

export function hex({ r, g, b }: Rgb): string {
  const h = (x: number) =>
    Math.round(clamp(x, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export interface Png {
  width: number;
  height: number;
  /** The pixel at (x, y), clamped to the picture. */
  at(x: number, y: number): Rgb;
}

/** Decode an 8-bit, non-interlaced greyscale, RGB or RGBA PNG (what Chromium writes). */
export function decodePng(buf: Uint8Array): Png {
  const view = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 3;
  const idat: Buffer[] = [];
  while (pos < view.length) {
    const len = view.readUInt32BE(pos);
    const type = view.toString("ascii", pos + 4, pos + 8);
    const data = view.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("only 8-bit, non-interlaced PNGs");
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]!] ?? 0;
      if (!channels) throw new Error(`PNG colour type ${data[9]} is not supported`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const x = raw[row + i]!;
      const a = i >= channels ? out[y * stride + i - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = (x + add) & 255;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const px = clamp(Math.floor(x), 0, width - 1);
      const py = clamp(Math.floor(y), 0, height - 1);
      const o = py * stride + px * channels;
      if (channels <= 2) return { r: out[o]!, g: out[o]!, b: out[o]! };
      return { r: out[o]!, g: out[o + 1]!, b: out[o + 2]! };
    },
  };
}

/**
 * What is behind the glyphs near (x, y): within `r` pixels, the pixels where the page with its
 * text (`ink`) differs from the page without (`bare`) are where a glyph is painted; the mean of
 * `bare` there is the background those glyphs sit on. Null when no glyph is painted nearby — the
 * gap between words, a part of the line box a rotation or a clip-path leaves empty, text another
 * element covers — so only background the text really crosses is judged.
 *
 * With `fg` (the text's colour, and `opacity`), a changed pixel counts only when it is nearer that
 * colour painted over the background than the background itself: another text crossing the same
 * box (a stacked label, the other half of a split word) is not this one's ink.
 */
export function inkBackground(
  ink: Png,
  bare: Png,
  x: number,
  y: number,
  r: number,
  fg?: Rgba,
  opacity = 1,
  threshold = 12,
): Rgb | null {
  let n = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  const dist = (p: Rgb, q: Rgb) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const a = ink.at(x + dx, y + dy);
      const b = bare.at(x + dx, y + dy);
      if (dist(a, b) <= threshold) continue;
      if (fg && dist(a, blend(fg, b, opacity)) >= dist(a, b)) continue;
      n++;
      red += b.r;
      green += b.g;
      blue += b.b;
    }
  return n ? { r: red / n, g: green / n, b: blue / n } : null;
}

/** The mean colour of the 3 × 3 pixels around (x, y): one stray pixel does not decide. */
export function sampleAt(png: Png, x: number, y: number): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const p = png.at(x + dx, y + dy);
      r += p.r;
      g += p.g;
      b += p.b;
    }
  return { r: r / 9, g: g / 9, b: b / 9 };
}
