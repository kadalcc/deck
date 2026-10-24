/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RUNTIME COMPILER'S GRAMMARS: named one by one, not Shiki's whole bundle
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The runtime compiler highlights with the languages it is given (DEFAULT_LANGS unless the page
 * says otherwise); any other fence is plain text. It used to get them from `import("shiki")`,
 * whose language map is an `import()` for each of Shiki's ~230 grammars — so every bundle that
 * holds the compiler (the prebuilt shell, each deck's editing kit) carried all of them, about
 * 8 MB in 290 files no code path ever loaded. Here each default grammar is its own `import()`,
 * and a page that needs more passes them in (`compileDeck({ grammars })`): a deck's kit adds the
 * languages its `deck({ shiki: { langs } })` lists (vite/kit.ts), so its preview highlights what
 * its build did.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Loads a Shiki grammar module (its default export is the grammar and the ones it embeds). */
export type GrammarLoader = () => Promise<unknown>;

/** DEFAULT_LANGS' grammars, by Shiki id. `text` needs none. */
export const RUNTIME_GRAMMARS: Record<string, GrammarLoader> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
};

/** The fence names of the defaults that are not their grammar's id (each grammar lists its own). */
const ALIASES: Record<string, string> = {
  ts: "typescript",
  cts: "typescript",
  mts: "typescript",
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  sh: "shellscript",
  bash: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  py: "python",
  rs: "rust",
  md: "markdown",
  yml: "yaml",
  "c++": "cpp",
  kt: "kotlin",
  kts: "kotlin",
};

/** The grammar loaders for `langs`: from `more` (by id or name) first, then the defaults. */
export function grammarsFor(
  langs: readonly string[],
  more: Record<string, GrammarLoader> = {},
): GrammarLoader[] {
  const out = new Map<string, GrammarLoader>();
  for (const lang of langs) {
    const key = lang.toLowerCase();
    const id = ALIASES[key] ?? key;
    const load = more[key] ?? more[id] ?? RUNTIME_GRAMMARS[id];
    if (load && !out.has(id)) out.set(id, load);
  }
  return [...out.values()];
}

/** Whether the runtime compiler highlights `lang` on its own (plain text needs no grammar). */
export function runtimeHasGrammar(lang: string): boolean {
  const key = lang.toLowerCase();
  return PLAIN.has(key) || (ALIASES[key] ?? key) in RUNTIME_GRAMMARS;
}

const PLAIN = new Set(["text", "txt", "plain", "plaintext"]);
