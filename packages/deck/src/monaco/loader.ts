import type * as Monaco from "monaco-editor";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE MONACO COMES FROM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Monaco is the heaviest thing a slide can ask for (the editor, its workers, the TypeScript
 * service: several megabytes), so nothing of it is in any eager bundle. A `{monaco…}` block asks
 * for a *loader* — a function that imports Monaco, wires its workers and themes, and resolves to
 * a `MonacoHost` — and there are two places one comes from:
 *
 *   1. the deck's manifest, `manifest.monaco`: the Vite plugin generates `virtual:deck/monaco`
 *      (workers bundled by Vite with `?worker`, only the grammars the deck's editors use) and
 *      puts a lazy import of it there, when some slide has a `{monaco…}` block;
 *   2. `registerMonacoLoader()`: for pages that compile decks in the browser — the prebuilt shell
 *      registers one at start-up (packages/deck-shell/src/monaco.ts), a host app can do the same.
 *
 * With neither, a block stays what it is in print: highlighted code, with a note that the editor
 * is not available here. This module is the only part that is eager, and it holds no Monaco.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MonacoNamespace = typeof Monaco;

export interface MonacoHost {
  monaco: MonacoNamespace;
  /**
   * Make a fence language ready in the editor (its grammar loaded, its tokens coloured the way the
   * static block colours them) and resolve to the Monaco language id to give the model.
   */
  language(lang: string): Promise<string>;
  /** The Monaco theme for a colour scheme: the deck's Shiki theme, with a see-through background. */
  theme(scheme: "light" | "dark"): string;
  /** Editor options every editor gets: the deck's `setup/monaco.ts` may add some. */
  editorOptions: Record<string, unknown>;
  /** `kadal-deck dev`'s save endpoint for `{monaco-write}`; null in a build (the editor is then read-only). */
  writeEndpoint: string | null;
}

export type MonacoLoader = () => Promise<MonacoHost>;

let registered: MonacoLoader | null = null;
const loaded = new WeakMap<MonacoLoader, Promise<MonacoHost>>();

/** Give `{monaco…}` blocks a Monaco on pages whose manifest has none (a deck compiled in the browser). */
export function registerMonacoLoader(loader: MonacoLoader | null): void {
  registered = loader;
}

/** The loader a block should use: the manifest's, else the registered one, else none. */
export function monacoLoaderFor(
  manifest: { monaco?: MonacoLoader | null } | null,
): MonacoLoader | null {
  return manifest?.monaco ?? registered;
}

/** Load once per loader: every editor on the deck shares one Monaco. */
export function loadMonaco(loader: MonacoLoader): Promise<MonacoHost> {
  let p = loaded.get(loader);
  if (!p) {
    p = loader();
    // A failed load (offline, a chunk gone after a redeploy) may be retried by the next editor.
    p.catch(() => loaded.delete(loader));
    loaded.set(loader, p);
  }
  return p;
}
