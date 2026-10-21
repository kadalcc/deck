import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSnippetLine } from "../compiler/snippets.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `virtual:deck/monaco`: the deck's Monaco, generated
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The manifest points `monaco` at this module only when a slide has a `{monaco…}` block, so a
 * deck without one builds without a byte of Monaco. When it is there it is still a lazy chunk:
 * the browser fetches it the first time an editor is on the slide being presented.
 *
 * It imports Monaco's ESM build and the workers its editors need as `?worker` imports — Vite
 * bundles each into a file of the deck's own, so `kadal-deck build` is self-contained and works
 * offline (no CDN). Only the workers the deck's languages use are included (TypeScript's when a
 * block is TS or JS, JSON's, CSS's, HTML's), and only the Shiki grammars and the two themes it
 * needs, by absolute path: the deck may not be able to resolve `monaco-editor` or `shiki` itself
 * (they are the engine's dependencies), and this way it never has to.
 *
 * `setup/monaco.ts` beside the deck, when present, is passed along (monaco/host.ts calls it).
 * In `kadal-deck dev` the module also names the save endpoint for `{monaco-write}`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const require = createRequire(import.meta.url);

/** The folder of an installed package (one whose `exports` hide its package.json). */
function packageDir(name: string): string | null {
  let file: string;
  try {
    file = fileURLToPath(import.meta.resolve(name));
  } catch {
    try {
      file = require.resolve(name);
    } catch {
      return null;
    }
  }
  let dir = dirname(file);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "package.json")) && dir.endsWith(name.split("/").pop()!)) return dir;
    dir = dirname(dir);
  }
  return null;
}

let dirs: { monaco: string | null; shiki: string | null } | null = null;
const packageDirs = () =>
  (dirs ??= { monaco: packageDir("monaco-editor"), shiki: packageDir("shiki") });

/** Whether Monaco is installed (it is a dependency of the engine; a trimmed install may lack it). */
export function monacoInstalled(): boolean {
  return !!packageDirs().monaco;
}

/** The fence languages of every `{monaco…}` block in these slides' (expanded) text. */
export function monacoLangs(contents: string[]): Set<string> {
  const out = new Set<string>();
  for (const c of contents) {
    if (!c.includes("{monaco")) continue;
    for (const m of c.matchAll(
      /^[ \t]*(?:`{3,}|~{3,})([\w+#.-]*)[^\n]*\{monaco(?:-(?:diff|run|write))?\}/gm,
    ))
      out.add((m[1] || "text").toLowerCase());
    // `<<<` imports not yet expanded (the dev server's first look at the deck).
    for (const line of c.split("\n")) {
      if (!/\{monaco(?:-(?:diff|run|write))?\}/.test(line)) continue;
      const imp = parseSnippetLine(line);
      if (imp) out.add(imp.lang.toLowerCase());
    }
  }
  return out;
}

/** The engine's own monaco/host module (dist beside dist/vite/, or the source when run from src/). */
function hostFile(): string {
  const js = fileURLToPath(new URL("../monaco/host.js", import.meta.url));
  return existsSync(js) ? js : fileURLToPath(new URL("../monaco/host.ts", import.meta.url));
}

const WORKER_FOR: Record<string, "typescript" | "json" | "css" | "html"> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",
  js: "typescript",
  javascript: "typescript",
  jsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  mjs: "typescript",
  cjs: "typescript",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
};

const WORKER_FILE = {
  typescript: "esm/vs/language/typescript/ts.worker.js",
  json: "esm/vs/language/json/json.worker.js",
  css: "esm/vs/language/css/css.worker.js",
  html: "esm/vs/language/html/html.worker.js",
} as const;

export interface MonacoModuleOptions {
  langs: Set<string>;
  themes: { light: string; dark: string };
  /** The deck's folder, where `setup/monaco.ts` would be. */
  deckDir: string;
  /** `base + "__kadal/monaco-write"` in dev; null in a build. */
  writeEndpoint: string | null;
  /** Shiki's language list: ids and aliases (from `shiki`'s `bundledLanguagesInfo`). */
  languages: Array<{ id: string; aliases?: string[] }>;
}

/** Find a setup file beside the deck: `setup/<name>.ts` (or .mts/.js/.mjs). */
export function setupFile(deckDir: string, name: string): string | null {
  for (const ext of ["ts", "mts", "js", "mjs", "tsx", "jsx"]) {
    const f = resolve(deckDir, "setup", `${name}.${ext}`);
    if (existsSync(f)) return f;
  }
  return null;
}

export function monacoModule(o: MonacoModuleOptions): string {
  const { monaco, shiki } = packageDirs();
  if (!monaco || !shiki)
    return `export default () => Promise.reject(new Error("monaco-editor is not installed"));`;
  const s = JSON.stringify;
  const workers = new Set<string>();
  for (const l of o.langs) {
    const w = WORKER_FOR[l];
    if (w) workers.add(w);
  }
  const byAlias = new Map<string, string>();
  for (const l of o.languages) {
    byAlias.set(l.id, l.id);
    for (const a of l.aliases ?? []) byAlias.set(a, l.id);
  }
  const grammars = new Map<string, string>();
  for (const l of o.langs) {
    const id = byAlias.get(l);
    const file = id && join(shiki, "dist", "langs", `${id}.mjs`);
    if (id && file && existsSync(file)) grammars.set(id, file);
  }
  const aliases: Record<string, string> = {};
  for (const l of o.langs) {
    const id = byAlias.get(l);
    if (id && grammars.has(id)) aliases[l] = id;
  }
  const theme = (name: string) => {
    const file = join(shiki, "dist", "themes", `${name}.mjs`);
    return `{ name: ${s(name)}, load: () => ${existsSync(file) ? `import(${s(file)})` : `Promise.reject(new Error(${s(`no Shiki theme ${name}`)}))`} }`;
  };
  const setup = setupFile(o.deckDir, "monaco");
  const lines = [
    `import * as monaco from ${s(join(monaco, "esm/vs/editor/editor.main.js"))};`,
    `import EditorWorker from ${s(`${join(monaco, "esm/vs/editor/editor.worker.js")}?worker`)};`,
    ...[...workers].map(
      (w) =>
        `import Worker_${w} from ${s(`${join(monaco, WORKER_FILE[w as keyof typeof WORKER_FILE])}?worker`)};`,
    ),
    `import { createMonacoHost } from ${s(hostFile())};`,
    `const grammars = {`,
    ...[...grammars].map(([id, file]) => `  ${s(id)}: () => import(${s(file)}),`),
    `};`,
    `const aliases = ${s(aliases)};`,
    `export default function loadMonaco() {`,
    `  return createMonacoHost({`,
    `    monaco,`,
    `    workers: {`,
    `      editor: () => new EditorWorker({ name: "monaco-editor" }),`,
    ...[...workers].map((w) => `      ${w}: () => new Worker_${w}({ name: "monaco-${w}" }),`),
    `    },`,
    `    grammar: (lang) => { const id = aliases[lang] ?? lang; return grammars[id] ? { id, load: grammars[id] } : null; },`,
    `    themes: { light: ${theme(o.themes.light)}, dark: ${theme(o.themes.dark)} },`,
    `    setup: ${setup ? `() => import(${s(setup)})` : "null"},`,
    `    writeEndpoint: ${s(o.writeEndpoint)},`,
    `  });`,
    `}`,
  ];
  return `${lines.join("\n")}\n`;
}
