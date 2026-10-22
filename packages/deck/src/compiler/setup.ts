import type { CompileOptions } from "@mdx-js/mdx";
import type { Options as RehypeKatexOptions } from "rehype-katex";

import { DEFAULT_PLANTUML_SERVER } from "./plantuml.ts";
import type { Frontmatter } from "./split.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP HOOKS: what a deck adds to the compiler, and the frontmatter every slide shares
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev's `setup/*.ts` files, as options — the same ones for the Vite plugin and the runtime
 * compiler, so a deck compiled in the browser comes out like one built by `kadal-deck build`:
 *
 *   deck({
 *     remarkPlugins: [remarkEmoji],          after GFM and maths, before the deck's own passes
 *     rehypePlugins: [rehypeSlug],           after highlighting, KaTeX and the glossary
 *     preprocess: (text, file) => text,      each file's raw text, before it is cut into slides
 *     katex: { macros: { "\\RR": "\\mathbb{R}" }, strict: false },
 *     mermaid: { theme: "forest", look: "handDrawn" },
 *     withoutNotes: true,                    build without speaker notes (`--without-notes`)
 *   })
 *
 * A hosted deck has no vite.config.ts, so the two that matter most there are headmatter keys
 * too, which win over the plugin's: `katex: { macros: … }` and `mermaid: { … }`.
 *
 * `defaults:` in the headmatter is frontmatter for every slide that does not set the key itself
 * (Slidev's `defaults`). Themes bring defaults of their own, below the deck's: whoever resolves
 * the theme passes them to `slideDefaults` (the `defaults` option of `prepareDeck`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type KatexOptions = RehypeKatexOptions;
/** A list of unified plugins, as MDX takes them (`[plugin]` or `[plugin, options]`). */
export type PluggableList = NonNullable<CompileOptions["remarkPlugins"]>;

export interface DeckSetup {
  /** Remark plugins, run after GFM and maths and before the deck's own remark passes. */
  remarkPlugins?: PluggableList;
  /** Rehype plugins, run after code highlighting, KaTeX and the glossary. */
  rehypePlugins?: PluggableList;
  /** Rewrites each file's text (deck.mdx and every include) before it is cut into slides. */
  preprocess?: (text: string, file: string) => string;
  /** KaTeX options (macros, strict, trust…); the headmatter's `katex:` is merged over them. */
  katex?: KatexOptions;
  /** Mermaid configuration for every diagram; the headmatter's `mermaid:` is merged over it. */
  mermaid?: Record<string, unknown>;
  /** Leave the speaker notes out: no notes modules, `hasNotes` false, `notesText` null. */
  withoutNotes?: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** The KaTeX options for this deck: the setup's, then the headmatter's; macros merge. */
export function katexOptions(headmatter: Frontmatter, setup: DeckSetup = {}): KatexOptions {
  const own = isObject(headmatter.katex) ? (headmatter.katex as KatexOptions) : {};
  const macros = {
    ...(isObject(setup.katex?.macros) ? setup.katex!.macros : {}),
    ...(isObject(own.macros) ? own.macros : {}),
  };
  return { ...setup.katex, ...own, macros };
}

/**
 * Fresh options for one compile: KaTeX writes `\gdef` macros into the object it is given, and
 * one slide's definitions must not leak into the next slide's build.
 */
export const freshKatex = (o: KatexOptions): KatexOptions => ({
  ...o,
  macros: { ...(o.macros as Record<string, string> | undefined) },
});

/** The Mermaid configuration for this deck: the setup's, then the headmatter's. */
export function mermaidConfig(
  headmatter: Frontmatter,
  setup: DeckSetup = {},
): Record<string, unknown> {
  return { ...setup.mermaid, ...(isObject(headmatter.mermaid) ? headmatter.mermaid : {}) };
}

/** The headmatter the manifest carries: the plugin's Mermaid config folded in, for the runtime. */
export function manifestHeadmatter(headmatter: Frontmatter, setup: DeckSetup = {}): Frontmatter {
  if (!setup.mermaid || !Object.keys(setup.mermaid).length) return headmatter;
  return { ...headmatter, mermaid: mermaidConfig(headmatter, setup) };
}

/** The deck's PlantUML server (`plantUmlServer`), without a trailing slash. */
export function plantUmlServer(headmatter: Frontmatter): string {
  const s = headmatter.plantUmlServer;
  return typeof s === "string" && /^https?:\/\//.test(s.trim())
    ? s.trim().replace(/\/+$/, "")
    : DEFAULT_PLANTUML_SERVER;
}

/** Comark (formerly MDC) syntax on: `comark: true`, or Slidev's older spelling `mdc: true`. */
export function comarkEnabled(headmatter: Frontmatter): boolean {
  return headmatter.comark === true || headmatter.mdc === true;
}

/** `notesAutoRuby`, or null without one. */
export function notesRuby(headmatter: Frontmatter): Record<string, string> | null {
  const r = headmatter.notesAutoRuby;
  if (!isObject(r)) return null;
  const out = Object.fromEntries(
    Object.entries(r).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  return Object.keys(out).length ? out : null;
}

/**
 * The frontmatter every slide starts from: each layer in turn (a theme's defaults first), then
 * the headmatter's `defaults:`. A slide's own keys win over all of them.
 */
export function slideDefaults(
  headmatter: Frontmatter,
  ...layers: Array<Frontmatter | null | undefined>
): Frontmatter {
  const own = isObject(headmatter.defaults) ? headmatter.defaults : {};
  return Object.assign({}, ...layers.filter(isObject), own) as Frontmatter;
}

/** A slide's frontmatter over the defaults (shallow, as Slidev merges them). */
export function withDefaults(frontmatter: Frontmatter, defaults: Frontmatter): Frontmatter {
  if (!Object.keys(defaults).length) return frontmatter;
  return { ...defaults, ...frontmatter };
}
