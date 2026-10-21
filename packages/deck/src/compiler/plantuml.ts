/**
 * PlantUML's text encoding, for diagram URLs: UTF-8 → raw DEFLATE → PlantUML's own base64
 * (`0-9A-Za-z-_`, three bytes to four characters). Any PlantUML server decodes it:
 * `<server>/svg/<encoded>` answers with the diagram as SVG.
 *
 * DEFLATE comes from the platform's `CompressionStream("deflate-raw")` — in every current
 * browser, in Node and in Bun — so the hosted builder and `kadal-deck build` make the same URL
 * with no dependency. Where it is missing the text goes in "stored" DEFLATE blocks: still valid
 * DEFLATE every server decodes, only longer.
 */

export const DEFAULT_PLANTUML_SERVER = "https://www.plantuml.com/plantuml";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** PlantUML's base64: like RFC 4648 but its own alphabet, and no padding. */
export function plantUmlBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]!;
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    out += ALPHABET[b1 >> 2]!;
    out += ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)]!;
    out += ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)]!;
    out += ALPHABET[b3 & 0x3f]!;
  }
  return out;
}

/** DEFLATE without compression: blocks of up to 65 535 bytes, each with its length. */
export function storedDeflate(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 0xffff));
  const out = new Uint8Array(data.length + blocks * 5);
  let o = 0;
  for (let b = 0; b < blocks; b++) {
    const chunk = data.subarray(b * 0xffff, Math.min(data.length, (b + 1) * 0xffff));
    const len = chunk.length;
    out[o++] = b === blocks - 1 ? 1 : 0; // BFINAL on the last block, BTYPE 00 (stored)
    out[o++] = len & 0xff;
    out[o++] = len >> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >> 8) & 0xff;
    out.set(chunk, o);
    o += len;
  }
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) return storedDeflate(data);
  try {
    const stream = new CS("deflate-raw" as CompressionFormat);
    const writer = stream.writable.getWriter();
    void writer.write(data as Uint8Array<ArrayBuffer>);
    void writer.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  } catch {
    return storedDeflate(data);
  }
}

/** The encoded form of a diagram's source, as `<server>/svg/<this>` wants it. */
export async function encodePlantUml(source: string): Promise<string> {
  return plantUmlBase64(await deflateRaw(new TextEncoder().encode(source.trim())));
}

/** The diagram's image URL. `format` is what the server renders: svg (default) or png. */
export async function plantUmlUrl(
  source: string,
  server: string = DEFAULT_PLANTUML_SERVER,
  format: "svg" | "png" = "svg",
): Promise<string> {
  return `${server.replace(/\/+$/, "")}/${format}/${await encodePlantUml(source)}`;
}
