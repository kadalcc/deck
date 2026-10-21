import { describe, expect, test } from "bun:test";

import { aspectOf, clampCamera, DEFAULT_CAMERA, MAX_SIZE, MIN_SIZE } from "./camera-state.ts";
import { clock, fileName, formatsSupported, mimeFor } from "./recorder.ts";
import { fixWebmDuration, withDuration } from "./webm-duration.ts";

/** A minimal WebM as MediaRecorder writes one: EBML header, a Segment of unknown size, Info, a Cluster. */
function webm({ duration }: { duration?: number } = {}): Uint8Array {
  const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01];
  const segment = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  const scale = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40];
  const app = [0x4d, 0x80, 0x84, 0x43, 0x68, 0x72, 0x6d];
  const dur: number[] = [];
  if (duration !== undefined) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, duration);
    dur.push(0x44, 0x89, 0x88, ...b);
  }
  const infoBody = [...scale, ...app, ...dur];
  const info = [0x15, 0x49, 0xa9, 0x66, 0x80 | infoBody.length, ...infoBody];
  const cluster = [
    0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00,
  ];
  return new Uint8Array([...ebml, ...segment, ...info, ...cluster]);
}

/** Read Duration back out of a fixed file. */
function durationOf(b: Uint8Array): number | null {
  for (let i = 0; i + 11 <= b.length; i++)
    if (b[i] === 0x44 && b[i + 1] === 0x89 && b[i + 2] === 0x88)
      return new DataView(b.buffer, b.byteOffset + i + 3, 8).getFloat64(0);
  return null;
}

describe("webm duration", () => {
  test("Duration is written into Info, in the file's timecode scale; the rest is untouched", () => {
    const file = webm();
    const fixed = withDuration(file, 12_345)!;
    expect(fixed).not.toBeNull();
    const out = new Uint8Array([...fixed.bytes, ...file.subarray(fixed.replaced)]);
    expect(durationOf(out)).toBe(12_345);
    // The cluster after Info is byte-for-byte the same.
    expect([...out.subarray(out.length - 15)]).toEqual([...file.subarray(file.length - 15)]);
    // Info's new size covers its children and the Duration.
    const infoAt = out.indexOf(0x15);
    expect(out[infoAt + 4]).toBe(0x01);
  });

  test("a file that already has a duration, or is not WebM, is left alone", async () => {
    expect(withDuration(webm({ duration: 5000 }), 9000)).toBeNull();
    expect(withDuration(new Uint8Array([1, 2, 3, 4]), 9000)).toBeNull();
    expect(withDuration(webm(), 0)).toBeNull();
    const blob = new Blob([new Uint8Array([0, 1, 2])], { type: "video/webm" });
    expect(await fixWebmDuration(blob, 1000)).toBe(blob);
  });

  test("the blob version keeps the type and the tail", async () => {
    const blob = new Blob([webm() as BlobPart], { type: "video/webm" });
    const fixed = await fixWebmDuration(blob, 2500);
    expect(fixed.type).toBe("video/webm");
    expect(fixed.size).toBe(blob.size + 11 + 7);
    expect(durationOf(new Uint8Array(await fixed.arrayBuffer()))).toBe(2500);
  });
});

describe("recorder", () => {
  test("file names say the deck, the label, what and when", () => {
    const at = new Date(2026, 9, 22, 14, 5);
    expect(fileName({ deck: "showcase", what: "screen", ext: "webm" }, at)).toBe(
      "showcase-screen-2026-10-22-1405.webm",
    );
    expect(fileName({ deck: "My Talk", label: "Take 2!", what: "camera", ext: "mp4" }, at)).toBe(
      "my-talk-take-2-camera-2026-10-22-1405.mp4",
    );
    expect(fileName({ deck: "", what: "screen", ext: "webm" }, at)).toBe(
      "deck-screen-2026-10-22-1405.webm",
    );
  });

  test("formats are what the browser can record", () => {
    const chrome = (t: string) => t.startsWith("video/webm") || t === "video/mp4;codecs=avc1";
    expect(mimeFor("webm", chrome)).toBe("video/webm;codecs=vp9,opus");
    expect(mimeFor("mp4", chrome)).toBe("video/mp4;codecs=avc1");
    expect(formatsSupported(chrome)).toEqual(["webm", "mp4"]);
    expect(formatsSupported((t) => t.startsWith("video/mp4"))).toEqual(["mp4"]);
    expect(mimeFor("mp4", () => false)).toBeNull();
  });

  test("the clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65_400)).toBe("1:05");
    expect(clock(3_725_000)).toBe("1:02:05");
  });
});

describe("camera bubble", () => {
  test("it stays whole on the slide and within its sizes", () => {
    const ratio = 1080 / 1920;
    const far = clampCamera({ ...DEFAULT_CAMERA, x: 2, y: 2, size: 0.2 }, ratio);
    expect(far.x).toBeCloseTo(0.8);
    expect(far.y).toBeCloseTo(1 - (0.2 * aspectOf("circle")) / ratio);
    expect(clampCamera({ ...DEFAULT_CAMERA, size: 5 }, ratio).size).toBe(MAX_SIZE);
    expect(clampCamera({ ...DEFAULT_CAMERA, size: 0 }, ratio).size).toBe(MIN_SIZE);
    expect(clampCamera({ ...DEFAULT_CAMERA, x: Number.NaN, y: -1 }, ratio)).toMatchObject({
      x: 0,
      y: 0,
    });
  });
});
