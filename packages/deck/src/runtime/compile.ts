import { compile, run } from "@mdx-js/mdx";
import { renderToString as renderKatex } from "katex";
import { type ComponentType, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import type { Highlighter, ShikiTransformer } from "shiki";

import { levelOf, titleOf, unclosedSettings, unclosedSettingsMessage } from "../compiler/split.ts";
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
import {
  type CodeThemes,
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
import type { DeckManifest, SlideMeta, SlideModule } from "../core/model.ts";
import { sourceFromFiles } from "../draw/source.ts";
import { dirOf, joinPath } from "../authoring/source.ts";
import { ConflictSlide } from "../react/ConflictCard.tsx";
import { type GrammarLoader, grammarsFor } from "./grammars.ts";
import { type ModuleMap, missingModuleMessage, remarkKitImports } from "./kit-imports.ts";
import { useMDXComponents } from "../react/mdx.tsx";
import { type MarkerBlock, hasConflictMarkers, markerBlocks } from "../sync/markers.ts";
import { applySlideDefaults, slideDefaultLayers } from "../theming/merge.ts";
import {
  type PackageRegistry,
  packageRegistry,
  resolveRuntimePackages,
} from "../theming/registry.ts";

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

/**
 * Besides the files, the same setup hooks the Vite plugin takes (compiler/setup.ts):
 * `remarkPlugins`, `rehypePlugins`, `preprocess`, `katex`, `mermaid`, `withoutNotes`.
 */
export interface CompileDeckOptions extends DeckSetup {
  /** The deck file's name, for diagnostics. Default "deck.mdx". */
  file?: string;
  /** Other files the deck reads by path: `src:` includes, `<<<` snippets, the glossary, `drawings/*.svg`. */
  files?: Record<string, string>;
  /** As `deck({ shiki })`: themes, languages, and transformers after the notation ones. */
  shiki?: { light?: string; dark?: string; langs?: string[]; transformers?: ShikiTransformer[] };
  /**
   * Grammars beyond the defaults (runtime/grammars.ts), by Shiki id or fence name, for the
   * languages in `shiki.langs`: `{ mdx: () => import("shiki/langs/mdx.mjs") }`. A language with
   * no grammar here or among the defaults shows as plain text.
   */
  grammars?: Record<string, GrammarLoader>;
  /** Slide defaults beneath the headmatter's `defaults:` (a theme's), see `prepareDeck`. */
  defaults?: Record<string, unknown> | Array<Record<string, unknown> | null | undefined> | null;
  /**
   * The themes and addons this page bundled, to resolve the headmatter's `theme`, `themes` and
   * `addons` against (theming/registry.ts). Default: the page's registry, which the prebuilt
   * shell fills with every first-party package. An unknown theme falls back to minimal with a
   * warning; `false` skips packages entirely (the headmatter's theme names a stylesheet).
   */
  packages?: PackageRegistry | false;
  /**
   * The deck's own modules, by import key (runtime/kit-imports.ts): a deck's editing kit passes
   * the map its CLI build made, and the slides' `import`s then resolve from it. Without it, a slide
   * with an `import` does not compile (there is no bundler in the page).
   */
  modules?: ModuleMap;
  /**
   * The files a deck's kit carries from its last CLI build for its `<<<` snippet imports
   * (deck-root relative path → text): they are code, outside what the builder edits, so the kit
   * brings them instead. `files` wins over them. With a kit (this or `modules` set), a snippet
   * in neither is an error that says to publish from the CLI, as an unknown import is.
   */
  snippets?: Record<string, string>;
}

/** A merge conflict still in the source (sync/markers.ts), where an editor can settle it. */
export interface CompiledConflict {
  file: string;
  /** The flat index of the slide it is on; null in a file that is not slides (glossary.yaml). */
  slide: number | null;
  /** 1-based line of its `<<<<<<<`. */
  line: number;
  /** Its 0-based position among the file's conflicts: `resolveConflict(text, choice, which)`. */
  which: number;
}

export interface CompiledDeck {
  manifest: DeckManifest;
  diagnostics: Diagnostic[];
  /** Unresolved merge conflicts; each conflicted slide renders as a "Yours / Web" card. */
  conflicts: CompiledConflict[];
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

/**
 * One Shiki per page, with the JavaScript regex engine: no WebAssembly to fetch. Its themes are
 * the deck's pair and whatever the theme menu adds (compiler/code-themes.ts); each is a lazy
 * chunk of Shiki's, fetched only by a deck that names it. Its languages are named one by one
 * (runtime/grammars.ts), so a bundle holding the compiler holds only those grammars.
 */
async function getHighlighter(
  themes: CodeThemes,
  langs: string[],
  grammars: Record<string, GrammarLoader> = {},
) {
  const key = `${codeThemesKey(themes)}|${langs.join(",")}|${Object.keys(grammars).join(",")}`;
  if (!highlighter || key !== highlighterKey) {
    highlighterKey = key;
    highlighter = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, { bundledThemes }] =
        await Promise.all([
          import("shiki/core"),
          import("shiki/engine/javascript"),
          import("shiki/themes"),
        ]);
      const all = bundledThemes as Record<string, () => Promise<unknown>>;
      return createHighlighterCore({
        themes: shikiThemeNames(themes).map((name) => {
          const load = all[name];
          if (!load) throw new Error(`Theme \`${name}\` is not one of Shiki's themes`);
          return load as never;
        }),
        langs: grammarsFor(langs, grammars) as never[],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }) as unknown as Highlighter;
    })();
  }
  return highlighter;
}

