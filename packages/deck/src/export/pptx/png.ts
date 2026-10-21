import { deflateSync, inflateSync } from "node:zlib";

/**
 * Just enough PNG for the editable exporter: Playwright's screenshots (8-bit RGBA or RGB,
 * non-interlaced) decoded to pixels, cropped, measured and written back. Node's zlib does the
 * compression; nothing else is needed, so no image library comes along.
 */

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel, row by row. */
  data: Uint8Array;
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(buf: Uint8Array): Bitmap {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < 8; i++) if (buf[i] !== SIGNATURE[i]) throw new Error("not a PNG");
  let off = 8;
  let width = 0,
    height = 0,
    depth = 0,
    type = 0,
    interlace = 0;
  const idat: Uint8Array[] = [];
  while (off < buf.length) {
    const len = view.getUint32(off);
    const kind = String.fromCharCode(...buf.subarray(off + 4, off + 8));
    const body = buf.subarray(off + 8, off + 8 + len);
    if (kind === "IHDR") {
      const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
      width = v.getUint32(0);
      height = v.getUint32(4);
      depth = body[8]!;
      type = body[9]!;
      interlace = body[12]!;
    } else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 6 && type !== 2))
    throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const channels = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]!;
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c),
          pb = Math.abs(a - c),
          pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * channels]!;
      out[o + 1] = cur[x * channels + 1]!;
      out[o + 2] = cur[x * channels + 2]!;
      out[o + 3] = channels === 4 ? cur[x * channels + 3]! : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  for (const b of bytes) crc = CRC[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return crc;
}

function chunk(kind: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = kind.charCodeAt(i);
  out.set(body, 8);
  v.setUint32(8 + body.length, (crc32(out.subarray(4, 8 + body.length)) ^ 0xffffffff) >>> 0);
  return out;
}

export function encodePng(bmp: Bitmap): Uint8Array {
  const { width, height, data } = bmp;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function crop(bmp: Bitmap, b: Box): Bitmap {
  const x0 = Math.max(0, Math.floor(b.x));
  const y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(bmp.width, Math.ceil(b.x + b.w));
  const y1 = Math.min(bmp.height, Math.ceil(b.y + b.h));
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    data.set(
      bmp.data.subarray(((y0 + y) * bmp.width + x0) * 4, ((y0 + y) * bmp.width + x1) * 4),
      y * width * 4,
    );
  return { width, height, data };
}

/** Is anything painted in this strip? Alpha above `min` counts. */
function inked(bmp: Bitmap, b: Box, min: number, axis: "row" | "col", at: number): boolean {
  if (axis === "row") {
    for (let x = b.x; x < b.x + b.w; x++)
      if (bmp.data[(at * bmp.width + x) * 4 + 3]! > min) return true;
  } else {
    for (let y = b.y; y < b.y + b.h; y++)
      if (bmp.data[(y * bmp.width + at) * 4 + 3]! > min) return true;
  }
  return false;
}

/**
 * The painted parts of a mostly transparent picture, as tight boxes: an XY cut that splits along
 * every empty band at least `gap` pixels wide, so separate decorations become separate pictures
 * (each one movable in PowerPoint) while one drawing stays one. Empty → [].
 */
export function inkBoxes(bmp: Bitmap, { gap = 16, min = 8, max = 48 } = {}): Box[] {
  const out: Box[] = [];
  /** Painted bands along one axis of `b`, as [from, to) offsets, merged across gaps < `gap`. */
  const bands = (b: Box, axis: "row" | "col"): [number, number][] => {
    const n = axis === "row" ? b.h : b.w;
    const start = axis === "row" ? b.y : b.x;
    const found: [number, number][] = [];
    let open = -1;
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (!inked(bmp, b, min, axis, start + i)) continue;
      if (open < 0) open = i;
      else if (i - last - 1 >= gap) {
        found.push([open, last + 1]);
        open = i;
      }
      last = i;
    }
    if (open >= 0) found.push([open, last + 1]);
    return found;
  };
  const cut = (b: Box, depth: number) => {
    const rows = bands(b, "row");
    if (!rows.length) return;
    if (rows.length > 1 && depth < 10) {
      for (const [a, z] of rows) cut({ x: b.x, y: b.y + a, w: b.w, h: z - a }, depth + 1);
      return;
    }
    const tight = {
      x: b.x,
      y: b.y + rows[0]![0],
      w: b.w,
      h: rows[rows.length - 1]![1] - rows[0]![0],
    };
    const cols = bands(tight, "col");
    if (cols.length > 1 && depth < 10) {
      for (const [a, z] of cols)
        cut({ x: tight.x + a, y: tight.y, w: z - a, h: tight.h }, depth + 1);
      return;
    }
    if (cols.length)
      out.push({
        x: tight.x + cols[0]![0],
        y: tight.y,
        w: cols[cols.length - 1]![1] - cols[0]![0],
        h: tight.h,
      });
  };
  cut({ x: 0, y: 0, w: bmp.width, h: bmp.height }, 0);
  if (out.length <= max) return out;
  // Too many specks to be worth separate pictures: one box around them all.
  const x0 = Math.min(...out.map((b) => b.x));
  const y0 = Math.min(...out.map((b) => b.y));
  const x1 = Math.max(...out.map((b) => b.x + b.w));
  const y1 = Math.max(...out.map((b) => b.y + b.h));
  return [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
}
