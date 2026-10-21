/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT PRETTIER NEVER TOUCHES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Before a slide's body goes to Prettier's Markdown printer, every part of it that is not plain
 * Markdown to the engine is swapped for a one-line placeholder, `<!--kadal-fmt-<nonce>-<n>-->`,
 * at the same indentation, and put back afterwards byte for byte:
 *
 *   ``` / ~~~ fences          code, including ````md magic-move blocks and {monaco} fences
 *   $$ … $$                   display maths (with `$$ {1|3}` steps on the opening line)
 *   <Notes> … </Notes>        speaker notes, as written
 *   <!-- … -->                comments on lines of their own (Slidev's notes among them)
 *   <style> … </style>        slide-scoped CSS
 *   ::name::                  slot markers (two-cols and friends)
 *   ::code-group / ::         code-group openers and closers
 *   <<< @/file#region {2}     snippet imports
 *
 * A placeholder is an HTML comment because CommonMark reads one as a block that may interrupt a
 * paragraph and ends on its own line: Prettier keeps it verbatim, never reflows it into a line of
 * prose, and indents it with the list item it sits in. When Prettier re-indents a list (`-   x`
 * becomes `- x`), the protected lines move with the placeholder, by the same amount.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Segment {
  /** The protected lines, as written. */
  lines: string[];
  /** The first line's indentation (what the placeholder carries). */
  indent: string;
}

export interface Masked {
  text: string;
  segments: Segment[];
  nonce: string;
}

const FENCE = /^(\s*)(`{3,}|~{3,})/;
const SINGLE_LINE: RegExp[] = [
  /^::[a-z][\w-]*::[ \t]*$/, // ::slot:: marker (compiler/slots.ts: column 0)
  /^[ \t]*:{2,}code-group\b/, // code-group opener (compiler/code-groups.ts)
  /^[ \t]*:{2,}[ \t]*$/, // its closer
  /^[ \t]*<<<[ \t]+\S/, // snippet import (compiler/snippets.ts)
];

/** The line index that ends a multi-line protected block starting at `i`, or null if `i` starts none. */
function blockEnd(lines: string[], i: number): number | null {
  const line = lines[i]!;
  const fence = FENCE.exec(line);
  if (fence) {
    const mark = fence[2]!;
    for (let k = i + 1; k < lines.length; k++) {
      const close = /^\s*(`{3,}|~{3,})/.exec(lines[k]!);
      if (close && close[1]![0] === mark[0] && close[1]!.length >= mark.length) return k;
    }
    return lines.length - 1;
  }
  const until = (closing: RegExp, from = i) => {
    for (let k = from; k < lines.length; k++) if (closing.test(lines[k]!)) return k;
    return lines.length - 1;
  };
  const t = line.trimStart();
  if (t.startsWith("$$")) {
    // `$$ x $$` on one line, or `$$ {1|3}` … `$$`.
    if (/\$\$\s*$/.test(t.slice(2))) return i;
    return until(/^\s*\$\$\s*$/, i + 1);
  }
  if (/^<Notes(\s|>|$)/.test(t)) return until(/<\/Notes>/);
  if (/^<style(\s|>|$)/i.test(t)) return until(/<\/style\s*>/i);
  if (t.startsWith("<!--")) return until(/-->/);
  if (SINGLE_LINE.some((re) => re.test(line))) return i;
  return null;
}

/** Swap every protected block for a placeholder line. */
export function mask(body: string, nonce: string): Masked {
  const lines = body.split("\n");
  const out: string[] = [];
  const segments: Segment[] = [];
  for (let i = 0; i < lines.length; i++) {
    const end = blockEnd(lines, i);
    if (end === null) {
      out.push(lines[i]!);
      continue;
    }
    const indent = /^[ \t]*/.exec(lines[i]!)![0];
    segments.push({ lines: lines.slice(i, end + 1), indent });
    out.push(`${indent}<!--kadal-fmt-${nonce}-${segments.length - 1}-->`);
    i = end;
  }
  return { text: out.join("\n"), segments, nonce };
}

/** The placeholder lines' pattern for one nonce. */
export function placeholderPattern(nonce: string): RegExp {
  return new RegExp(`^([ \\t]*)<!--kadal-fmt-${nonce}-(\\d+)-->[ \\t]*$`);
}

/**
 * Put the protected blocks back, re-indented with their placeholder. Null when a placeholder went
 * missing, appeared twice, or ended up inside a line — then the caller keeps the original.
 */
export function unmask(text: string, masked: Masked): string | null {
  const re = placeholderPattern(masked.nonce);
  const seen = new Set<number>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = re.exec(line);
    if (!m) {
      if (line.includes(`<!--kadal-fmt-${masked.nonce}-`)) return null;
      out.push(line);
      continue;
    }
    const n = Number(m[2]);
    const seg = masked.segments[n];
    if (!seg || seen.has(n)) return null;
    seen.add(n);
    const indent = m[1]!;
    for (const l of seg.lines) {
      if (indent === seg.indent) out.push(l);
      else if (l.startsWith(seg.indent)) out.push(indent + l.slice(seg.indent.length));
      else out.push(l.trim() ? l : "");
    }
  }
  return seen.size === masked.segments.length ? out.join("\n") : null;
}
