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
import { applySlots } from "./slots.ts";
import { type RawSlide, type SplitOptions, splitDeck } from "./split.ts";

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
}

/** Split, then apply `::slot::` markers and lift magic-move blocks out of every slide. */
export function prepareDeck(text: string, options: SplitOptions): PreparedDeck {
  const split = splitDeck(text, options);
  const slides = split.slides.map((s) => {
    const { text: content, blocks } = findMagicMoves(applySlots(s.content));
    return { ...s, content, magic: blocks };
  });
  return { headmatter: split.headmatter, slides };
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
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [
      rehypeKatex,
      [rehypeDeckCode, { highlighter: o.highlighter, themes: o.themes }],
      ...glossaryPass,
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
