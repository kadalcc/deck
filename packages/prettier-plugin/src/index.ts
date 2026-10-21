import type { Parser, Plugin, Printer, SupportOptions } from "prettier";
import * as prettier from "prettier";
import { utils } from "prettier/doc";

import { type DeckFormatOptions, formatDeck } from "./format.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * @kadal/prettier-plugin
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Prettier for Kadal Deck decks. With the plugin loaded, `deck.mdx` and `slides.mdx` are
 * formatted as decks by name — no override needed — and any other file can ask for it:
 *
 *   // .prettierrc
 *   { "plugins": ["@kadal/prettier-plugin"],
 *     "overrides": [{ "files": "talks/*.mdx", "options": { "parser": "kadal-deck" } }] }
 *
 * The parser does the work (format.ts): it cuts the deck the engine's way, formats the YAML and
 * the slide bodies with Prettier's own printers, checks the result means the same, and hands the
 * printer finished text. A deck the checks reject is an error, never a changed deck.
 *
 * `kadalDeckBodies: false` formats the separators and the frontmatter only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface DeckAst {
  type: "kadal-deck";
  text: string;
  source: string;
}

const PARSER = "kadal-deck";

export const languages: Plugin["languages"] = [
  {
    name: "Kadal Deck",
    parsers: [PARSER],
    filenames: ["deck.mdx", "slides.mdx"],
    vscodeLanguageIds: ["kadal-deck"],
  },
];

export const options: SupportOptions = {
  kadalDeckBodies: {
    type: "boolean",
    category: "Kadal Deck",
    default: true,
    description:
      "Format each slide's Markdown too. false: only the separators and the frontmatter.",
  },
};

const parser: Parser<DeckAst> = {
  astFormat: PARSER,
  async parse(text, opts) {
    const o = opts as unknown as DeckFormatOptions & { kadalDeckBodies?: boolean };
    const result = await formatDeck(text, prettier, {
      printWidth: o.printWidth,
      tabWidth: o.tabWidth,
      useTabs: o.useTabs,
      proseWrap: o.proseWrap,
      singleQuote: o.singleQuote,
      bracketSpacing: o.bracketSpacing,
      bodies: o.kadalDeckBodies !== false,
    });
    return { type: "kadal-deck", text: result.text, source: text };
  },
  locStart: () => 0,
  locEnd: (node) => node.source.length,
};

export const parsers: Plugin["parsers"] = { [PARSER]: parser };

const printer: Printer<DeckAst> = {
  // The text is finished; literal lines keep Prettier's endOfLine handling.
  print: (path) => utils.replaceEndOfLine(path.node.text),
};

export const printers: Plugin["printers"] = { [PARSER]: printer };

const plugin: Plugin = { languages, options, parsers, printers };
export default plugin;

export {
  DeckFormatError,
  type DeckFormatOptions,
  type FormatResult,
  type PrettierLike,
  type SlideReport,
  formatDeck,
} from "./format.ts";
export { type Piece, cutDeck } from "./split.ts";
