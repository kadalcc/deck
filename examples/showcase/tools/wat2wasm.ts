/**
 * Assemble the deck's hand-written WebAssembly.
 *
 *     bun tools/wat2wasm.ts
 *
 * `wabt` is a dev dependency and pure JavaScript, so this needs no system toolchain — which is the
 * point: the WASM island's demo must be buildable by anyone who can run the deck. The `.wasm` is
 * committed beside the `.wat` so a plain `bun run build` never needs this script.
 */
import wabtInit from "wabt";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = join(import.meta.dirname, "..", "src");
const wabt = await wabtInit();
const source = readFileSync(join(here, "wasm-ticker.wat"), "utf8");

const module = wabt.parseWat("wasm-ticker.wat", source, { multi_memory: false });
const { buffer } = module.toBinary({ log: false, write_debug_names: false });
module.destroy();

writeFileSync(join(here, "wasm-ticker.wasm"), buffer);
console.log(`wasm-ticker.wasm — ${buffer.length} bytes`);
