import YAML from "yaml";

import { sameMeaning } from "./guard.ts";
import { mask, unmask } from "./protect.ts";
import { type Piece, cutDeck, isSlide, looksLikeYaml } from "./split.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMATTING A DECK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A deck is cut the engine's way (split.ts) and put back together with one spelling:
 *
 *   ---                      the headmatter: fenced YAML, nothing above it
 *   title: …                 YAML through Prettier's YAML printer — comments kept, keys in the
 *   ---                      order they were written, the values unchanged (checked)
 *
 *   # The first slide        each body through Prettier's Markdown (MDX) printer, with code,
 *                            notes, magic-move, `<style>`, `::slot::` and the other sugar left
 *   ---                      byte for byte (protect.ts), and the result checked to mean the
 *   layout: center           same (guard.ts)
 *   ---                      a separator: exactly `---`, or `----` for a slide beneath
 *                            one blank line around every separator and after every frontmatter
 *   # The next slide         one newline at the end of the file
 *
 * A ```yaml block frontmatter stays a block (its YAML is formatted the same way). A piece the
 * engine skips — nothing in it, no frontmatter — goes. A thematic break Prettier would print as
 * `---` (which would start a slide) is written `***`.
 *
 * Then the whole result is cut again and compared with the original: the same slides, stacked
 * the same way, with the same frontmatter values. If not, nothing is returned but an error — a
 * formatter that changes the deck is worse than none.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The part of Prettier this needs: `format`, so a caller can bring its own copy. */
export interface PrettierLike {
  format(source: string, options: Record<string, unknown>): Promise<string>;
}

/** The Prettier options that reach the YAML and Markdown printers. */
export interface DeckFormatOptions {
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;
  proseWrap?: "always" | "never" | "preserve";
  singleQuote?: boolean;
  bracketSpacing?: boolean;
  /** false: separators and frontmatter only; every body stays as written. Default true. */
  bodies?: boolean;
}

export interface SlideReport {
  /** 0-based slide index (as the engine counts: skipped pieces do not count). */
  slide: number;
  /** 1-based line of the slide in the original text. */
  line: number;
  /** Why the body (or the frontmatter) was left as written. */
  reason: string;
}

export interface FormatResult {
  text: string;
  changed: boolean;
  /** Slides some part of which was deliberately left as written, and why. */
  kept: SlideReport[];
}

export class DeckFormatError extends Error {
  override name = "DeckFormatError";
}

const PASS_THROUGH = [
  "printWidth",
  "tabWidth",
  "useTabs",
  "proseWrap",
  "singleQuote",
  "bracketSpacing",
] as const;

function innerOptions(options: DeckFormatOptions): Record<string, unknown> {
  const out: Record<string, unknown> = { endOfLine: "lf" };
  for (const k of PASS_THROUGH) if (options[k] !== undefined) out[k] = options[k];
  return out;
}

/** Leading and trailing blank lines off; trailing spaces off every line outside protected text. */
const trimLines = (lines: string[]): string[] => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a]!.trim()) a++;
  while (b > a && !lines[b - 1]!.trim()) b--;
  return lines.slice(a, b);
};

async function formatYaml(
  yaml: string,
  kind: "fence" | "block",
  prettier: PrettierLike,
  options: DeckFormatOptions,
): Promise<{ yaml: string; reason: string | null }> {
  const asWritten = trimLines(yaml.split("\n")).join("\n");
  let before: unknown;
  try {
    before = YAML.parse(yaml);
  } catch {
    return { yaml: asWritten, reason: "the frontmatter is not valid YAML" };
  }
  let out: string;
  try {
    out = (await prettier.format(yaml, { ...innerOptions(options), parser: "yaml" })).replace(
      /\n+$/,
      "",
    );
  } catch {
    return { yaml: asWritten, reason: "Prettier could not format the frontmatter" };
  }
  // The values must not change, and `---` fences only hold YAML the engine still reads as YAML.
  let after: unknown;
  try {
    after = YAML.parse(out);
  } catch {
    return { yaml: asWritten, reason: "the formatted frontmatter did not parse" };
  }
  if (JSON.stringify(before) !== JSON.stringify(after))
    return { yaml: asWritten, reason: "formatting would change the frontmatter's values" };
  const lines = out.split("\n");
  if (kind === "fence" && (!looksLikeYaml(lines) || lines.some((l) => /^-{3,}\s*$/.test(l))))
    return { yaml: asWritten, reason: "the formatted frontmatter would not read as frontmatter" };
  return { yaml: out, reason: null };
}

/** A byte-order mark, kept if the file had one. */
const BOM = String.fromCharCode(0xfeff);

let nonceCounter = 0;
const newNonce = () => `${Date.now().toString(36)}${(nonceCounter++).toString(36)}`;

async function formatBody(
  body: string,
  prettier: PrettierLike,
  options: DeckFormatOptions,
): Promise<{ body: string; reason: string | null }> {
  const asWritten = trimLines(body.split("\n")).join("\n");
  if (!asWritten) return { body: "", reason: null };
  if (options.bodies === false) return { body: asWritten, reason: null };
  if (asWritten.includes("prettier-ignore"))
    return { body: asWritten, reason: "it asks Prettier to leave it (prettier-ignore)" };
  const masked = mask(asWritten, newNonce());
  let out: string;
  try {
    out = await prettier.format(masked.text, {
      ...innerOptions(options),
      parser: "mdx",
      // JSX, ESM and code stay as written: the MDX printer reads JSX as MDX 1 did.
      embeddedLanguageFormatting: "off",
    });
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0];
    return { body: asWritten, reason: `Prettier could not parse it (${first})` };
  }
  // A thematic break comes out as `---`, which the engine reads as a separator.
  out = out
    .split("\n")
    .map((l) => (/^-{3,}\s*$/.test(l) ? "***" : l))
    .join("\n")
    .replace(/\n+$/, "");
  const why = sameMeaning(masked.text, out, masked.nonce);
  if (why) return { body: asWritten, reason: why };
  const restored = unmask(out, masked);
  if (restored === null)
    return { body: asWritten, reason: "a protected block could not be put back" };
  return { body: trimLines(restored.split("\n")).join("\n"), reason: null };
}

/** The engine's view of a deck, for the before/after check: slides, stacking, frontmatter. */
function shape(pieces: Piece[]): string {
  const out: unknown[] = [];
  pieces.forEach((p, i) => {
    let fm: unknown = {};
    try {
      fm = p.frontmatter ? (YAML.parse(p.frontmatter.yaml) ?? {}) : {};
    } catch {
      fm = "invalid";
    }
    const keys = fm && typeof fm === "object" ? Object.keys(fm).length : 1;
    if (!isSlide(p, i, keys)) return;
    out.push([i === 0 ? "head" : p.vertical ? "v" : "h", p.frontmatter?.kind ?? null, fm]);
  });
  return JSON.stringify(out);
}

/**
 * Format a deck's text. `prettier` is Prettier itself (or anything with its `format`). Throws a
 * `DeckFormatError` when the result would not be the same deck — which the checks make a bug
 * report, never a silent change.
 */
export async function formatDeck(
  source: string,
  prettier: PrettierLike,
  options: DeckFormatOptions = {},
): Promise<FormatResult> {
  const bom = source.startsWith(BOM) ? BOM : "";
  const text = (bom ? source.slice(1) : source).replace(/\r\n?/g, "\n");
  const pieces = cutDeck(text);
  const kept: SlideReport[] = [];
  const parts: string[] = [];
  let slide = 0;

  for (const [i, piece] of pieces.entries()) {
    let keys = 0;
    try {
      const v = piece.frontmatter ? YAML.parse(piece.frontmatter.yaml) : null;
      keys = v && typeof v === "object" ? Object.keys(v).length : 0;
    } catch {
      keys = 1;
    }
    const counts = isSlide(piece, i, keys);
    // A piece the engine skips (nothing in it) is dropped — unless it is the head with headmatter.
    if (!counts && !(i === 0 && piece.frontmatter)) continue;
    const report = (reason: string) => kept.push({ slide, line: piece.line + 1, reason });

    const lines: string[] = [];
    if (piece.frontmatter) {
      const fm = await formatYaml(
        piece.frontmatter.yaml,
        piece.frontmatter.kind,
        prettier,
        options,
      );
      if (fm.reason) report(fm.reason);
      const yaml = fm.yaml ? fm.yaml.split("\n") : [];
      if (piece.frontmatter.kind === "fence")
        lines.push(i === 0 ? "---" : piece.vertical ? "----" : "---", ...yaml, "---");
      else
        lines.push(
          piece.vertical ? "----" : "---",
          "",
          piece.frontmatter.open.trim(),
          ...yaml,
          piece.frontmatter.close.trim(),
        );
    } else if (i > 0) lines.push(piece.vertical ? "----" : "---");

    const body = await formatBody(piece.body.join("\n"), prettier, options);
    if (body.reason) report(`the body is left as written: ${body.reason}`);
    if (body.body) {
      if (lines.length) lines.push("");
      lines.push(...body.body.split("\n"));
    }
    parts.push(lines.join("\n"));
    if (counts) slide++;
  }

  const out = `${bom}${parts.join("\n\n")}\n`;
  const before = shape(pieces);
  const after = shape(cutDeck(out.slice(bom.length)));
  if (before !== after)
    throw new DeckFormatError(
      "Formatting would change the deck's slides or their frontmatter, so nothing was changed. Please report this deck at https://github.com/kadalcc/deck/issues.",
    );
  return { text: out, changed: out !== source, kept };
}
