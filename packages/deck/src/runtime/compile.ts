import { compile, run } from "@mdx-js/mdx";
import { renderToString as renderKatex } from "katex";
import { type ComponentType, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import type { Highlighter } from "shiki";

import {
  levelOf,
  titleOf,
  unclosedSettings,
  unclosedSettingsMessage,
} from "../compiler/split.ts";
import { DEFAULT_LANGS } from "../compiler/langs.ts";
import {
  type DeckGlossary,
  type PreparedSlide,
  deckGlossary,
  magicMoveData,
  mdxPlugins,
  prepareDeck,
  slideTerms,
} from "../compiler/pipeline.ts";
import { plainText } from "../compiler/plain-text.ts";
import type { DeckManifest, SlideMeta, SlideModule } from "../core/model.ts";
import { sourceFromFiles } from "../draw/source.ts";
import { useMDXComponents } from "../react/mdx.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RUNTIME COMPILER: deck.mdx → a manifest, in the browser
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What the Vite plugin does at build time, done in the page: split the deck, compile every slide
 * and note with the same remark/rehype passes (`compiler/pipeline.ts`), highlight code with Shiki,
 * and hand `<Deck>` a manifest whose `load()`s resolve to ready components. It is how a deck runs
 * from a string — a hosted editor's preview, or a published deck that ships `deck.mdx` and the
 * prebuilt shell instead of a bundle of its own.
 *
 * The limits are the honest ones: no `import` statements (there is no bundler to resolve them),
 * so a slide uses the engine's components and whatever the page passes to `<Deck components>`.
 * Problems never throw: a slide that fails to compile renders its error in place, and every
 * problem comes back as a diagnostic with its line, so an editor (or an agent) can point at it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  /** The file it is in: "deck.mdx", an included file, "glossary.yaml". */
  file: string;
  /** 1-based line, when known. */
  line: number | null;
  /** The flat slide index it belongs to, when it belongs to one. */
  slide: number | null;
}

export interface CompileDeckOptions {
  /** The deck file's name, for diagnostics. Default "deck.mdx". */
  file?: string;
  /** Other files the deck reads by path: `src:` includes, the glossary, `drawings/*.svg`. */
  files?: Record<string, string>;
  shiki?: { light?: string; dark?: string; langs?: string[] };
}

export interface CompiledDeck {
  manifest: DeckManifest;
  diagnostics: Diagnostic[];
  /**
   * Files the deck asked for that were not in `files`: `src:` includes, and a glossary the
   * headmatter names. A caller that can fetch them does, then compiles again.
   */
  missing: string[];
  /** True when nothing reached severity "error". */
  ok: boolean;
}

let highlighter: Promise<Highlighter> | null = null;
let highlighterKey = "";

/** One Shiki per page, with the JavaScript regex engine: no WebAssembly to fetch. */
async function getHighlighter(themes: { light: string; dark: string }, langs: string[]) {
  const key = `${themes.light}|${themes.dark}|${langs.join(",")}`;
  if (!highlighter || key !== highlighterKey) {
    highlighterKey = key;
    highlighter = (async () => {
      const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
        import("shiki"),
        import("shiki/engine/javascript"),
      ]);
      return createHighlighter({
        themes: [themes.light, themes.dark],
        langs,
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      });
    })();
  }
  return highlighter;
}

const renderMath = (tex: string) => renderKatex(tex, { throwOnError: false });

/** A slide that did not compile shows why, where it would have been. */
function errorSlide(message: string, where: string): ComponentType {
  return function SlideError() {
    return createElement(
      "div",
      { className: "deck-compile-error", role: "alert" },
      createElement("strong", null, "This slide did not compile"),
      createElement("code", null, where),
      createElement("pre", null, message),
    );
  };
}

/** Line of an MDX error inside the slide, mapped to the deck file. */
function lineOf(err: unknown, slideLine: number): number | null {
  const place = (err as { place?: { line?: number; start?: { line?: number } } }).place;
  const line = place?.line ?? place?.start?.line;
  // A slide's content starts on the line after its source line's separator/frontmatter; the
  // offset is close enough to land on the right block for an editor's squiggle.
  return typeof line === "number" ? slideLine + line - 1 : slideLine;
}

async function compileToComponent(
  source: string,
  plugins: ReturnType<typeof mdxPlugins>,
): Promise<ComponentType> {
  // Imports cannot resolve without a bundler; say so instead of failing somewhere deeper.
  if (/^\s*import\s/m.test(source.replace(/```[\s\S]*?```/g, "")))
    throw new Error(
      "`import` is not available here: slides compiled in the browser can use the engine's components only.",
    );
  const code = await compile(source, {
    ...plugins,
    outputFormat: "function-body",
    // Any value makes the compiled slide ask `useMDXComponents` (passed to `run`) for its tags.
    providerImportSource: "@kadal/deck/mdx-provider",
    development: false,
    format: "mdx",
  });
  const mod = await run(String(code), {
    ...(jsxRuntime as unknown as Parameters<typeof run>[1]),
    useMDXComponents,
    baseUrl: typeof location === "undefined" ? undefined : location.href,
  });
  return mod.default as ComponentType;
}