const katexRenderer =
  (options: object = {}) =>
  (tex: string) =>
    renderKatex(tex, { throwOnError: false, ...options });

/**
 * TwoSlash needs the TypeScript compiler, which a page compiling decks does not have: `twoslash`
 * blocks render as plain highlighted code here (a built deck has the types), said once a page.
 */
let twoslashNoted = false;
const noteTwoslash = () => {
  if (twoslashNoted) return;
  twoslashNoted = true;
  console.info(
    "[deck] `twoslash` blocks show without type information here: TwoSlash runs when the deck is built with `kadal-deck build` (it needs TypeScript).",
  );
};

/** The folder of a deck-relative path: `slides/a.mdx` → `slides`. */
const folderOf = (file: string) => {
  const i = file.lastIndexOf("/");
  return i < 0 ? "" : file.slice(0, i);
};

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
  format: "mdx" | "md" = "mdx",
  kit?: { modules: ModuleMap; from: string },
): Promise<ComponentType> {
  // Imports cannot resolve without a bundler (or a kit's module map); say so instead of failing
  // somewhere deeper.
  if (!kit && /^\s*import\s/m.test(source.replace(/```[\s\S]*?```/g, "")))
    throw new Error(
      "`import` is not available here: slides compiled in the browser can use the engine's components only.",
    );
  const code = await compile(source, {
    ...plugins,
    ...(kit ? { remarkPlugins: [...(plugins.remarkPlugins ?? []), remarkKitImports(kit)] } : {}),
    outputFormat: "function-body",
    // Any value makes the compiled slide ask `useMDXComponents` (passed to `run`) for its tags.
    providerImportSource: "@kadal/deck/mdx-provider",
    development: false,
    format,
  });
  const mod = await run(String(code), {
    ...(jsxRuntime as unknown as Parameters<typeof run>[1]),
    useMDXComponents,
    baseUrl: typeof location === "undefined" ? undefined : location.href,
    ...(kit ? { __kadalModules: kit.modules } : {}),
  } as Parameters<typeof run>[1]);
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

  let themes = codeThemes(options.shiki, null);

  // A deck's kit: its snippet files, and the sentences for the ones it does not have.
  const kitSnippets = options.snippets ?? (options.modules ? {} : null);
  const notInKit = new Set<string>();

  // Merge conflicts, per file, before anything reads the slides: a conflicted slide is shown as
  // both versions (react/ConflictCard.tsx), never compiled, and the YAML errors its markers cause
  // in a frontmatter block are the conflict's, not reported again.
  const blocksByFile = new Map<string, MarkerBlock[]>();
  for (const [name, body] of [[file, text] as const, ...Object.entries(files)])
    if (typeof body === "string" && hasConflictMarkers(body))
      blocksByFile.set(name, markerBlocks(body));
  const inConflict = (f: string, line: number) =>
    (blocksByFile.get(f) ?? []).some((b) => line - 1 >= b.start && line - 1 <= b.end + 1);
  const conflicts: CompiledConflict[] = [];

  let prepared: { headmatter: Record<string, unknown>; slides: PreparedSlide[]; styles: string };
  try {
    prepared = prepareDeck(text, {
      preprocess: options.preprocess,
      withoutNotes: options.withoutNotes,
      defaults: options.defaults,
      file,
      // Relative to the including file, as the Vite plugin resolves it (slides/a.mdx including
      // ./extras.mdx means slides/extras.mdx).
      resolveInclude: (path, from) => {
        const clean = joinPath(from === file ? "" : dirOf(from), path);
        if (clean in files) return { file: clean, text: files[clean]! };
        missing.add(clean);
        return null;
      },
      onError: (e) => {
        if (!inConflict(e.file, e.line))
          push({ message: e.message, file: e.file, line: e.line, slide: null });
      },
      // `<<<` imports read from `files` too; one that is not there is reported as missing, so a
      // caller that can fetch it (the shell does) fetches it and compiles again.
      snippets: {
        dirOf: (f) => folderOf(f === file ? "" : f.replace(/^\.\//, "")),
        read: (path) => {
          if (path in files) return { path, text: files[path]! };
          if (kitSnippets && Object.hasOwn(kitSnippets, path))
            return { path, text: kitSnippets[path]! };
          missing.add(path);
          return null;
        },
        ...(kitSnippets
          ? {
              missingMessage: (path: string) => {
                const message = missingModuleMessage(path);
                notInKit.add(message);
                return message;
              },
            }
          : {}),
        onProblem: (message, s) =>
          push({
            severity: notInKit.has(message) ? "error" : "warning",
            message,
            file: s.source.file,
            line: s.source.line,
            slide: null,
          }),
      },
    });
  } catch (err) {
    push({
      message: err instanceof Error ? err.message : String(err),
      file,
      line: null,
      slide: null,
    });
    return {
      manifest: { headmatter: {}, slides: [] },
      diagnostics,
      conflicts,
      missing: [...missing],
      ok: false,
    };
  }

  const katex = katexOptions(prepared.headmatter, options);
  const renderMath = katexRenderer(katex);
  const server = plantUmlServer(prepared.headmatter);
  const ruby = notesRuby(prepared.headmatter);
  // The theme and addons, from what this page bundled: their slide defaults go in under every
  // slide's own before anything compiles, and the theme's Shiki themes colour the code.
  const runtimePackages =
    options.packages === false
      ? null
      : await resolveRuntimePackages(prepared.headmatter, options.packages ?? packageRegistry);
  if (runtimePackages) {
    for (const message of runtimePackages.warnings)
      push({ severity: "warning", message, file, line: null, slide: null });
    applySlideDefaults(
      prepared.slides,
      slideDefaultLayers(
        prepared.headmatter,
        runtimePackages.packages.theme,
        runtimePackages.packages.addons,
      ),
    );
    // The themes the deck names colour its code; the first-party ones the menu adds on its own
    // keep the deck's colours (each would add a Shiki theme to every token).
    themes = codeThemes(
      options.shiki,
      runtimePackages.packages.theme,
      runtimePackages.packages.themes.filter((t) => !t.implicit),
    );
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

  const [hl, { notationTransformers }] = await Promise.all([
    getHighlighter(themes, options.shiki?.langs ?? DEFAULT_LANGS, options.grammars),
    import("../compiler/transformers.ts"),
  ]);
  const transformers = [...notationTransformers(), ...(options.shiki?.transformers ?? [])];
  const slides: SlideMeta[] = await Promise.all(
    prepared.slides.map(async (s, i): Promise<SlideMeta> => {
      const where = `${s.source.file}:${s.source.line}`;
      const fileBlocks = blocksByFile.get(s.range.file) ?? [];
      const mine = fileBlocks
        .map((b, block) => ({ b, block }))
        .filter(({ b }) => b.start >= s.range.start && b.start < s.range.end);
      if (mine.length) {
        for (const { b, block } of mine) {
          conflicts.push({ file: s.range.file, slide: i, line: b.start + 1, which: block });
          push({
            message: `Unresolved merge conflict on slide ${i + 1} (${s.range.file}:${b.start + 1})`,
            file: s.range.file,
            line: b.start + 1,
            slide: i,
          });
        }
        const props = {
          file: s.range.file,
          slide: i,
          blocks: mine.map(({ b, block }) => ({
            block,
            line: b.start + 1,
            oursLabel: b.oursLabel,
            theirsLabel: b.theirsLabel,
            ours: b.ours.join("\n"),
            theirs: b.theirs.join("\n"),
          })),
        };
        const Card = () => createElement(ConflictSlide, props);
        return {
          index: i,
          h: s.h,
          v: s.v,
          id: typeof s.frontmatter.id === "string" ? s.frontmatter.id : `s${i}`,
          title: titleOf(s),
          level: levelOf(s),
          frontmatter: s.frontmatter,
          hasNotes: false,
          text: plainText(s.content),
          notesText: null,
          source: s.source,
          load: () => Promise.resolve({ default: Card } as SlideModule),
          loadNotes: null,
          loadMagic: null,
        };
      }
      const warn = (message: string) =>
        push({ severity: "warning", message, file: s.source.file, line: s.source.line, slide: i });
      const loose = unclosedSettings(s.content);
      if (loose) warn(unclosedSettingsMessage(loose));
      const build = async (source: string, terms: unknown, notes = false): Promise<SlideModule> => {
        const plugins = mdxPlugins({
          highlighter: hl,
          themes: shikiThemeOption(themes),
          glossary,
          terms,
          math: renderMath,
          warn,
          katex,
          plantUmlServer: server,
          comark: comarkEnabled(prepared.headmatter),
          ruby: notes ? ruby : null,
          remarkPlugins: options.remarkPlugins,
          rehypePlugins: options.rehypePlugins,
          transformers,
          twoslash: null,
          onTwoslashMissing: noteTwoslash,
        });
        const kit = options.modules ? { modules: options.modules, from: s.source.file } : undefined;
        try {
          const Component = await compileToComponent(source, plugins, "mdx", kit);
          return { default: Component } as SlideModule;
        } catch (err) {
          // Notes written for a Markdown parser (Slidev's) are often not valid MDX: read them as
          // plain Markdown rather than lose them, and say so.
          if (notes) {
            try {
              const Component = await compileToComponent(source, plugins, "md", kit);
              warn(
                `The notes are not valid MDX (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); they were read as plain Markdown.`,
              );
              return { default: Component } as SlideModule;
            } catch {
              /* fall through to the error below */
            }
          }
          const message = err instanceof Error ? err.message : String(err);
          push({ message, file: s.source.file, line: lineOf(err, s.source.line), slide: i });
          return { default: errorSlide(message, where) } as SlideModule;
        }
      };
      const [slide, notes] = await Promise.all([
        build(s.content, slideTerms(s)),
        s.notes ? build(s.notes, null, true) : Promise.resolve(null),
      ]);
      let magic: ReturnType<typeof magicMoveData> | null = null;
      if (s.magic.length) {
        try {
          magic = magicMoveData(s.magic, hl, shikiThemeOption(themes));
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

  // Conflicts outside any slide: the glossary, data, a drawing.
  const slideFiles = new Set(prepared.slides.map((s) => s.range.file));
  for (const [name, blocks] of blocksByFile)
    if (!slideFiles.has(name))
      blocks.forEach((b, block) => {
        conflicts.push({ file: name, slide: null, line: b.start + 1, which: block });
        push({
          message: `Unresolved merge conflict in ${name}:${b.start + 1}`,
          file: name,
          line: b.start + 1,
          slide: null,
        });
      });

  return {
    conflicts,
    manifest: {
      headmatter: manifestHeadmatter(prepared.headmatter, options),
      slides,
      glossary: glossary.entries,
      // The theme menu's code colours ride with the slides' own styles (compiler/code-themes.ts).
      styles: prepared.styles + codeThemeCss(themes),
      codeThemes: themes,
      ...(runtimePackages ? { packages: runtimePackages.packages } : {}),
      // Saved drawings among the files (`drawings/<slide>.svg`): shown under the live strokes.
      drawings: sourceFromFiles(files),
    },
    diagnostics,
    missing: [...missing],
    ok: !diagnostics.some((d) => d.severity === "error"),
  };
}
