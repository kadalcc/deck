import { compile } from "@mdx-js/mdx";
import { renderToString as renderKatex } from "katex";
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Highlighter, createHighlighter } from "shiki";
import type { Plugin, ViteDevServer } from "vite";

import { levelOf, titleOf } from "../compiler/index.ts";
import { DEFAULT_LANGS } from "../compiler/langs.ts";
import {
  deckGlossary,
  magicMoveData,
  mdxPlugins,
  prepareDeck,
  slideTerms,
} from "../compiler/pipeline.ts";
import { plainText } from "../compiler/plain-text.ts";
import { DEFAULT_GLOSSARY } from "../glossary/model.ts";
import { createRelay, type RelayPeer } from "../remote/relay.ts";
import { drawingsDev, drawingsDir, drawingsExport, drawingsModule } from "./drawings-dev.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VITE PLUGIN: deck.mdx → modules
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `import deck from "virtual:deck"` gives a deck its slides. The plugin reads `deck.mdx`, cuts it
 * into slides (`compiler/split.ts`), lifts the magic-move blocks, and compiles each slide's MDX
 * and each slide's notes to their own module — so a change to one slide re-evaluates one module,
 * code is highlighted once at build time, and the browser never loads a Markdown parser.
 *
 * Module ids:
 *   virtual:deck             the manifest: config, slides (with lazy components), the glossary
 *   virtual:deck/slide/N     slide N's compiled MDX (default export: the component)
 *   virtual:deck/notes/N     slide N's notes, compiled MDX (default export)
 *   virtual:deck/magic/N     slide N's precomputed magic-move steps
 *   virtual:deck/kokoro      the narrator's Kokoro worker — only when the deck has `kokoro-js`
 *   virtual:deck/drawings    the saved drawings, `drawings/*.svg` — in a build (vite/drawings-dev.ts)
 *                            installed; otherwise the manifest says `kokoro: null` and nothing of
 *                            it is built (it is an optional peer: ~400 MB of ONNX runtime)
 *
 * A `glossary.yaml` beside the deck file (or the headmatter's `glossary:` path) is read here too:
 * every slide's key terms are linked to it as the slide compiles (`compiler/rehype-glossary.ts`),
 * and its entries ride in the manifest for the cards the runtime shows.
 *
 * It also self-hosts Excalidraw's fonts for `<Sketch>`: `<base>excalidraw/fonts/…` is served
 * from the package in dev and copied into `dist/excalidraw/fonts` on build (all families but the
 * 12 MB CJK one), so a sketch never reaches for a CDN.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `node_modules/@excalidraw/excalidraw/dist/prod`, or null when the package is not installed. */
function excalidrawDist(): string | null {
  try {
    return dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw"));
  } catch {
    return null;
  }
}

const SKIP_FONTS = new Set(["Xiaolai"]);

/**
 * The Kokoro worker's file in this package (dist/narrate/kokoro.worker.js beside dist/vite/, or
 * the source when the plugin itself runs from src/).
 */
function kokoroWorkerFile(): string {
  const js = fileURLToPath(new URL("../narrate/kokoro.worker.js", import.meta.url));
  return existsSync(js) ? js : fileURLToPath(new URL("../narrate/kokoro.worker.ts", import.meta.url));
}

export interface DeckPluginOptions {
  /** The deck file, relative to the Vite root. Default `deck.mdx`. */
  entry?: string;
  /** Shiki themes. Defaults suit the neutral theme; the deck's theme CSS can override the colours. */
  shiki?: { light?: string; dark?: string; langs?: string[] };
}

/** Build-time KaTeX for the maths in a definition; the browser gets finished HTML. */
const renderMath = (tex: string) => renderKatex(tex, { throwOnError: false });

/**
 * The phone remote's line to the dev server (src/remote/relay.ts), in the one module of the deck
 * Vite always serves itself — so `import.meta.hot` is there however @kadal/deck was installed.
 */
const DEV_RELAY = `const hot = import.meta.hot;
export const relay = hot
  ? {
      send: (m) => hot.send("kadal:remote", m),
      on: (fn) => {
        hot.on("kadal:remote", fn);
        return () => hot.off("kadal:remote", fn);
      },
      onStatus: (fn) => {
        const up = () => fn(true);
        const down = () => fn(false);
        hot.on("vite:ws:connect", up);
        hot.on("vite:ws:disconnect", down);
        return () => {
          hot.off("vite:ws:connect", up);
          hot.off("vite:ws:disconnect", down);
        };
      },
    }
  : null;`;

const VIRTUAL = "virtual:deck";
const RESOLVED = "\0virtual:deck";

export function deck(options: DeckPluginOptions = {}): Plugin {
  const entry = options.entry ?? "deck.mdx";
  const themes = {
    light: options.shiki?.light ?? "github-light",
    dark: options.shiki?.dark ?? "github-dark",
  };
  let root = process.cwd();
  let entryPath = "";
  let base = "/";
  let outDir = "dist";
  let building = false;
  let highlighter: Highlighter | null = null;
  let server: ViteDevServer | null = null;
  let manifest: ReturnType<typeof build> | null = null;
  const included = new Set<string>();
  /** The glossary file the last build read (or looked for), watched like an included file. */
  let glossaryFile: string | null = null;
  /** Whether `kokoro-js` resolves from this package (decided once, at the first manifest). */
  let kokoro: Promise<boolean> | null = null;

  const getHighlighter = async () => {
    highlighter ??= await createHighlighter({
      themes: [themes.light, themes.dark],
      langs: options.shiki?.langs ?? DEFAULT_LANGS,
    });
    return highlighter;
  };

  function build() {
    included.clear();
    const text = readFileSync(entryPath, "utf8");
    const { headmatter, slides } = prepareDeck(text, {
      file: entryPath,
      resolveInclude: (path, from) => {
        const file = resolve(dirname(from), path);
        if (!existsSync(file)) return null;
        included.add(file);
        return { file, text: readFileSync(file, "utf8") };
      },
    });
    return { headmatter, slides, glossary: readGlossary(headmatter) };
  }

  function readGlossary(headmatter: Record<string, unknown>) {
    const g = deckGlossary(
      headmatter,
      (src) => {
        const file = resolve(dirname(entryPath), src);
        glossaryFile = file;
        return existsSync(file) ? { file, text: readFileSync(file, "utf8") } : null;
      },
      { math: renderMath, warn: (m) => console.warn(`[deck] ${m}`) },
    );
    if (!g.options.src) glossaryFile = null;
    if (g.file) server?.watcher.add(g.file);
    return g;
  }

  const ensure = () => {
    manifest ??= build();
    return manifest;
  };

  const invalidate = () => {
    manifest = null;
    if (!server) return;
    const mods = [...server.moduleGraph.idToModuleMap.keys()].filter((id) =>
      id.startsWith(RESOLVED),
    );
    for (const id of mods) {
      const mod = server.moduleGraph.getModuleById(id);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
    server.ws.send({ type: "full-reload" });
  };

  /** `terms` is the slide's own frontmatter switch; null compiles without the glossary (notes). */
  async function compileMdx(source: string, file: string, terms: unknown = null) {
    const out = await compile(source, {
      jsx: false,
      jsxImportSource: "react",
      development: false,
      ...mdxPlugins({
        highlighter: await getHighlighter(),
        themes,
        glossary: ensure().glossary,
        terms,
        math: renderMath,
        warn: (message) => console.warn(`[deck] ${file}: ${message}`),
      }),
      providerImportSource: "@kadal/deck/mdx-provider",
      format: "mdx",
    });
    return `// ${file}\n${String(out)}`;
  }

  return {
    name: "stack:deck",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      entryPath = resolve(root, entry);
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      outDir = resolve(root, config.build.outDir);
      building = config.command === "build";
    },
    async config(user, env) {
      const out: { worker?: { format: "es" }; server?: { https: object } } = {};
      // The Kokoro worker splits into chunks (transformers.js loads its runtime lazily), which
      // only an ES-module worker can do. A deck that set its own worker format keeps it.
      if (!user.worker?.format) out.worker = { format: "es" };
      // `kadal-deck dev --https`: a self-signed certificate, so a phone gets a secure context (the
      // air pointer's motion sensors need one). The deck's own `server.https` wins.
      if (env.command === "serve" && process.env.KADAL_DECK_HTTPS === "1" && !user.server?.https) {
        const { devCertificate } = await import("./https.ts");
        const https = devCertificate(resolve(user.root ?? process.cwd()));
        if (https) out.server = { https };
      }
      return Object.keys(out).length ? out : undefined;
    },
    configureServer(s) {
      server = s;
      remoteRelay(s);
      drawingsDev(s, { dir: () => drawingsDir(entryPath), base: () => base });
      const dist = excalidrawDist();
      s.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0]!;
        const prefixes = [`${base}excalidraw/fonts/`, "/excalidraw/fonts/"];
        const prefix = prefixes.find((p) => url.startsWith(p));
        if (!dist || !prefix) return next();
        const rel = decodeURIComponent(url.slice(prefix.length));
        const file = join(dist, "fonts", rel);
        if (rel.includes("..") || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "font/woff2");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Access-Control-Allow-Origin", "*");
        createReadStream(file).pipe(res);
      });
      s.watcher.add(entryPath);
      // The default glossary path is watched from the start, so creating the file is noticed too.
      s.watcher.add(resolve(dirname(entryPath), DEFAULT_GLOSSARY.src!));
      const changed = (file: string) => {
        if (file === entryPath || included.has(file) || file === glossaryFile) invalidate();
      };
      s.watcher.on("change", changed);
      s.watcher.on("add", changed);
      s.watcher.on("unlink", changed);
    },
    writeBundle() {
      if (!building) return;
      const dist = excalidrawDist();
      if (!dist) return;
      cpSync(join(dist, "fonts"), join(outDir, "excalidraw", "fonts"), {
        recursive: true,
        filter: (src) => !SKIP_FONTS.has(src.split("/").pop() ?? ""),
      });
    },
    resolveId(id) {
      if (id === VIRTUAL || id.startsWith(`${VIRTUAL}/`)) return `\0${id}`;
      if (id === "@kadal/deck/mdx-provider") return id;
      return null;
    },
    async load(id) {
      if (id === "@kadal/deck/mdx-provider") {
        return `export { useMDXComponents } from "@kadal/deck";`;
      }
      if (!id.startsWith(RESOLVED)) return null;
      const m = ensure();

      if (id === `${RESOLVED}/kokoro`) {
        return `import KokoroWorker from ${JSON.stringify(`${kokoroWorkerFile()}?worker`)};
export function createWorker() { return new KokoroWorker({ name: "kadal-deck-kokoro" }); }
`;
      }

      if (id === RESOLVED) {
        // A missing optional peer resolves too — to Vite's stub that throws on import — so the
        // answer is "found a real file", not "resolved".
        kokoro ??= this.resolve("kokoro-js", kokoroWorkerFile(), { skipSelf: true }).then(
          (r) => !!r && !r.external && !r.id.includes("optional-peer-dep") && !r.id.startsWith("\0"),
          () => false,
        );
        const hasKokoro = await kokoro;
        const entries = m.slides.map((s, i) => {
          const title = titleOf(s);
          return `  {
    index: ${i},
    h: ${s.h},
    v: ${s.v},
    id: ${JSON.stringify(typeof s.frontmatter.id === "string" ? s.frontmatter.id : `s${i}`)},
    title: ${JSON.stringify(title)},
    level: ${levelOf(s)},
    frontmatter: ${JSON.stringify(s.frontmatter)},
    hasNotes: ${s.notes ? "true" : "false"},
    text: ${JSON.stringify(plainText(s.content))},
    notesText: ${s.notes ? JSON.stringify(plainText(s.notes)) : "null"},
    source: ${JSON.stringify(s.source)},
    load: () => import("${VIRTUAL}/slide/${i}"),
    loadNotes: ${s.notes ? `() => import("${VIRTUAL}/notes/${i}")` : "null"},
    loadMagic: ${s.magic.length ? `() => import("${VIRTUAL}/magic/${i}")` : "null"},
  }`;
        });
        return `export const headmatter = ${JSON.stringify(m.headmatter)};
export const slides = [
${entries.join(",\n")}
];
export const glossary = ${JSON.stringify(m.glossary.entries)};
${building ? "export const relay = null;" : DEV_RELAY}
export const kokoro = ${hasKokoro ? `() => import("${VIRTUAL}/kokoro")` : "null"};
${drawingsExport({ building, base, dir: drawingsDir(entryPath) })}
export default { headmatter, slides, glossary, relay, kokoro, drawings };
`;
      }

      if (id === `${RESOLVED}/drawings`) return drawingsModule(drawingsDir(entryPath));

      if (!id.startsWith("\0virtual:deck/")) return null;
      const slide = /^(slide|notes|magic)\/(\d+)$/.exec(id.slice("\0virtual:deck/".length));
      if (!slide) return null;
      const kind = slide[1]!;
      const s = m.slides[Number(slide[2])];
      if (!s) return `export default () => null;`;

      if (kind === "slide")
        return compileMdx(
          s.content,
          `${s.source.file}:${s.source.line}`,
          slideTerms(s),
        );
      if (kind === "notes")
        return compileMdx(s.notes ?? "", `${s.source.file}:${s.source.line} (notes)`);

      // magic: precompute keyed tokens for each step, plus that step's own line highlights.
      const blocks = magicMoveData(s.magic, await getHighlighter(), themes);
      return `export default ${JSON.stringify(blocks)};`;
    },
  };
}

export default deck;

/**
 * The phone remote's relay on the dev server: pairing and routing (src/remote/relay.ts) over the
 * HMR socket every page of the deck already holds, so it listens wherever Vite does — and nowhere
 * Vite does not. Only `serve` has it; a build has no relay.
 */
function remoteRelay(s: ViteDevServer) {
  const relay = createRelay({ urls: () => s.resolvedUrls?.network ?? [] });
  const peers = new WeakMap<object, RelayPeer>();
  type Client = { send(event: string, payload?: unknown): void };
  const peerOf = (client: Client): RelayPeer => {
    let peer = peers.get(client);
    if (!peer) {
      peer = { send: (m) => client.send("kadal:remote", m) };
      peers.set(client, peer);
    }
    return peer;
  };
  // The channel hands listeners a wrapper without the socket, so guesses are counted per
  // connection (and in all) rather than per address.
  s.ws.on("kadal:remote", (data: unknown, client: Client) => relay.message(peerOf(client), data));
  s.ws.on("vite:client:disconnect", (_data: unknown, client: Client) => {
    const peer = peers.get(client);
    if (peer) relay.leave(peer);
  });
}