/**
 * Compile a whole deck from its text. Every slide and note is compiled up front so the
 * diagnostics are complete when this resolves; the manifest's `load()`s then resolve at once.
 */
export async function compileDeck(
  text: string,
  options: CompileDeckOptions = {},
): Promise<CompiledDeck> {
  const file = options.file ?? "deck.mdx";
  const files = options.files ?? {};
  const diagnostics: Diagnostic[] = [];
  const missing = new Set<string>();
  const push = (d: Omit<Diagnostic, "severity"> & { severity?: Diagnostic["severity"] }) =>
    diagnostics.push({ severity: "error", ...d });

  const themes = {
    light: options.shiki?.light ?? "github-light",
    dark: options.shiki?.dark ?? "github-dark",
  };

  let prepared: { headmatter: Record<string, unknown>; slides: PreparedSlide[] };
  try {
    prepared = prepareDeck(text, {
      file,
      resolveInclude: (path) => {
        const clean = path.replace(/^\.\//, "");
        if (clean in files) return { file: clean, text: files[clean]! };
        missing.add(clean);
        return null;
      },
      onError: (e) => push({ message: e.message, file: e.file, line: e.line, slide: null }),
    });
  } catch (err) {
    push({ message: err instanceof Error ? err.message : String(err), file, line: null, slide: null });
    return {
      manifest: { headmatter: {}, slides: [] },
      diagnostics,
      missing: [...missing],
      ok: false,
    };
  }

  const glossary: DeckGlossary = deckGlossary(
    prepared.headmatter,
    (src) => {
      const clean = src.replace(/^\.\//, "");
      if (clean in files) return { file: clean, text: files[clean]! };
      // The default glossary.yaml is optional; only a glossary the headmatter names is missing.
      if (prepared.headmatter.glossary !== undefined) missing.add(clean);
      return null;
    },
    {
      math: renderMath,
      warn: (message) =>
        push({ severity: "warning", message, file: "glossary.yaml", line: null, slide: null }),
    },
  );

  const hl = await getHighlighter(themes, options.shiki?.langs ?? DEFAULT_LANGS);
  const slides: SlideMeta[] = await Promise.all(
    prepared.slides.map(async (s, i): Promise<SlideMeta> => {
      const where = `${s.source.file}:${s.source.line}`;
      const warn = (message: string) =>
        push({ severity: "warning", message, file: s.source.file, line: s.source.line, slide: i });
      const loose = unclosedSettings(s.content);
      if (loose) warn(unclosedSettingsMessage(loose));
      const build = async (source: string, terms: unknown): Promise<SlideModule> => {
        try {
          const Component = await compileToComponent(
            source,
            mdxPlugins({ highlighter: hl, themes, glossary, terms, math: renderMath, warn }),
          );
          return { default: Component } as SlideModule;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          push({ message, file: s.source.file, line: lineOf(err, s.source.line), slide: i });
          return { default: errorSlide(message, where) } as SlideModule;
        }
      };
      const [slide, notes] = await Promise.all([
        build(s.content, slideTerms(s)),
        s.notes ? build(s.notes, null) : Promise.resolve(null),
      ]);
      let magic: ReturnType<typeof magicMoveData> | null = null;
      if (s.magic.length) {
        try {
          magic = magicMoveData(s.magic, hl, themes);
        } catch (err) {
          push({
            message: `magic move: ${err instanceof Error ? err.message : String(err)}`,
            file: s.source.file,
            line: s.source.line,
            slide: i,
          });
        }
      }
      return {
        index: i,
        h: s.h,
        v: s.v,
        id: typeof s.frontmatter.id === "string" ? s.frontmatter.id : `s${i}`,
        title: titleOf(s),
        level: levelOf(s),
        frontmatter: s.frontmatter,
        hasNotes: !!s.notes,
        text: plainText(s.content),
        notesText: s.notes ? plainText(s.notes) : null,
        source: s.source,
        load: () => Promise.resolve(slide),
        loadNotes: notes ? () => Promise.resolve(notes) : null,
        loadMagic: magic ? () => Promise.resolve({ default: magic! }) : null,
      };
    }),
  );

  return {
    manifest: {
      headmatter: prepared.headmatter,
      slides,
      glossary: glossary.entries,
      // Saved drawings among the files (`drawings/<slide>.svg`): shown under the live strokes.
      drawings: sourceFromFiles(files),
    },
    diagnostics,
    missing: [...missing],
    ok: !diagnostics.some((d) => d.severity === "error"),
  };
}
