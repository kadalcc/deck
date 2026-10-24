import { compile } from "@mdx-js/mdx";
import { renderToString as renderKatex } from "katex";
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Highlighter,
  type ShikiTransformer,
  bundledLanguagesInfo,
  createHighlighter,
} from "shiki";
import { type Plugin, type ViteDevServer, searchForWorkspaceRoot } from "vite";

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
import {
  codeThemeCss,
  codeThemes,
  codeThemesKey,
  shikiThemeNames,
  shikiThemeOption,
} from "../compiler/code-themes.ts";
import {
  type DeckSetup,
  comarkEnabled,
  katexOptions,
  manifestHeadmatter,
  notesRuby,
  plantUmlServer,
} from "../compiler/setup.ts";
import { notationTransformers } from "../compiler/transformers.ts";
import { DEFAULT_GLOSSARY } from "../glossary/model.ts";
import { createRelay, type RelayPeer } from "../remote/relay.ts";
import { applySlideDefaults, shikiThemes, slideDefaultLayers } from "../theming/merge.ts";
import {
  type DeckPackageSet,
  deckPackageSet,
  isLayerCandidate,
  packageRoots,
  packagesCode,
} from "./packages.ts";
import { monacoInstalled, monacoLangs, monacoModule, setupFile } from "./monaco.ts";
import { monacoWriteDev } from "./monaco-dev.ts";
import { localTypePackages, localTypes, monacoSources, typeRequests } from "./monaco-types.ts";
import { monacoTypesOptions } from "../monaco/types.ts";
import { loadTwoslash } from "./twoslash.ts";
import { DEV_NOTES, NOTES_PATH, notesEndpoint, notesOnlyChanges, pushNotes } from "./notes-dev.ts";
import { drawingsDev, drawingsDir, drawingsExport, drawingsModule } from "./drawings-dev.ts";
import { DRAG_PATH, dragEndpoint } from "./drag-dev.ts";
import { iconRegistration, resolveIcons } from "../icons/node.ts";
import { SIDE_EDITOR_DEPS, SOURCE_PATH, sideEditorCode, sourceEndpoint } from "./source-dev.ts";
import { type RemoteGate, remoteGate, remoteSettings } from "./remote-dev.ts";
import { deckSite, subdirConfig } from "./site.ts";
import { type MarkerBlock, hasConflictMarkers, markerBlocks } from "../sync/markers.ts";
import { kitJson, kitMode, kitModuleCode, slideImports, writeKitJson } from "./kit.ts";
import { RESOLVE_PATH, resolveEndpoint } from "./resolve-dev.ts";

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
 *                            (the manifest also carries `styles`: every slide's <style>, scoped)
 *   virtual:deck/monaco      Monaco for `{monaco…}` blocks (vite/monaco.ts) — only when a slide has
 *                            one; otherwise the manifest says `monaco: null`
 *   virtual:deck/kokoro      the narrator's Kokoro worker — only when the deck has `kokoro-js`
 *   virtual:deck/drawings    the saved drawings, `drawings/*.svg` — in a build (vite/drawings-dev.ts)
 *                            installed; otherwise the manifest says `kokoro: null` and nothing of
 *                            it is built (it is an optional peer: ~400 MB of ONNX runtime)
 *
 * A `glossary.yaml` beside the deck file (or the headmatter's `glossary:` path) is read here too:
 * every slide's key terms are linked to it as the slide compiles (`compiler/rehype-glossary.ts`),
 * and its entries ride in the manifest for the cards the runtime shows.
 *
 * Merge conflicts (`kadal-deck pull`, sync/markers.ts): under `kadal-deck dev` a slide with
 * markers renders both versions with buttons (react/ConflictCard.tsx → vite/resolve-dev.ts); a
 * build refuses, naming the slide and line.
 *
 * KADAL_DECK_KIT=1 builds the deck's editing kit instead (vite/kit.ts): `virtual:deck` is the
 * shell plus the module map, and the build writes kit.json.
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

/**
 * The plugin's options. Beyond `entry` and `shiki`, the setup hooks (compiler/setup.ts):
 * `remarkPlugins`, `rehypePlugins`, `preprocess(text, file)`, `katex`, `mermaid`, and
 * `withoutNotes` (also `KADAL_DECK_WITHOUT_NOTES=1`, which `kadal-deck build --without-notes` sets).
 */
export interface DeckPluginOptions extends DeckSetup {
  /** The deck file, relative to the Vite root. Default `deck.mdx`. */
  entry?: string;
  /**
   * Shiki: the themes (without them the deck's theme package decides, `kadal.theme.shiki`, and
   * without that GitHub's light and dark; the theme's CSS can still restyle the colours), the
   * languages loaded, and transformers run on every code block after the built-in notation ones
   * (`// [!code ++]`, see compiler/transformers.ts).
   */
  shiki?: { light?: string; dark?: string; langs?: string[]; transformers?: ShikiTransformer[] };
  /**
   * TwoSlash for ```ts twoslash blocks (needs `typescript` installed). Default true; false renders
   * them as plain highlighted code.
   */
  twoslash?: boolean;
  /**
   * The module that registers `{monaco-run}` runners, relative to the Vite root. Default: the
   * deck's `setup/code-runners.ts` when there is one. Its default export is the runners map (or a
   * function returning it); see `defineCodeRunners`.
   */
  codeRunners?: string;
}

/** Build-time KaTeX for the maths in a definition; the browser gets finished HTML. */
const katexRenderer =
  (options: object = {}) =>
  (tex: string) =>
    renderKatex(tex, { throwOnError: false, ...options });

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

/** Whether any slide of the deck (includes too) has a `{monaco…}` block; false when it cannot tell. */
function deckUsesMonaco(entryPath: string): boolean {
  try {
    const { slides } = prepareDeck(readFileSync(entryPath, "utf8"), {
      file: entryPath,
      resolveInclude: (path, from) => {
        const file = resolve(dirname(from), path);
        return existsSync(file) ? { file, text: readFileSync(file, "utf8") } : null;
      },
    });
    return monacoLangs(slides.map((s) => s.content)).size > 0;
  } catch {
    return false;
  }
}

const VIRTUAL = "virtual:deck";
const RESOLVED = "\0virtual:deck";

export function deck(options: DeckPluginOptions = {}): Plugin {
  // `kadal-deck build a.mdx b.mdx` builds each file in turn through the same config (cli/build.ts).
  const entry = process.env.KADAL_DECK_ENTRY || (options.entry ?? "deck.mdx");
  // The Shiki themes: the plugin's options, else the deck's theme package's, else GitHub's —
  // decided again at every manifest build, since the headmatter's theme can change.
  let themes = shikiThemes(options.shiki, null);
  /** The pair above plus what the theme menu's other themes need (compiler/code-themes.ts). */
  let code = codeThemes(options.shiki, null);
  let root = process.cwd();
  let entryPath = "";
  let base = "/";
  let outDir = "dist";
  let building = false;
  let publicDir: string | null = null;
  let watching = false;
  let highlighter: Highlighter | null = null;
  let server: ViteDevServer | null = null;
  let manifest: ReturnType<typeof build> | null = null;
  const included = new Set<string>();
  /** The resolved themes' and addons' package.json files: their metadata is in the manifest. */
  const packageFiles = new Set<string>();
  /** The glossary file the last build read (or looked for), watched like an included file. */
  let glossaryFile: string | null = null;
  /** Whether `kokoro-js` resolves from this package (decided once, at the first manifest). */
  let kokoro: Promise<boolean> | null = null;
  const withoutNotes = options.withoutNotes ?? process.env.KADAL_DECK_WITHOUT_NOTES === "1";
  /** TwoSlash, loaded the first time a slide has a `twoslash` block (it starts TypeScript). */
  let twoslash: Promise<ShikiTransformer | null> | null = null;
  /** Files `/__kadal/monaco-write` just saved: their change must not reload the page. */
  const quietWrites = new Map<string, string>();
  /**
   * The text of each file's last quiet write, kept (quietWrites is consumed by the watcher): what
   * `hotUpdate` checks, so Tailwind, which reloads the page when a file it scans changes, is not
   * told about a save the page already shows (a drag, a Monaco edit).
   */
  const quietText = new Map<string, string>();
  const quiet = (file: string, text: string) => {
    quietWrites.set(file, text);
    quietText.set(file, text);
  };
  const transformers = [...notationTransformers(), ...(options.shiki?.transformers ?? [])];
  /** Icons already reported as not bundled, so a rebuild does not repeat itself. */
  const warnedIcons = new Set<string>();

  let highlighterKey = "";
  const getHighlighter = async () => {
    const key = codeThemesKey(code);
    if (!highlighter || key !== highlighterKey) {
      highlighterKey = key;
      highlighter = await createHighlighter({
        themes: shikiThemeNames(code),
        langs: options.shiki?.langs ?? DEFAULT_LANGS,
      }).catch((err: unknown) => {
        throw new Error(
          `[deck] Shiki could not load the code themes ${shikiThemeNames(code).join(", ")} (from the plugin options or the kadal.theme.shiki of the deck's theme packages): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    return highlighter;
  };

  function build() {
    included.clear();
    const text = readFileSync(entryPath, "utf8");
    const deckDir = dirname(entryPath);
    // Merge conflicts by file (sync/markers.ts): their slides become cards, never compiled, and
    // the YAML errors markers cause inside a frontmatter block are the conflict's.
    const conflicts = new Map<string, MarkerBlock[]>();
    const noteConflicts = (file: string, t: string) => {
      if (hasConflictMarkers(t)) conflicts.set(file, markerBlocks(t));
      return t;
    };
    noteConflicts(entryPath, text);
    const { headmatter, slides, styles } = prepareDeck(text, {
      file: entryPath,
      resolveInclude: (path, from) => {
        const file = resolve(dirname(from), path);
        if (!existsSync(file)) return null;
        included.add(file);
        return { file, text: noteConflicts(file, readFileSync(file, "utf8")) };
      },
      ...(conflicts.size || /^<{7}/m.test(text)
        ? {
            onError: (e: { message: string; file: string; line: number }) => {
              const inBlock = (conflicts.get(e.file) ?? []).some(
                (b) => e.line - 1 >= b.start && e.line - 1 <= b.end + 1,
              );
              if (!inBlock) throw new Error(`${e.file}:${e.line}: ${e.message}`);
            },
          }
        : {}),
      preprocess: options.preprocess,
      withoutNotes,
      // `<<<` imports: deck-root relative paths, read from the disk and watched like includes.
      snippets: {
        dirOf: (file) => relative(deckDir, dirname(file)).split(sep).join("/"),
        read: (path) => {
          const file = resolve(deckDir, path);
          included.add(file);
          server?.watcher.add(file);
          if (!existsSync(file) || !statSync(file).isFile()) return null;
          return { path, text: readFileSync(file, "utf8") };
        },
        onProblem: (message, s) => console.warn(`[deck] ${s.source.file}:${s.source.line}: ${message}`),
      },
    });
    const katex = katexOptions(headmatter, options);
    // Themes, addons and layer files (vite/packages.ts): resolved from the deck's folder, and the
    // theme's slide defaults filled in under every slide's own before anything compiles.
    const packages = deckPackageSet(headmatter, dirname(entryPath));
    for (const f of packages.watch) {
      packageFiles.add(f);
      server?.watcher.add(f);
    }
    applySlideDefaults(slides, slideDefaultLayers(headmatter, packages.theme, packages.addons));
    themes = shikiThemes(options.shiki, packages.theme);
    code = codeThemes(options.shiki, packages.theme, packages.themes);
    return {
      headmatter,
      slides,
      conflicts,
      // The theme menu's code colours ride with the slides' own styles (compiler/code-themes.ts).
      styles: styles + codeThemeCss(code),
      katex,
      math: katexRenderer(katex),
      glossary: readGlossary(headmatter, katexRenderer(katex)),
      packages,
    };
  }

  function readGlossary(headmatter: Record<string, unknown>, renderMath: (tex: string) => string) {
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

  /** Rebuild; when the change touched notes only, push them over HMR and say so (notes-dev.ts). */
  const hotNotes = (): boolean => {
    const before = manifest!;
    let after: ReturnType<typeof build>;
    try {
      after = build();
    } catch {
      return false;
    }
    const changes = notesOnlyChanges(before, after);
    if (!changes || !server) return false;
    manifest = after;
    if (changes.length) pushNotes(server, base, after, changes, plainText);
    return true;
  };

  const invalidate = (quiet = false) => {
    manifest = null;
    if (!server) return;
    const mods = [...server.moduleGraph.idToModuleMap.keys()].filter((id) =>
      id.startsWith(RESOLVED),
    );
    for (const id of mods) {
      const mod = server.moduleGraph.getModuleById(id);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
    if (!quiet) server.ws.send({ type: "full-reload" });
  };

  /**
   * `terms` is the slide's own frontmatter switch; null compiles without the glossary (notes).
   * Notes that are not valid MDX — Slidev notes, written for a Markdown parser, often are not —
   * compile again as plain Markdown, with a warning, rather than fail the build.
   */
  async function compileMdx(source: string, file: string, terms: unknown = null, notes = false) {
    const m = ensure();
    if (options.twoslash !== false && /\btwoslash\b/.test(source))
      twoslash ??= loadTwoslash(dirname(entryPath), (msg) => console.warn(`[deck] ${msg}`));
    const ts = twoslash ? await twoslash : null;
    // Iconify icons the slide names: bundled into its module from the deck's installed sets.
    const iconNames = new Set<string>();
    const run = async (format: "mdx" | "md") =>
      compile(source, {
        jsx: false,
        jsxImportSource: "react",
        development: false,
        ...mdxPlugins({
          highlighter: await getHighlighter(),
          themes: shikiThemeOption(code),
          glossary: m.glossary,
          terms,
          math: m.math,
          warn: (message) => console.warn(`[deck] ${file}: ${message}`),
          katex: m.katex,
          plantUmlServer: plantUmlServer(m.headmatter),
          comark: comarkEnabled(m.headmatter),
          ruby: notes ? notesRuby(m.headmatter) : null,
          remarkPlugins: options.remarkPlugins,
          rehypePlugins: options.rehypePlugins,
          transformers,
          twoslash: ts,
          icons: { onIcon: (name) => iconNames.add(name) },
        }),
        providerImportSource: "@kadal/deck/mdx-provider",
        format,
      });
    let out;
    try {
      out = await run("mdx");
    } catch (err) {
      if (!notes) throw err;
      console.warn(
        `[deck] ${file}: the notes are not valid MDX (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); compiled as plain Markdown instead.`,
      );
      out = await run("md");
    }
    const icons = resolveIcons(iconNames, dirname(entryPath));
    for (const m of icons.missing)
      if (!warnedIcons.has(m.name)) {
        warnedIcons.add(m.name);
        console.warn(`[deck] ${file}: icon ${m.name}: ${m.reason}.`);
      }
    return `// ${file}\n${iconRegistration(icons.icons)}${String(out)}`;
  }

  // The head, the OG card, the PWA, bundled remote assets and the static-host files (vite/site.ts).
  const site = deckSite({
    root: () => root,
    entry: () => entryPath,
    base: () => base,
    outDir: () => outDir,
    publicDir: () => publicDir,
    building: () => building,
    watching: () => watching,
    deck: () => ensure(),
    manifestId: RESOLVED,
  });

  return {
    name: "stack:deck",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      entryPath = resolve(root, entry);
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      outDir = resolve(root, config.build.outDir);
      building = config.command === "build";
      publicDir = config.publicDir || null;
      watching = !!config.build.watch;
    },
    async config(user, env) {
      const out: {
        base?: string;
        build?: { outDir?: string; copyPublicDir?: boolean };
        worker?: { format: "es" };
        server?: { https?: object; fs?: { allow: string[] }; allowedHosts?: string[] };
        resolve?: { dedupe: string[] };
        optimizeDeps?: { include: string[] };
      } = {};
      // A theme or addon package (or a layer file) brings modules from outside the deck's own
      // tree: one React, one engine for all of them, and a `../my-theme` the dev server may serve.
      const userRoot = resolve(user.root ?? process.cwd());
      const peek = peekPackages(resolve(userRoot, entry));
      if (peek) {
        out.resolve = { dedupe: ["react", "react-dom", "@kadal/deck"] };
        if (env.command === "serve" && !user.server?.fs?.allow) {
          const workspace = searchForWorkspaceRoot(userRoot);
          const outside = packageRoots(peek).filter((r) => !isWithin(workspace, r));
          if (outside.length) out.server = { fs: { allow: [workspace, ...outside] } };
        }
      }
      // The kit (vite/kit.ts) rides beside the deck's own build, whose public/ files it shares.
      if (kitMode() && env.command === "build") out.build = { copyPublicDir: false };
      // The Kokoro worker splits into chunks (transformers.js loads its runtime lazily), which
      // only an ES-module worker can do. A deck that set its own worker format keeps it.
      if (!user.worker?.format) out.worker = { format: "es" };
      // One of several decks in one `kadal-deck build`: its own folder and base (cli/build.ts).
      Object.assign(out, subdirConfig(user, env.command));
      // `kadal-deck dev --https`: a self-signed certificate, so a phone gets a secure context (the
      // air pointer's motion sensors need one). The deck's own `server.https` wins.
      // A deck with Monaco editors: their few Shiki/Monaco glue packages are pre-bundled up front, so
      // the first editor does not make Vite discover them, re-optimize and reload the page.
      if (env.command === "serve" && deckUsesMonaco(resolve(user.root ?? process.cwd(), entry)))
        out.optimizeDeps = {
          include: [
            "@kadal/deck > @shikijs/monaco",
            "@kadal/deck > shiki/core",
            "@kadal/deck > shiki/engine/javascript",
          ],
        };
      // The side editor's CodeMirror (vite/source-dev.ts), pre-bundled so its first opening does
      // not reload the page.
      if (env.command === "serve")
        out.optimizeDeps = { include: [...(out.optimizeDeps?.include ?? []), ...SIDE_EDITOR_DEPS] };
      // `kadal-deck dev --tunnel` (vite/remote-dev.ts): requests arrive with the tunnel's host name,
      // which Vite's DNS-rebinding guard would turn away.
      if (env.command === "serve" && remoteSettings().tunnel && user.server?.allowedHosts !== true)
        out.server = {
          ...out.server,
          allowedHosts: [...(user.server?.allowedHosts || []), ".trycloudflare.com"],
        };
      if (env.command === "serve" && process.env.KADAL_DECK_HTTPS === "1" && !user.server?.https) {
        const { devCertificate } = await import("./https.ts");
        const https = devCertificate(resolve(user.root ?? process.cwd()));
        if (https) out.server = { ...out.server, https };
      }
      return Object.keys(out).length ? out : undefined;
    },
    configureServer(s) {
      server = s;
      // First: the password gate stands in front of every endpoint registered after it.
      const gate = remoteGate(s, { base: () => base });
      remoteRelay(s, gate);
      monacoWriteDev(s, { root: () => root, entry: () => entryPath, quiet });
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
        if (
          !(
            file === entryPath ||
            included.has(file) ||
            file === glossaryFile ||
            packageFiles.has(file) ||
            isLayerCandidate(file, dirname(entryPath))
          )
        )
          return;
        // A `{monaco-write}` save: the slide already shows it, so recompile quietly, no reload.
        const quiet = quietWrites.get(file);
        if (quiet !== undefined) {
          quietWrites.delete(file);
          if (existsSync(file) && readFileSync(file, "utf8") === quiet) return invalidate(true);
        }
        // Only notes changed (a save from the presenter, say): push those, keep every view as it is.
        if (manifest && file !== glossaryFile && hotNotes()) return;
        invalidate();
      };
      notesEndpoint(s, { entry: () => entryPath, base: () => base });
      dragEndpoint(s, { entry: () => entryPath, base: () => base, quiet });
      sourceEndpoint(s, { entry: () => entryPath, base: () => base });
      resolveEndpoint(s, { entry: () => entryPath, base: () => base });
      s.watcher.on("change", changed);
      s.watcher.on("add", changed);
      s.watcher.on("unlink", changed);
    },
    // Tailwind full-reloads the page when a file it scans changes (deck.mdx is one). A change that
    // touched only notes is handled here first (hotNotes: pushed over HMR) and answered with no
    // modules, which leaves Tailwind nothing to reload; any other change goes on as before.
    hotUpdate({ file, type }) {
      if (this.environment && this.environment.name !== "client") return;
      if (type !== "update" || !(file === entryPath || included.has(file))) return;
      const quietly = quietText.get(file);
      if (quietly !== undefined && existsSync(file) && readFileSync(file, "utf8") === quietly)
        return [];
      if (manifest && hotNotes()) return [];
    },
    // The kit is not a site of its own: no head, OG card, PWA or static-host files for it.
    ...(kitMode()
      ? {}
      : {
          transformIndexHtml: site.transformIndexHtml,
          transform: site.transform,
          generateBundle: site.generateBundle,
          closeBundle: site.closeBundle,
        }),
    writeBundle() {
      if (!building) return;
      if (kitMode()) {
        const m = ensure();
        writeKitJson(
          outDir,
          kitJson({
            deckDir: dirname(entryPath),
            modules: [...slideImports(m.slides, dirname(entryPath)).keys()],
            packages: m.packages,
            engine: engineVersion(),
          }),
        );
        // The kit draws sketches too: its own font copy, which a content-addressed host stores
        // once (byte for byte the deck's and the shell's).
      }
      const dist = excalidrawDist();
      if (!dist) return;
      cpSync(join(dist, "fonts"), join(outDir, "excalidraw", "fonts"), {
        recursive: true,
        filter: (src) => !SKIP_FONTS.has(src.split("/").pop() ?? ""),
      });
    },
    resolveId(id, importer) {
      if (id === VIRTUAL || id.startsWith(`${VIRTUAL}/`)) return `\0${id}`;
      if (id === "@kadal/deck/mdx-provider") return id;
      // A slide's module is virtual, so `import x from "./x.ts"` in it has no folder to start
      // from: resolve it from the file the slide was written in (deck.mdx, or a `src:` include).
      if (importer?.startsWith(`${RESOLVED}/`) && /^\.\.?\//.test(id)) {
        const n = /^(?:slide|notes)\/(\d+)/.exec(importer.slice(RESOLVED.length + 1));
        const from = (n && ensure().slides[Number(n[1])]?.source.file) || entryPath;
        return this.resolve(id, from, { skipSelf: true });
      }
      return null;
    },
    async load(id) {
      if (id === "@kadal/deck/mdx-provider") {
        return `export { useMDXComponents } from "@kadal/deck";`;
      }
      if (!id.startsWith(RESOLVED)) return null;
      const m = ensure();

      if (id === `${RESOLVED}/monaco`) {
        const typing = monacoTypesOptions(m.headmatter);
        return monacoModule({
          langs: monacoLangs(m.slides.map((s) => s.content)),
          themes,
          allThemes: shikiThemeNames(code),
          deckDir: dirname(entryPath),
          writeEndpoint: building ? null : `${base}__kadal/monaco-write`,
          languages: bundledLanguagesInfo,
          // `local` types (vite/monaco-types.ts): what the editors import that the deck installed.
          typePackages:
            typing.source === "auto" || typing.source === "local"
              ? localTypePackages(
                  monacoSources(m.slides.map((s) => s.content)),
                  typing.packages,
                  dirname(entryPath),
                  typing.ignore,
                )
              : [],
          typesModule: `${VIRTUAL}/monaco-types/`,
        });
      }

      if (id.startsWith(`${RESOLVED}/monaco-types/`)) {
        const pkg = decodeURIComponent(id.slice(`${RESOLVED}/monaco-types/`.length));
        const typing = monacoTypesOptions(m.headmatter);
        const asks = typeRequests(monacoSources(m.slides.map((s) => s.content)), typing.packages);
        const files = await localTypes(
          pkg,
          dirname(entryPath),
          typing.ignore,
          asks.get(pkg) ?? [""],
        );
        return `export default ${JSON.stringify(files ?? [])};`;
      }

      if (id === `${RESOLVED}/kokoro`) {
        return `import KokoroWorker from ${JSON.stringify(`${kokoroWorkerFile()}?worker`)};
export function createWorker() { return new KokoroWorker({ name: "kadal-deck-kokoro" }); }
`;
      }

      if (id === RESOLVED && kitMode()) {
        const deckDir = dirname(entryPath);
        const resolved = new Map<string, string>();
        for (const [key, imp] of slideImports(m.slides, deckDir)) {
          const r = await this.resolve(imp.spec, imp.file, { skipSelf: true });
          if (r && !r.external) resolved.set(key, r.id);
          else console.warn(`[deck] kit: ${imp.spec} (imported in ${imp.file}) does not resolve; the builder will not have it.`);
        }
        const hasMonaco = monacoInstalled() && monacoLangs(m.slides.map((s) => s.content)).size > 0;
        const runnersFile = options.codeRunners
          ? resolve(root, options.codeRunners)
          : setupFile(deckDir, "code-runners");
        return kitModuleCode({
          packages: m.packages,
          packagesCode: packagesCode(m.packages),
          resolved,
          monaco: hasMonaco ? `() => import("${VIRTUAL}/monaco").then((m) => m.default())` : null,
          codeRunners: runnersFile && existsSync(runnersFile) ? runnersFile : null,
          engine: engineVersion(),
        });
      }

      if (id === RESOLVED) {
        // A missing optional peer resolves too — to Vite's stub that throws on import — so the
        // answer is "found a real file", not "resolved".
        kokoro ??= this.resolve("kokoro-js", kokoroWorkerFile(), { skipSelf: true }).then(
          (r) => !!r && !r.external && !r.id.includes("optional-peer-dep") && !r.id.startsWith("\0"),
          () => false,
        );
        const hasKokoro = await kokoro;
        const hasMonaco = monacoInstalled() && monacoLangs(m.slides.map((s) => s.content)).size > 0;
        const runnersFile = options.codeRunners
          ? resolve(root, options.codeRunners)
          : setupFile(dirname(entryPath), "code-runners");
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
        const pk = packagesCode(m.packages);
        return `${pk.imports}
export const headmatter = ${JSON.stringify(manifestHeadmatter(m.headmatter, options))};
export const packages = ${pk.value};
export const slides = [
${entries.join(",\n")}
];
export const glossary = ${JSON.stringify(m.glossary.entries)};
export const styles = ${JSON.stringify(m.styles)};
export const codeThemes = ${JSON.stringify(code)};
${building ? "export const relay = null;" : DEV_RELAY}
export const kokoro = ${hasKokoro ? `() => import("${VIRTUAL}/kokoro")` : "null"};
export const monaco = ${hasMonaco ? `() => import("${VIRTUAL}/monaco").then((m) => m.default())` : "null"};
export const codeRunners = ${runnersFile && existsSync(runnersFile) ? `() => import(${JSON.stringify(runnersFile)})` : "null"};
export const dev = ${building ? "false" : "true"};
export const notesApi = ${building ? "null" : JSON.stringify(`${base}${NOTES_PATH}`)};
export const dragApi = ${building ? "null" : JSON.stringify(`${base}${DRAG_PATH}`)};
${building ? "" : DEV_NOTES}
${drawingsExport({ building, base, dir: drawingsDir(entryPath) })}
export const sourceApi = ${building ? "null" : JSON.stringify(`${base}${SOURCE_PATH}`)};
${building || !m.conflicts.size ? "" : conflictResolverCode(`${base}${RESOLVE_PATH}`)}
export const sideEditor = ${sideEditorCode(building)};
export default { headmatter, slides, glossary, styles, codeThemes, relay, kokoro, packages, monaco, codeRunners, dev, notesApi, drawings, dragApi, sourceApi, sideEditor };
`;
      }

      if (id === `${RESOLVED}/drawings`) return drawingsModule(drawingsDir(entryPath));

      if (!id.startsWith("\0virtual:deck/")) return null;
      // A hot notes update asks for `notes/N?t=…`: the query only busts the browser's cache.
      const slide = /^(slide|notes|magic)\/(\d+)(?:\?.*)?$/.exec(
        id.slice("\0virtual:deck/".length),
      );
      if (!slide) return null;
      const kind = slide[1]!;
      const s = m.slides[Number(slide[2])];
      if (!s) return `export default () => null;`;

      const conflicted = (m.conflicts.get(s.range.file) ?? [])
        .map((b, block) => ({ b, block }))
        .filter(({ b }) => b.start >= s.range.start && b.start < s.range.end);
      if (conflicted.length) {
        const rel = relative(dirname(entryPath), s.range.file).split(sep).join("/");
        const first = `${rel}:${conflicted[0]!.b.start + 1}`;
        // A build never ships two versions of a slide.
        if (building)
          this.error(
            `Unresolved merge conflict on slide ${s.index + 1} (${first}). Keep one side or both with \`kadal-deck resolve\`, or edit the file and delete the marker lines, then build again.`,
          );
        if (kind !== "slide") return `export default () => null;`;
        console.warn(`[deck] Unresolved merge conflict on slide ${s.index + 1} (${first}).`);
        return conflictSlideCode(rel, s.index, conflicted);
      }

      if (kind === "slide")
        return compileMdx(
          s.content,
          `${s.source.file}:${s.source.line}`,
          slideTerms(s),
        );
      if (kind === "notes")
        return compileMdx(s.notes ?? "", `${s.source.file}:${s.source.line} (notes)`, null, true);

      // magic: precompute keyed tokens for each step, plus that step's own line highlights.
      const blocks = magicMoveData(s.magic, await getHighlighter(), shikiThemeOption(code));
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
function remoteRelay(s: ViteDevServer, gate?: RemoteGate) {
  // The tunnel's address first, when there is one: a phone can reach it from any network.
  const relay = createRelay({
    urls: () => {
      const tunnel = gate?.publicUrl();
      return [...(tunnel ? [tunnel] : []), ...(s.resolvedUrls?.network ?? [])];
    },
  });
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

/** Is `p` inside `dir` (or `dir` itself)? */
function isWithin(dir: string, p: string): boolean {
  const rel = relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * The deck's packages as the config hook needs them — before the manifest exists, and without
 * failing: a theme that does not resolve is reported when the manifest is built, with the full
 * message, not here. Null when every theme the menu offers is built in and the deck has no addons
 * or layer files.
 */
function peekPackages(file: string): DeckPackageSet | null {
  if (!existsSync(file)) return null;
  try {
    const { headmatter } = prepareDeck(readFileSync(file, "utf8"), {
      file,
      resolveInclude: () => null,
    });
    const set = deckPackageSet(headmatter, dirname(file));
    // `more` counts: the theme menu offers every first-party theme, whose modules import React
    // and the engine from inside @kadal/deck's own folder.
    const external =
      [...set.themes, ...(set.more ?? [])].some((t) => !t.builtin) ||
      set.addons.length > 0 ||
      Object.keys(set.layers).length > 0;
    return external ? set : null;
  } catch {
    return null;
  }
}

export { deckPackages, type DeckPackagesOptions } from "./packages.ts";

/** This package's version, for kit.json. */
function engineVersion(): string {
  for (const rel of ["../../package.json", "../package.json"]) {
    const file = fileURLToPath(new URL(rel, import.meta.url));
    if (!existsSync(file)) continue;
    try {
      const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string };
      if (pkg.name === "@kadal/deck" && pkg.version) return pkg.version;
    } catch {
      /* next */
    }
  }
  return "0.0.0";
}

/** A conflicted slide's module under `kadal-deck dev`: the card with both versions. */
function conflictSlideCode(file: string, slide: number, blocks: Array<{ b: MarkerBlock; block: number }>): string {
  const props = {
    file,
    slide,
    blocks: blocks.map(({ b, block }) => ({
      block,
      line: b.start + 1,
      oursLabel: b.oursLabel,
      theirsLabel: b.theirsLabel,
      ours: b.ours.join("\n"),
      theirs: b.theirs.join("\n"),
    })),
  };
  return `import { jsx } from "react/jsx-runtime";
import { ConflictSlide } from "@kadal/deck";
const props = ${JSON.stringify(props)};
export default function ConflictedSlide() { return jsx(ConflictSlide, props); }
`;
}

/** The dev page's answer to a conflict card's buttons: the resolve endpoint (vite/resolve-dev.ts). */
function conflictResolverCode(url: string): string {
  return `import { setConflictResolver as __kadal_setResolver } from "@kadal/deck";
__kadal_setResolver(async (r) => {
  const res = await fetch(${JSON.stringify(url)}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
  if (!res.ok) console.warn("[deck] could not resolve the conflict:", (await res.json().catch(() => ({}))).error ?? res.status);
});`;
}
