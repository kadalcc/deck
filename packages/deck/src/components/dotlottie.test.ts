import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";

import { LottieFileError, isZip, lottieInfo, readLottie, zipEntries } from "./dotlottie.ts";

/** A zip of `files`, each stored or deflated: the two methods a .lottie uses. */
function zip(files: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, f.deflate ? 8 : 0, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, body);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, f.deflate ? 8 : 0, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const anim = (extra: Record<string, unknown> = {}) => ({
  v: "5.7.0",
  w: 512,
  h: 256,
  fr: 30,
  ip: 0,
  op: 90,
  layers: [],
  ...extra,
});

describe("Lottie files", () => {
  test("a JSON animation is read as it is", async () => {
    const data = await readLottie(json(anim()));
    expect(lottieInfo(data)).toEqual({ width: 512, height: 256, seconds: 3 });
  });

  test("JSON that isn't Lottie, and bytes that aren't JSON, say so", async () => {
    expect(readLottie(json({ hello: 1 }))).rejects.toThrow(LottieFileError);
    expect(readLottie(new TextEncoder().encode("<svg/>"))).rejects.toThrow(/neither/);
  });

  test("a v1 .lottie (animations/, images/), deflated: its first animation, images embedded", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const bytes = zip([
      { name: "manifest.json", data: json({ animations: [{ id: "wave" }] }), deflate: true },
      {
        name: "animations/wave.json",
        data: json(anim({ assets: [{ id: "img_0", u: "/images/", p: "img_0.png", e: 0 }] })),
        deflate: true,
      },
      { name: "images/img_0.png", data: png },
    ]);
    expect(isZip(bytes)).toBe(true);
    expect([...zipEntries(bytes).keys()]).toEqual([
      "manifest.json",
      "animations/wave.json",
      "images/img_0.png",
    ]);
    const data = await readLottie(bytes);
    expect(data.w).toBe(512);
    const asset = data.assets![0]!;
    expect(asset.e).toBe(1);
    expect(asset.u).toBe("");
    expect(asset.p).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  });

  test("a v2 .lottie (a/, i/) with two animations: the first, or the one asked for", async () => {
    const bytes = zip([
      { name: "manifest.json", data: json({ animations: [{ id: "one" }, { id: "two" }] }) },
      { name: "a/one.json", data: json(anim({ w: 100 })) },
      { name: "a/two.json", data: json(anim({ w: 200 })), deflate: true },
    ]);
    expect((await readLottie(bytes)).w).toBe(100);
    expect((await readLottie(bytes, "two")).w).toBe(200);
    expect((await readLottie(bytes, "nope")).w).toBe(100);
  });

  test("a zip with no animation in it is refused", async () => {
    const bytes = zip([{ name: "readme.txt", data: new TextEncoder().encode("hi") }]);
    expect(readLottie(bytes)).rejects.toThrow(/no animation/);
  });
});
