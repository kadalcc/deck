/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A DURATION FOR A RECORDED WEBM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MediaRecorder writes WebM as it goes, so it never knows how long the file will be: the Segment's
 * Info has no Duration, and players show no length and seek badly. Once the recording has stopped
 * we know, so we write it in: find Info near the start of the file, put a Duration element in it
 * (an 8-byte float, in the file's own timecode scale) and give Info a size that says so. The
 * Segment around it was written with "unknown size" and Chrome writes no seek index, so nothing
 * else in the file points past Info and nothing else has to move.
 *
 * Anything unexpected (not EBML, Info not where it should be, a size we would have to recompute)
 * hands back the file untouched: a recording without a duration beats a broken one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ID = {
  ebml: 0x1a45dfa3,
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  cluster: 0x1f43b675,
};

interface Vint {
  value: number;
  length: number;
  /** All value bits set: an element whose size was not known when it was written. */
  unknown: boolean;
}

/** An element ID: the leading-zero count of its first byte says how long it is; marker kept. */
function readId(b: Uint8Array, at: number): Vint | null {
  const first = b[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 24 + 1;
  if (length > 4 || at + length > b.length) return null;
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + b[at + i]!;
  return { value, length, unknown: false };
}

/** A data size: like an ID, but with the marker bit taken off. */
function readSize(b: Uint8Array, at: number): Vint | null {
  const first = b[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 24 + 1;
  if (length > 8 || at + length > b.length) return null;
  let value = first & (0xff >> length);
  let ones = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = b[at + i]!;
    value = value * 256 + byte;
    if (byte !== 0xff) ones = false;
  }
  return { value, length, unknown: ones };
}

/** A size as an 8-byte vint, which can say any size a recording will have. */
function size8(n: number): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  let v = n;
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

const idBytes = (id: number) => {
  const out: number[] = [];
  let v = id;
  while (v > 0) {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(out);
};

function readUint(b: Uint8Array, at: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[at + i]!;
  return v;
}

function readFloat(b: Uint8Array, at: number, len: number): number {
  const view = new DataView(b.buffer, b.byteOffset + at, len);
  return len === 4 ? view.getFloat32(0) : len === 8 ? view.getFloat64(0) : 0;
}

/**
 * The bytes of a WebM's start with Duration (ms) written into Info, and where the old Info ended;
 * null when the file is not one we can safely change, or already says how long it is.
 */
export function withDuration(
  head: Uint8Array,
  ms: number,
): { bytes: Uint8Array; replaced: number } | null {
  if (!(ms > 0)) return null;
  let at = 0;
  const top = readId(head, at);
  if (!top || top.value !== ID.ebml) return null;
  at += top.length;
  const topSize = readSize(head, at);
  if (!topSize || topSize.unknown) return null;
  at += topSize.length + topSize.value;
  const seg = readId(head, at);
  if (!seg || seg.value !== ID.segment) return null;
  at += seg.length;
  const segSize = readSize(head, at);
  if (!segSize) return null;
  // A Segment with a known size would have to grow too; MediaRecorder never writes one.
  if (!segSize.unknown) return null;
  at += segSize.length;
  while (at < head.length) {
    const id = readId(head, at);
    if (!id) return null;
    const sz = readSize(head, at + id.length);
    if (!sz || sz.unknown) return null;
    const dataAt = at + id.length + sz.length;
    const end = dataAt + sz.value;
    if (id.value === ID.cluster) return null;
    if (id.value !== ID.info) {
      at = end;
      continue;
    }
    if (end > head.length) return null;
    let scale = 1_000_000;
    const kept: Uint8Array[] = [];
    let p = dataAt;
    while (p < end) {
      const cid = readId(head, p);
      if (!cid) return null;
      const csz = readSize(head, p + cid.length);
      if (!csz || csz.unknown) return null;
      const cdata = p + cid.length + csz.length;
      const cend = cdata + csz.value;
      if (cend > end) return null;
      if (cid.value === ID.timecodeScale) scale = readUint(head, cdata, csz.value) || scale;
      if (cid.value === ID.duration) {
        if (readFloat(head, cdata, csz.value) > 0) return null;
      } else kept.push(head.subarray(p, cend));
      p = cend;
    }
    const duration = new Uint8Array(11);
    duration.set([0x44, 0x89, 0x88]);
    new DataView(duration.buffer).setFloat64(3, (ms * 1_000_000) / scale);
    const body = kept.reduce((n, k) => n + k.length, 0) + duration.length;
    const infoId = idBytes(ID.info);
    const out = new Uint8Array(at + infoId.length + 8 + body);
    out.set(head.subarray(0, at), 0);
    let o = at;
    out.set(infoId, o);
    o += infoId.length;
    out.set(size8(body), o);
    o += 8;
    for (const k of kept) {
      out.set(k, o);
      o += k.length;
    }
    out.set(duration, o);
    return { bytes: out, replaced: end };
  }
  return null;
}

/** A recorded WebM blob with its duration written in (the same blob when it cannot be). */
export async function fixWebmDuration(blob: Blob, ms: number): Promise<Blob> {
  try {
    const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 256 * 1024)).arrayBuffer());
    const fixed = withDuration(head, ms);
    if (!fixed) return blob;
    return new Blob([fixed.bytes as BlobPart, blob.slice(fixed.replaced)], { type: blob.type });
  } catch {
    return blob;
  }
}
