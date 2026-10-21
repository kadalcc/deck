import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crc32, zip } from "./zip.ts";

/** Read a stored zip back by its central directory, as any unzip would. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const localNameLen = v.getUint16(local + 26, true);
    const data = bytes.subarray(local + 30 + localNameLen, local + 30 + localNameLen + size);
    expect(crc32(data)).toBe(v.getUint32(at + 16, true));
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}

describe("zip", () => {
  test("crc32 of a known string", () => {
    expect(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog"))).toBe(
      0x414fa339,
    );
  });

  test("files come back as they went in, names in UTF-8", () => {
    const enc = new TextEncoder();
    const bytes = zip([
      { name: "deck.md", data: enc.encode("# Hello\n") },
      { name: "png/001.png", data: new Uint8Array([1, 2, 3]) },
      { name: "ünï.txt", data: enc.encode("x") },
    ]);
    const files = unzip(bytes);
    expect(Object.keys(files)).toEqual(["deck.md", "png/001.png", "ünï.txt"]);
    expect(files["deck.md"]).toBe("# Hello\n");
  });

  test("an unzip tool accepts it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kx-zip-"));
    try {
      const file = join(dir, "a.zip");
      writeFileSync(file, zip([{ name: "a/b.txt", data: new TextEncoder().encode("hi") }]));
      const proc = Bun.spawnSync(["unzip", "-p", file, "a/b.txt"]);
      if (proc.exitCode === null) return; // no unzip on this machine
      expect(new TextDecoder().decode(proc.stdout)).toBe("hi");
      expect(readFileSync(file).length).toBeGreaterThan(22);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
