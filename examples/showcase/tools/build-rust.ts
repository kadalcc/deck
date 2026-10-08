/**
 * Build the Leptos island to WebAssembly.
 *
 *     bun run rust
 *
 * Needs a Rust toolchain with the wasm target:
 *
 *     rustup target add wasm32-unknown-unknown
 *
 * It does NOT need `cargo install wasm-bindgen-cli`, which compiles for ten minutes. The version
 * of the CLI must match the `wasm-bindgen` crate Cargo resolved — mismatch it and the generated
 * shim fails with a schema error — so this reads the version out of `Cargo.lock` and fetches the
 * project's own prebuilt binary for it, cached under `target/tools/`.
 *
 * Not part of `bun run build`: the generated shim and `.wasm` are committed under
 * `src/rust-ticker/`, so a deck builds with no Rust toolchain at all.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const showcase = join(import.meta.dirname, "..");
const crate = join(showcase, "rust-ticker");
const out = join(showcase, "src", "rust-ticker");
const tools = join(crate, "target", "tools");

/** rustup installs here and does not put it on PATH unless asked; look before giving up. */
const cargoBin = join(process.env.HOME ?? "", ".cargo", "bin");
const onPath = (name: string) => (existsSync(join(cargoBin, name)) ? join(cargoBin, name) : name);

const run = (cmd: string, args: string[], cwd: string, hint?: string) => {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    if (hint) console.error(`\n${hint}`);
    process.exit(result.status ?? 1);
  }
};

run(
  onPath("cargo"),
  ["build", "--release", "--target", "wasm32-unknown-unknown"],
  crate,
  "If the target is missing:  rustup target add wasm32-unknown-unknown",
);

/* ── the shim generator, at exactly the crate's version ───────────────────── */

const lock = readFileSync(join(crate, "Cargo.lock"), "utf8");
const version = /\[\[package\]\]\nname = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1];
if (!version) throw new Error("wasm-bindgen is not in Cargo.lock");

const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
const platform = process.platform === "darwin" ? "apple-darwin" : "unknown-linux-musl";
const slug = `wasm-bindgen-${version}-${arch}-${platform}`;
const binary = join(tools, slug, "wasm-bindgen");

if (!existsSync(binary)) {
  const url = `https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${version}/${slug}.tar.gz`;
  console.log(`fetching wasm-bindgen ${version}…`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `${res.status} for ${url}\nFalling back is: cargo install wasm-bindgen-cli --version ${version}`,
    );
  }
  mkdirSync(tools, { recursive: true });
  const tarball = join(tools, `${slug}.tar.gz`);
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  run("tar", ["xzf", tarball], tools);
}

run(
  binary,
  [
    "--target",
    "web",
    "--out-dir",
    out,
    "--out-name",
    "rust-ticker",
    join(crate, "target/wasm32-unknown-unknown/release/deck_rust_ticker.wasm"),
  ],
  crate,
);

const bytes = readFileSync(join(out, "rust-ticker_bg.wasm")).length;
console.log(`\nbuilt → ${out}  (${(bytes / 1024).toFixed(1)} kB of wasm)`);
