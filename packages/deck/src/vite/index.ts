import { compile } from "@mdx-js/mdx";
import { renderToString as renderKatex } from "katex";
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { type Highlighter, createHighlighter } from "shiki";
import { codeToKeyedTokens } from "shiki-magic-move/core";
import type { Plugin, ViteDevServer } from "vite";

import {
  applySlots,
  findMagicMoves,
  levelOf,
  rehypeDeckCode,
  splitDeck,
  titleOf,
} from "../compiler/index.ts";
import { parseCodeMeta, serialiseSteps } from "../compiler/code-meta.ts";
import { plainText } from "../compiler/plain-text.ts";
import { rehypeGlossary } from "../compiler/rehype-glossary.ts";
import {
  DEFAULT_GLOSSARY,
  type GlossaryEntry,
  buildMatcher,
  glossaryOptions,
} from "../glossary/model.ts";
import { parseGlossary } from "../glossary/parse.ts";

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

export interface DeckPluginOptions {
  /** The deck file, relative to the Vite root. Default `deck.mdx`. */
  entry?: string;
  /** Shiki themes. Defaults suit the neutral theme; the deck's theme CSS can override the colours. */
  shiki?: { light?: string; dark?: string; langs?: string[] };
}

/** Build-time KaTeX for the maths in a definition; the browser gets finished HTML. */
const renderMath = (tex: string) => renderKatex(tex, { throwOnError: false });

const VIRTUAL = "virtual:deck";
const RESOLVED = "\0virtual:deck";

const DEFAULT_LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "sh",
  "python",
  "rust",
  "go",
  "html",
  "css",
  "md",
  "yaml",
  "sql",
  "toml",
  "diff",
  "c",
  "cpp",
  "java",
  "kotlin",
  "swift",
  "text",
];

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
    const split = splitDeck(text, {
      file: entryPath,
      resolveInclude: (path, from) => {
        const file = resolve(dirname(from), path);
        if (!existsSync(file)) return null;
        included.add(file);
        return { file, text: readFileSync(file, "utf8") };
      },
    });
    const slides = split.slides.map((s) => {
      const { text: content, blocks } = findMagicMoves(applySlots(s.content));
      return { ...s, content, magic: blocks };
    });
    return { headmatter: split.headmatter, slides, glossary: readGlossary(split.headmatter) };
  }

  function readGlossary(headmatter: Record<string, unknown>) {
    const opts = glossaryOptions(headmatter.glossary);
    let entries: GlossaryEntry[] = [];
    glossaryFile = opts.src ? resolve(dirname(entryPath), opts.src) : null;
    if (glossaryFile && existsSync(glossaryFile)) {
      const parsed = parseGlossary(readFileSync(glossaryFile, "utf8"), glossaryFile, renderMath);
      entries = parsed.entries;
      for (const w of parsed.warnings) console.warn(`[deck] glossary: ${w}`);
      server?.watcher.add(glossaryFile);
    } else if (glossaryFile && opts.src !== DEFAULT_GLOSSARY.src) {
      console.warn(`[deck] glossary: ${glossaryFile} does not exist`);
    }
    return { options: opts, entries, matcher: buildMatcher(entries) };
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
    const hl = await getHighlighter();
    const { options: g, matcher } = ensure().glossary;
    const skipTerms =
      terms && typeof terms === "object" && Array.isArray((terms as { skip?: unknown }).skip)
        ? (terms as { skip: unknown[] }).skip
        : [];
    const glossaryPass =
      terms === null
        ? []
        : [
            [
              rehypeGlossary,
              {
                matcher,
                auto: terms !== false,
                repeat: g.repeat,
                headings: g.headings,
                skip: g.skip,
                exclude: new Set(
                  skipTerms.map((t) => matcher.resolve(String(t))?.id).filter((id) => !!id),
                ),
                math: renderMath,
                warn: (message: string) => console.warn(`[deck] ${file}: ${message}`),
              },
            ] as [typeof rehypeGlossary, Parameters<typeof rehypeGlossary>[0]],
          ];
    const out = await compile(source, {
      jsx: false,
      jsxImportSource: "react",
      development: false,
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeKatex, [rehypeDeckCode, { highlighter: hl, themes }], ...glossaryPass],
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
    configureServer(s) {
      server = s;
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

      if (id === RESOLVED) {
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
export default { headmatter, slides, glossary };
`;
      }

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
          s.frontmatter.terms === undefined ? true : s.frontmatter.terms,
        );
      if (kind === "notes")
        return compileMdx(s.notes ?? "", `${s.source.file}:${s.source.line} (notes)`);

      // magic: precompute keyed tokens for each step, plus that step's own line highlights.
      const hl = await getHighlighter();
      const blocks = s.magic.map((block) => ({
        options: block.options,
        title: block.title,
        steps: block.steps.map((step) => {
          const lang = hl.getLoadedLanguages().includes(step.lang) ? step.lang : "text";
          const meta = parseCodeMeta(step.meta);
          return {
            lang: step.lang,
            lines: meta.lines,
            highlight: meta.steps ? serialiseSteps(meta.steps) : null,
            tokens: {
              light: codeToKeyedTokens(hl, step.code, { lang: lang as never, theme: themes.light }),
              dark: codeToKeyedTokens(hl, step.code, { lang: lang as never, theme: themes.dark }),
            },
          };
        }),
      }));
      return `export default ${JSON.stringify(blocks)};`;
    },
  };
}

export default deck;
