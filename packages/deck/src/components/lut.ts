/**
 * ─────────────────────────────────────────────────────────────────────────────
 * .cube LUTS  —  reading a colour grade (pure; the WebGL side is lut-gl.ts, lazy)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Image src="/harbour.jpg" lut="/luts/teal-orange.cube" lutStrength={0.8} />
 *   <Video src="/clip.mp4" lut="https://…/film.cube" autoplay loop />
 *
 * The Adobe/Resolve `.cube` text format: `LUT_3D_SIZE n` and n³ lines of "r g b" (red changing
 * fastest, then green, then blue), with an optional `TITLE`, `DOMAIN_MIN` / `DOMAIN_MAX` (or
 * Resolve's `LUT_3D_INPUT_RANGE lo hi`). A 1D LUT (`LUT_1D_SIZE n`: one curve per channel) is
 * sampled into a 33³ cube, so the shader only ever sees one kind. The grade is applied to the
 * encoded (sRGB) values, as photo and video LUTs are made to be.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CubeLut {
  title: string | null;
  /** Points per axis. */
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** size³ × RGB, red fastest: the order a 3D texture of size×size×size takes. */
  data: Float32Array;
}

export class LutError extends Error {
  override name = "LutError";
}

/** The largest cube read (256³ is 50 MB of floats; real LUTs are 17, 33 or 65). */
export const MAX_LUT_SIZE = 129;
/** The cube a 1D LUT is sampled into. */
const FROM_1D = 33;

const triple = (parts: string[], line: number): [number, number, number] => {
  const v = parts.map(Number);
  if (v.length !== 3 || v.some((n) => !Number.isFinite(n)))
    throw new LutError(`line ${line}: expected three numbers`);
  return v as [number, number, number];
};

/** A `.cube` file's text as a 3D LUT; throws LutError for anything it can't use. */
export function parseCube(text: string): CubeLut {
  let title: string | null = null;
  let size3 = 0;
  let size1 = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const hash = raw.indexOf("#");
    const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (!line) continue;
    const c = line.charCodeAt(0);
    // A data line starts with a digit, a sign or a point.
    if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
      const parts = line.split(/\s+/);
      values.push(...triple(parts, i + 1));
      continue;
    }
    const [key, ...rest] = line.split(/\s+/);
    switch (key!.toUpperCase()) {
      case "TITLE":
        title =
          line
            .slice(5)
            .trim()
            .replace(/^"(.*)"$/, "$1") || null;
        break;
      case "LUT_3D_SIZE":
        size3 = Number(rest[0]);
        if (!Number.isInteger(size3) || size3 < 2 || size3 > MAX_LUT_SIZE)
          throw new LutError(`LUT_3D_SIZE ${rest[0]} is not between 2 and ${MAX_LUT_SIZE}`);
        break;
      case "LUT_1D_SIZE":
        size1 = Number(rest[0]);
        if (!Number.isInteger(size1) || size1 < 2 || size1 > 65536)
          throw new LutError(`LUT_1D_SIZE ${rest[0]} is not between 2 and 65536`);
        break;
      case "DOMAIN_MIN":
        domainMin = triple(rest, i + 1);
        break;
      case "DOMAIN_MAX":
        domainMax = triple(rest, i + 1);
        break;
      case "LUT_3D_INPUT_RANGE":
      case "LUT_1D_INPUT_RANGE": {
        const [lo, hi] = rest.map(Number);
        if (!Number.isFinite(lo) || !Number.isFinite(hi))
          throw new LutError(`line ${i + 1}: expected two numbers`);
        domainMin = [lo!, lo!, lo!];
        domainMax = [hi!, hi!, hi!];
        break;
      }
      default:
        // Other keywords (a vendor's own) say nothing about the colours.
        break;
    }
  }
  if (domainMin.some((lo, k) => !(domainMax[k]! > lo)))
    throw new LutError("DOMAIN_MAX must be above DOMAIN_MIN");
  if (size3) {
    if (values.length !== size3 ** 3 * 3)
      throw new LutError(
        `expected ${size3 ** 3} entries for LUT_3D_SIZE ${size3}, found ${values.length / 3}`,
      );
    return { title, size: size3, domainMin, domainMax, data: Float32Array.from(values) };
  }
  if (size1) {
    if (values.length !== size1 * 3)
      throw new LutError(
        `expected ${size1} entries for LUT_1D_SIZE ${size1}, found ${values.length / 3}`,
      );
    return { title, size: FROM_1D, domainMin, domainMax, data: cubeFrom1D(values, size1) };
  }
  throw new LutError("no LUT_3D_SIZE or LUT_1D_SIZE: not a .cube LUT");
}

/** A 1D LUT's three curves, linearly sampled into a FROM_1D³ cube over the same domain. */
function cubeFrom1D(values: number[], n: number): Float32Array {
  const curve = (ch: number, t: number) => {
    const x = t * (n - 1);
    const i = Math.min(n - 2, Math.floor(x));
    const f = x - i;
    return values[i * 3 + ch]! * (1 - f) + values[(i + 1) * 3 + ch]! * f;
  };
  const s = FROM_1D;
  const out = new Float32Array(s * s * s * 3);
  for (let b = 0; b < s; b++)
    for (let g = 0; g < s; g++)
      for (let r = 0; r < s; r++) {
        const o = ((b * s + g) * s + r) * 3;
        out[o] = curve(0, r / (s - 1));
        out[o + 1] = curve(1, g / (s - 1));
        out[o + 2] = curve(2, b / (s - 1));
      }
  return out;
}

/**
 * The LUT's colour for one input colour (each 0–1), trilinear as the GPU samples it: what the
 * shader computes, for tests and for a CPU fallback.
 */
export function sampleCube(lut: CubeLut, rgb: [number, number, number]): [number, number, number] {
  const n = lut.size;
  const at = rgb.map((v, k) => {
    const t = (v - lut.domainMin[k]!) / (lut.domainMax[k]! - lut.domainMin[k]!);
    return Math.min(1, Math.max(0, t)) * (n - 1);
  });
  const i0 = at.map((x) => Math.min(n - 2, Math.floor(x)));
  const f = at.map((x, k) => x - i0[k]!);
  const out: [number, number, number] = [0, 0, 0];
  for (let corner = 0; corner < 8; corner++) {
    const dr = corner & 1;
    const dg = (corner >> 1) & 1;
    const db = (corner >> 2) & 1;
    const w = (dr ? f[0]! : 1 - f[0]!) * (dg ? f[1]! : 1 - f[1]!) * (db ? f[2]! : 1 - f[2]!);
    if (!w) continue;
    const o = (((i0[2]! + db) * n + (i0[1]! + dg)) * n + (i0[0]! + dr)) * 3;
    out[0] += lut.data[o]! * w;
    out[1] += lut.data[o + 1]! * w;
    out[2] += lut.data[o + 2]! * w;
  }
  return out;
}

/** `lutStrength` as a mix factor: 0 (none) to 1 (the full grade, the default). */
export function lutStrengthOf(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

/** The identity LUT of a size: every colour maps to itself (tests, and a `.cube` to start from). */
export function identityCube(size = 2): string {
  const lines = [`TITLE "Identity"`, `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++)
        lines.push([r, g, b].map((v) => (v / (size - 1)).toFixed(6)).join(" "));
  return `${lines.join("\n")}\n`;
}
