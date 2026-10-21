import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { placeholderPattern } from "./protect.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GUARD: formatting may change how a slide is written, never what it says
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Prettier's Markdown printer reads MDX the way MDX 1 did; the engine compiles MDX 3. So every
 * formatted body is parsed again, before and after, and compared as a syntax tree with the
 * positions dropped and runs of whitespace in text folded (whitespace between words is not
 * meaning in a slide; inside code it is, and code never reaches Prettier at all):
 *
 *   1. as CommonMark + GFM + maths — always;
 *   2. as MDX 3 + GFM + maths (what the engine compiles) — whenever the original parses as MDX 3.
 *
 * Any difference and the body stays exactly as written; the caller reports which slide and why.
 * The placeholders protect.ts left are HTML comments: MDX 3 cannot take those, so for the second
 * parse each becomes an MDX comment expression on a line of its own, the same way in both texts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Node = { type: string; children?: Node[]; position?: unknown; [key: string]: unknown };

const commonmark = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const mdx = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(remarkMath);

/** Any value without the positions (and parser data) nested in it: JSX attributes carry both. */
function bare(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(bare);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v)
      .filter(([k]) => k !== "position" && k !== "data")
      .map(([k, x]) => [k, bare(x)]),
  );
}

/** A tree as plain data: no positions, whitespace folded in text and HTML. */
function plain(node: Node): unknown {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "position" || k === "data") continue;
    if (k === "children") continue;
    if (k === "value" && typeof v === "string" && (node.type === "text" || node.type === "html"))
      out[k] = v.replace(/\s+/g, " ").trim();
    else out[k] = bare(v);
  }
  if (node.children) {
    // Adjacent text nodes (an escape can split one) count as one.
    const kids: unknown[] = [];
    for (const c of node.children) {
      const p = plain(c) as { type: string; value?: string };
      const last = kids[kids.length - 1] as { type: string; value?: string } | undefined;
      if (p.type === "text" && last?.type === "text")
        last.value = `${last.value ?? ""} ${p.value ?? ""}`.replace(/\s+/g, " ").trim();
      else kids.push(p);
    }
    out.children = kids;
  }
  return out;
}

function parse(processor: typeof commonmark, text: string): string | null {
  try {
    return JSON.stringify(plain(processor.parse(text) as unknown as Node));
  } catch {
    return null;
  }
}

/** Placeholders as MDX comment expressions on lines of their own (blank lines around). */
function forMdx(text: string, nonce: string): string {
  const re = placeholderPattern(nonce);
  return text
    .split("\n")
    .map((line) => {
      const m = re.exec(line);
      return m ? `\n${m[1]}{/* kadal ${m[2]} */}\n` : line;
    })
    .join("\n");
}

/**
 * Whether `after` says what `before` says (both masked with the same nonce). Returns null when it
 * does, or the reason it does not.
 */
export function sameMeaning(before: string, after: string, nonce: string): string | null {
  const a = parse(commonmark, before);
  const b = parse(commonmark, after);
  if (a === null || b === null || a !== b) return "the Markdown would read differently";
  const am = parse(mdx, forMdx(before, nonce));
  if (am === null) return null; // not MDX 3 as written: the CommonMark check is all there is
  const bm = parse(mdx, forMdx(after, nonce));
  if (bm === null) return "the formatted MDX would not compile";
  if (am !== bm) return "the MDX would read differently";
  return null;
}
