import type { CompileOptions } from "@mdx-js/mdx";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Highlighter } from "shiki";
import { codeToKeyedTokens } from "shiki-magic-move/core";

import type { MagicMoveData } from "../core/model.ts";
import {
  DEFAULT_GLOSSARY,
  type GlossaryEntry,
  type GlossaryOptions,
  type TermMatcher,
  buildMatcher,
  glossaryOptions,
} from "../glossary/model.ts";
import { parseGlossary } from "../glossary/parse.ts";
import { parseCodeMeta, serialiseSteps } from "./code-meta.ts";
import { type MagicMoveBlock, findMagicMoves } from "./magic-move.ts";
import { rehypeDeckCode } from "./rehype-code.ts";
import { rehypeGlossary } from "./rehype-glossary.ts";
import { remarkDeckFences } from "./remark-fences.ts";
import { rehypeAutoRuby } from "./rehype-ruby.ts";
import {
  type KatexOptions,
  type PluggableList,
  freshKatex,
  slideDefaults,
  withDefaults,
} from "./setup.ts";
import { deckStylesheet } from "./slide-style.ts";
import { applySlots } from "./slots.ts";
import { type Frontmatter, type RawSlide, type SplitOptions, splitDeck } from "./split.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK PIPELINE, without a file system
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * deck.mdx → slides → MDX options, as pure functions. The Vite plugin (Node, files on disk) and
 * the runtime compiler (the browser, a string from an editor or a fetch) both run this, so a deck
 * built by `kadal-deck build` and the same deck compiled in a page come out alike.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PreparedSlide = RawSlide & { magic: MagicMoveBlock[] };

export interface PreparedDeck {
  headmatter: Record<string, unknown>;
  slides: PreparedSlide[];
  /** Every slide's `<style>` blocks as one stylesheet, scoped per slide ("" without any). */
  styles: string;
}

export interface PrepareOptions extends SplitOptions {
  /**
   * Slide defaults beneath the headmatter's `defaults:` — a theme's (`kadal.theme.defaults`).
   * Several layers apply in order; the deck's own `defaults:` and each slide's keys win.
   */
  defaults?: Frontmatter | Array<Frontmatter | null | undefined> | null;
  /** Drop every slide's notes (`--without-notes`). */
  withoutNotes?: boolean;
}

/**
 * Split, then give every slide the deck's `defaults`, apply `::slot::` markers and lift
 * magic-move blocks out of every slide.
 */
export function prepareDeck(text: string, options: PrepareOptions): PreparedDeck {
  const split = splitDeck(text, options);
  const layers = Array.isArray(options.defaults) ? options.defaults : [options.defaults];
  const defaults = slideDefaults(split.headmatter, ...layers);
  const slides = split.slides.map((s) => {
    const { text: content, blocks } = findMagicMoves(applySlots(s.content));
    return {
      ...s,
      frontmatter: withDefaults(s.frontmatter, defaults),
      notes: options.withoutNotes ? null : s.notes,
      content,
      magic: blocks,
    };
  });
  return { headmatter: split.headmatter, slides, styles: deckStylesheet(slides) };
}

export interface DeckGlossary {
  options: GlossaryOptions;
  entries: GlossaryEntry[];
  matcher: TermMatcher;
}

/**
 * The deck's glossary from its headmatter: `read` returns the text of the glossary file at the
 * resolved path, or null when there is none. A missing default file is not worth a warning.
 */
export function deckGlossary(
  headmatter: Record<string, unknown>,
  read: (src: string) => { file: string; text: string } | null,
  options: { math?: (tex: string) => string; warn?: (message: string) => void } = {},
): DeckGlossary & { file: string | null } {
  const opts = glossaryOptions(headmatter.glossary);
  let entries: GlossaryEntry[] = [];
  let file: string | null = null;
  if (opts.src) {
    const found = read(opts.src);
    if (found) {
      file = found.file;
      const parsed = parseGlossary(found.text, found.file, options.math);
      entries = parsed.entries;
      for (const w of parsed.warnings) options.warn?.(`glossary: ${w}`);
    } else if (opts.src !== DEFAULT_GLOSSARY.src) {
      options.warn?.(`glossary: ${opts.src} does not exist`);
    }
  }
  return { options: opts, entries, matcher: buildMatcher(entries), file };
}

export interface MdxPipelineOptions {
  highlighter: Highlighter;
  themes: { light: string; dark: string };
  glossary: DeckGlossary;
  /** The slide's own `terms` frontmatter; null compiles without the glossary (notes). */
  terms: unknown;
  math: (tex: string) => string;
  warn: (message: string) => void;
  /** KaTeX options (the deck's `katex:` over the setup's); copied for every compile. */
  katex?: KatexOptions;
  /** The headmatter's `plantUmlServer`, for ```plantuml fences. */
  plantUmlServer?: string;
  /** `notesAutoRuby` (notes only: pass it when compiling notes). */
  ruby?: Record<string, string> | null;
  /** The deck's own remark plugins, after GFM and maths, before the deck's fences. */
  remarkPlugins?: PluggableList;
  /** The deck's own rehype plugins, after everything of the engine's. */
  rehypePlugins?: PluggableList;
}

/** The remark and rehype passes every slide (and every note) compiles with. */
export function mdxPlugins(
  o: MdxPipelineOptions,
): Pick<CompileOptions, "remarkPlugins" | "rehypePlugins"> {
  const { options: g, matcher } = o.glossary;
  const terms = o.terms;
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
              math: o.math,
              warn: o.warn,
            },
          ] as [typeof rehypeGlossary, Parameters<typeof rehypeGlossary>[0]],
        ];
  return {
    remarkPlugins: [
      remarkGfm,
      remarkMath,
      ...(o.remarkPlugins ?? []),
      [
        remarkDeckFences,
        {
          plantUmlServer: o.plantUmlServer,
          warn: (m: string, line?: number) => o.warn(line ? `line ${line}: ${m}` : m),
        },
      ],
    ],
    rehypePlugins: [
      [rehypeKatex, freshKatex(o.katex ?? {})],
      [rehypeDeckCode, { highlighter: o.highlighter, themes: o.themes }],
      ...glossaryPass,
      ...(o.ruby
        ? [
            [rehypeAutoRuby, { ruby: o.ruby }] as [
              typeof rehypeAutoRuby,
              { ruby: Record<string, string> },
            ],
          ]
        : []),
      ...(o.rehypePlugins ?? []),
    ],
  };
}

/** A slide's magic-move steps with their keyed tokens, precomputed for both themes. */
export function magicMoveData(
  blocks: MagicMoveBlock[],
  hl: Highlighter,
  themes: { light: string; dark: string },
): MagicMoveData[] {
  return blocks.map((block) => ({
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
}

/** `terms` as a slide's frontmatter gives it, defaulting to on. */
export const slideTerms = (s: RawSlide): unknown =>
  s.frontmatter.terms === undefined ? true : s.frontmatter.terms;
