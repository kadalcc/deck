/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SOURCE MANIFEST: which files are a deck's editable source, and their hash
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A published version may carry the deck's EDITABLE files beside its build — the text a person
 * changes, never the code: no `src/`, no config, no `package.json`, no `public/`. The web builder
 * edits them, and the CLI pulls the edits back. The globs below are the contract between the
 * CLI (what it uploads) and a host (what it accepts); both import them from here.
 *
 * `sourceHash` names a whole source tree in one string: SHA-256 (hex) of the JSON array of
 * `[path, sha256]` pairs sorted by path (UTF-16 code-unit order, as `Array#sort` does), e.g.
 * `[["deck.mdx","ab12…"],["pages/a.mdx","cd34…"]]`. Equal hashes mean nothing editable changed.
 * Web Crypto only (browsers, Workers, Node ≥ 20 have it as `globalThis.crypto`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The deck files a host stores as source and the builder may edit, deck-relative. */
export const EDITABLE_GLOBS = [
  "deck.mdx",
  "pages/**/*.{mdx,md}",
  "slides/**/*.{mdx,md}",
  "*.{yaml,yml}",
  "data/**/*.{yaml,yml,csv,json}",
  "drawings/**/*.{svg,excalidraw}",
  "notes/**/*.{md,mdx}",
] as const;

/** At most this much source text per version, and this many files (the host enforces both). */
export const SOURCE_LIMITS = { bytes: 2 * 1024 * 1024, files: 500 } as const;

/** A glob (`*`, `**`, `?`, `{a,b}`) as a RegExp over a POSIX path. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more folders; a trailing `**` anything.
        if (glob[i + 2] === "/") {
          re += "(?:[^/]+/)*";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const close = glob.indexOf("}", i);
      if (close < 0) re += "\\{";
      else {
        re += `(?:${glob
          .slice(i + 1, close)
          .split(",")
          .map((p) => p.replace(/[.+^$()|[\]\\]/g, "\\$&"))
          .join("|")})`;
        i = close;
      }
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const EDITABLE = EDITABLE_GLOBS.map(globToRegExp);

/** A path a host stores as source: relative, POSIX, no `..`, no dot-folders, in the globs. */
export function isEditablePath(path: string): boolean {
  if (typeof path !== "string" || !path || path.length > 300) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  const parts = path.split("/");
  if (parts.some((p) => !p || p === "." || p === ".." || p.startsWith("."))) return false;
  return EDITABLE.some((re) => re.test(path));
}

/**
 * A `.kadaldeckignore` (gitignore syntax: `#` comments, `!` to re-include, a leading `/`
 * anchors to the deck folder, a trailing `/` means a folder) as a predicate over paths.
 */
export function ignoreMatcher(text: string | null | undefined): (path: string) => boolean {
  const rules = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const negate = l.startsWith("!");
      let p = negate ? l.slice(1) : l;
      const dir = p.endsWith("/");
      if (dir) p = p.slice(0, -1);
      const anchored = p.startsWith("/") || p.slice(0, -1).includes("/");
      p = p.replace(/^\//, "");
      const body = globToRegExp(p).source.slice(1, -1);
      const re = new RegExp(`^${anchored ? "" : "(?:.*/)?"}${body}${dir ? "/.*" : "(?:/.*)?"}$`);
      return { negate, re };
    });
  return (path) => {
    let ignored = false;
    for (const r of rules) if (r.re.test(path)) ignored = !r.negate;
    return ignored;
  };
}

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** SHA-256 of text (UTF-8) or bytes, as lowercase hex. */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer));
}

/** The canonical form `sourceHash` hashes (exported so a host can check it agrees). */
export function canonicalManifest(manifest: Record<string, { sha256: string }>): string {
  return JSON.stringify(
    Object.keys(manifest)
      .sort()
      .map((p) => [p, manifest[p]!.sha256]),
  );
}

/** One hash for a whole source manifest: equal hashes, same editable files. */
export async function sourceHash(manifest: Record<string, { sha256: string }>): Promise<string> {
  return sha256Hex(canonicalManifest(manifest));
}

/** `{path: {sha256, size}}` for some files' text (size in UTF-8 bytes). */
export async function sourceManifest(
  files: Record<string, string>,
): Promise<Record<string, { sha256: string; size: number }>> {
  const out: Record<string, { sha256: string; size: number }> = {};
  const enc = new TextEncoder();
  for (const path of Object.keys(files).sort()) {
    const bytes = enc.encode(files[path]!);
    out[path] = { sha256: await sha256Hex(bytes), size: bytes.byteLength };
  }
  return out;
}
