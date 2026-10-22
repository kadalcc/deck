import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import type { MonacoHost, MonacoNamespace } from "./loader.ts";
import { type TypeFile, createTypeAcquirer } from "./types.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MONACO HOST: one configured Monaco for the whole deck
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Called with a Monaco namespace and its worker constructors by whoever bundled them — the Vite
 * plugin's `virtual:deck/monaco`, or the prebuilt shell's own module — this does the rest once:
 *
 *   - workers: `MonacoEnvironment.getWorker` hands each language service the worker built for
 *     it (TypeScript/JavaScript, JSON, CSS, HTML) and everything else the plain editor worker;
 *   - colours: the deck's own Shiki grammars and themes drive the editor (@shikijs/monaco), so an
 *     editor and the static block it replaces are coloured token for token alike. The theme's
 *     background is made transparent, so the code block's own surface (theme tokens) shows
 *     through and the editor sits in the slide like any other code. A theme picked from the
 *     menu brings its own Shiki pair (compiler/code-themes.ts): `themeNamed` loads it on demand;
 *   - TypeScript: every model is its own module (`moduleDetection: force`), so two editors on a
 *     deck that both say `const x` do not collide, and "cannot find module" is not reported for
 *     imports the browser cannot see; the packages an editor imports get their declarations
 *     (monaco/types.ts: from the deck's build, or a CDN), so their hovers and errors are real;
 *   - the deck's `setup/monaco.ts`, when it has one: called with the namespace, may return
 *     `{ editorOptions }` for every editor.
 *
 * Grammars load as editors ask for them; a new language re-registers the tokenisers (cheap).
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Loader = () => Promise<unknown>;

export interface MonacoHostInput {
  monaco: MonacoNamespace;
  /** Worker constructors by language label; `editor` is the default for everything else. */
  workers: Partial<Record<"editor" | "typescript" | "json" | "css" | "html", () => Worker>>;
  /** A Shiki grammar's loader by language id or alias (`ts` → typescript), or null. */
  grammar: (lang: string) => { id: string; load: Loader } | null;
  themes: { light: { name: string; load: Loader }; dark: { name: string; load: Loader } };
  /** Any other Shiki theme by name, for the theme menu's themes; null when it is not to be had. */
  theme?: ((name: string) => { name: string; load: Loader } | null) | null;
  /** The deck's bundled declarations by package (`local` types, vite/monaco-types.ts). */
  localTypes?: ((pkg: string) => (() => Promise<TypeFile[]>) | null) | null;
  /** The deck's `setup/monaco.ts`. */
  setup?: (() => Promise<unknown>) | null;
  writeEndpoint?: string | null;
}

const LABEL_OF: Record<string, keyof MonacoHostInput["workers"]> = {
  typescript: "typescript",
  javascript: "typescript",
  json: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  handlebars: "html",
  razor: "html",
};

/** Shiki's export shape (`export default [grammar, …]`) to the plain value. */
const unwrap = (m: unknown): unknown =>
  m && typeof m === "object" && "default" in m ? (m as { default: unknown }).default : m;

export async function createMonacoHost(input: MonacoHostInput): Promise<MonacoHost> {
  const { monaco } = input;
  const g = globalThis as unknown as {
    MonacoEnvironment?: { getWorker(id: string, label: string): Worker };
  };
  g.MonacoEnvironment = {
    getWorker(_id, label) {
      const kind = LABEL_OF[label] ?? "editor";
      const make = input.workers[kind] ?? input.workers.editor;
      if (!make) throw new Error(`[deck] monaco: no worker for ${label}`);
      return make();
    },
  };

  // TypeScript: modules, not scripts; the module and target the browser runs.
  type Defaults = {
    setCompilerOptions(o: object): void;
    setDiagnosticsOptions(o: object): void;
    setEagerModelSync?(on: boolean): void;
    addExtraLib?(content: string, filePath?: string): unknown;
  };
  const libs: Defaults[] = [];
  const ts =
    (monaco as unknown as { typescript?: Record<string, unknown> }).typescript ??
    (monaco.languages as unknown as { typescript?: Record<string, unknown> }).typescript;
  if (ts) {
    const compilerOptions = {
      target: 99, // ESNext
      module: 99, // ESNext
      moduleResolution: 100, // Bundler
      moduleDetection: 3, // force: every model is a module
      allowNonTsExtensions: true,
      allowJs: true,
      strict: true,
      jsx: 4, // react-jsx
    };
    const diagnostics = {
      noSemanticValidation: false,
      noSyntaxValidation: false,
      // 2307/2792: cannot find module — the editor cannot see the deck's node_modules.
      diagnosticCodesToIgnore: [2307, 2792, 1375, 1378],
    };
    for (const key of ["typescriptDefaults", "javascriptDefaults"]) {
      const defaults = ts[key] as Defaults | undefined;
      defaults?.setCompilerOptions(compilerOptions);
      defaults?.setDiagnosticsOptions(diagnostics);
      defaults?.setEagerModelSync?.(true);
      if (defaults) libs.push(defaults);
    }
  }
  // Declarations for what the editors import: registered once, where module resolution looks.
  const types = createTypeAcquirer({
    add: (f) => {
      for (const d of libs) d.addExtraLib?.(f.text, `file://${f.path}`);
    },
    local: input.localTypes ?? null,
  });

  // Colours: the deck's Shiki themes, with the editor background taken out.
  const [light, dark] = await Promise.all([
    input.themes.light.load().then(unwrap),
    input.themes.dark.load().then(unwrap),
  ]);
  const clear = (t: unknown, name: string) => {
    const theme = t as { name?: string; colors?: Record<string, string> };
    return {
      ...theme,
      name,
      colors: {
        ...theme.colors,
        "editor.background": "#00000000",
        "editorGutter.background": "#00000000",
        "minimap.background": "#00000000",
        "editorStickyScroll.background": "#00000000",
        // Diffs in the deck's own add/remove colours (themes/code.css), softer than Monaco's.
        "diffEditor.insertedLineBackground": "#10b9811f",
        "diffEditor.insertedTextBackground": "#10b98138",
        "diffEditor.removedLineBackground": "#f43f5e1a",
        "diffEditor.removedTextBackground": "#f43f5e38",
        "diffEditorGutter.insertedLineBackground": "#10b98126",
        "diffEditorGutter.removedLineBackground": "#f43f5e22",
      },
    };
  };
  const loadedThemes = new Map<string, Promise<string>>([
    [input.themes.light.name, Promise.resolve(input.themes.light.name)],
    [input.themes.dark.name, Promise.resolve(input.themes.dark.name)],
  ]);
  const highlighter: HighlighterCore = await createHighlighterCore({
    themes: [
      clear(light, input.themes.light.name) as never,
      clear(dark, input.themes.dark.name) as never,
    ],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });

  let setupOptions: Record<string, unknown> = {};
  if (input.setup) {
    try {
      const mod = unwrap(await input.setup());
      const result =
        typeof mod === "function" ? await (mod as (m: MonacoNamespace) => unknown)(monaco) : null;
      const opts =
        result && typeof result === "object"
          ? (result as { editorOptions?: unknown }).editorOptions
          : null;
      if (opts && typeof opts === "object") setupOptions = opts as Record<string, unknown>;
    } catch (err) {
      console.error("[deck] setup/monaco failed:", err);
    }
  }

  const ready = new Map<string, Promise<string>>();
  let chain: Promise<unknown> = Promise.resolve();
  const register = () => shikiToMonaco(highlighter as never, monaco as never);
  register();

  const language = (lang: string): Promise<string> => {
    const key = lang.toLowerCase();
    let p = ready.get(key);
    if (p) return p;
    const found = input.grammar(key);
    if (!found) {
      p = Promise.resolve(knownToMonaco(monaco, key) ?? "plaintext");
      ready.set(key, p);
      return p;
    }
    // One at a time: each registration re-wraps the tokenisers for every loaded grammar.
    p = (chain = chain.then(async () => {
      if (!highlighter.getLoadedLanguages().includes(found.id)) {
        const grammars = unwrap(await found.load());
        await highlighter.loadLanguage(
          ...((Array.isArray(grammars) ? grammars : [grammars]) as never[]),
        );
      }
      if (!monaco.languages.getLanguages().some((l) => l.id === found.id))
        monaco.languages.register({ id: found.id });
      register();
      return found.id;
    })) as Promise<string>;
    p.catch(() => ready.delete(key));
    ready.set(key, p);
    return p;
  };

  /** A Shiki theme by name, loaded into the editor's highlighter the first time it is asked for. */
  const themeNamed = (name: string): Promise<string> => {
    let p = loadedThemes.get(name);
    if (p) return p;
    const found = input.theme?.(name);
    if (!found) return Promise.reject(new Error(`no Shiki theme ${name}`));
    p = (chain = chain.then(async () => {
      await highlighter.loadTheme(clear(unwrap(await found.load()), name) as never);
      register();
      return name;
    })) as Promise<string>;
    p.catch(() => loadedThemes.delete(name));
    loadedThemes.set(name, p);
    return p;
  };

  return {
    monaco,
    language,
    theme: (scheme) => (scheme === "dark" ? input.themes.dark.name : input.themes.light.name),
    themeNamed,
    acquireTypes: (code, options) => types.acquire(code, options),
    editorOptions: setupOptions,
    writeEndpoint: input.writeEndpoint ?? null,
  };
}

/** A language Monaco knows by itself, when Shiki has no grammar for it. */
function knownToMonaco(monaco: MonacoNamespace, lang: string): string | null {
  const l = monaco.languages.getLanguages().find((x) => x.id === lang || x.aliases?.includes(lang));
  return l?.id ?? null;
}
