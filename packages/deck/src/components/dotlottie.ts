/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOTTIE FILES  —  a .json, or a .lottie (dotLottie: a zip of them), as one animation's data
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * dotLottie is a zip: `manifest.json` (its `animations[].id`), the animations under
 * `animations/<id>.json` (v1) or `a/<id>.json` (v2), their images under `images/` or `i/`. The
 * first animation is the one played; each image it names is embedded as a data URL, so the
 * player needs nothing else. Zip entries are stored or deflated, and the browser's own
 * `DecompressionStream("deflate-raw")` inflates them: no unzip library in the bundle.
 *
 * What a file is goes by its bytes, not its name ("PK\x03\x04" is a zip): a store URL ends in
 * `.lottie` or `.json` but a deck's own may not.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type LottieData = Record<string, unknown> & {
  w?: number;
  h?: number;
  fr?: number;
  ip?: number;
  op?: number;
  assets?: Array<Record<string, unknown>>;
};

export class LottieFileError extends Error {
  override name = "LottieFileError";
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

const u16 = (b: DataView, o: number) => b.getUint16(o, true);
const u32 = (b: DataView, o: number) => b.getUint32(o, true);

/** Whether the bytes are a zip (a .lottie). */
export const isZip = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

/** The entries of a zip, from its central directory. */
export function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record: at the end, before a comment of up to 64 KiB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new LottieFileError("not a zip: no central directory");
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const out = new Map<string, ZipEntry>();
  const text = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) throw new LottieFileError("a broken zip directory");
    const method = u16(view, p + 10);
    const compressedSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const local = u32(view, p + 42);
    const name = text.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // The data starts after the local header, whose name and extra lengths are its own.
    const offset = local + 30 + u16(view, local + 26) + u16(view, local + 28);
    out.set(name.replace(/^\.?\//, ""), { name, method, compressedSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes, inflated. */
export async function readEntry(bytes: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const raw = bytes.subarray(e.offset, e.offset + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method !== 8)
    throw new LottieFileError(`${e.name}: zip method ${e.method} is not supported`);
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function dataUrl(name: string, bytes: Uint8Array): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${MIME[ext] ?? "application/octet-stream"};base64,${btoa(bin)}`;
}

/** The first animation of a .lottie, its images embedded. `animation` picks one by id. */
export async function readDotLottie(bytes: Uint8Array, animation?: string): Promise<LottieData> {
  const entries = zipEntries(bytes);
  const json = async (name: string) =>
    JSON.parse(new TextDecoder().decode(await readEntry(bytes, entries.get(name)!))) as unknown;
  const manifest = entries.has("manifest.json")
    ? ((await json("manifest.json")) as { animations?: Array<{ id?: string }> })
    : null;
  const ids = (manifest?.animations ?? []).map((a) => a.id).filter((id): id is string => !!id);
  const id = animation && ids.includes(animation) ? animation : ids[0];
  const candidates = id
    ? [`a/${id}.json`, `animations/${id}.json`]
    : [...entries.keys()].filter((k) => /^(a|animations)\/[^/]+\.json$/.test(k));
  const path = candidates.find((c) => entries.has(c));
  if (!path) throw new LottieFileError("a .lottie with no animation in it");
  const data = (await json(path)) as LottieData;
  for (const asset of data.assets ?? []) {
    const file = typeof asset.p === "string" ? asset.p : "";
    if (!file || asset.e === 1 || file.startsWith("data:")) continue;
    const entry = [`i/${file}`, `images/${file}`].find((k) => entries.has(k));
    if (!entry) continue;
    asset.p = dataUrl(file, await readEntry(bytes, entries.get(entry)!));
    asset.u = "";
    asset.e = 1;
  }
  return data;
}

/** A Lottie file's bytes (JSON or .lottie) as the animation's data. */
export async function readLottie(bytes: Uint8Array, animation?: string): Promise<LottieData> {
  if (isZip(bytes)) return readDotLottie(bytes, animation);
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new LottieFileError("neither Lottie JSON nor a .lottie");
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as LottieData).layers))
    throw new LottieFileError("JSON, but not a Lottie animation (no layers)");
  return data as LottieData;
}

/** The animation's size and length from its data: what the box is shaped by before it plays. */
export function lottieInfo(data: LottieData): { width: number; height: number; seconds: number } {
  const width = Number(data.w) || 0;
  const height = Number(data.h) || 0;
  const fr = Number(data.fr) || 30;
  const frames = Math.max(0, (Number(data.op) || 0) - (Number(data.ip) || 0));
  return { width, height, seconds: frames / fr };
}
