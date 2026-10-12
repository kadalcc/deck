/**
 * Shiki Magic Move, the Slidev syntax: a Markdown fence of four backticks with the language `md`
 * and the word `magic-move`, holding one code fence per step. The block morphs from step to step
 * on each click, Keynote-style. We find the block in the raw slide text (before MDX sees it),
 * precompute the keyed tokens for every step at build time with shiki-magic-move's core, and hand
 * the slide a `<MagicMove steps={…} />` in its place — the runtime then animates without shipping
 * a highlighter to the browser.
 */

export interface MagicMoveStep {
  code: string;
  lang: string;
  /** The fence meta, e.g. `{1|2-3}{lines:true}` — highlight steps within this step. */
  meta: string;
}

export interface MagicMoveBlock {
  /** `{at:4, lines: true, duration: 500}`-style options on the outer fence. */
  options: Record<string, string>;
  title: string | null;
  steps: MagicMoveStep[];
}

const INNER = /```([\w+-]*)([^\n]*)\n([\s\S]*?)\n```/g;
const OPEN = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/**
 * Fences are walked in order, so a block is only lifted when it is a fence of its own. A slide
 * that SHOWS the magic-move syntax — inside a longer fence, as this engine's own tour does — keeps
 * it as text; a pattern matched anywhere in the slide turned that example into a live block.
 */
export function findMagicMoves(text: string): { text: string; blocks: MagicMoveBlock[] } {
  const blocks: MagicMoveBlock[] = [];
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]!);
    if (!open) {
      out.push(lines[i]!);
      continue;
    }
    const mark = open[1]!;
    const closing = new RegExp(`^[ \\t]*\\${mark[0]}{${mark.length},}[ \\t]*$`);
    let j = i + 1;
    while (j < lines.length && !closing.test(lines[j]!)) j++;
    const magic = mark[0] === "`" && mark.length >= 4 && /^\s*md\s+magic-move/.exec(open[2]!);
    if (!magic || j >= lines.length) {
      out.push(...lines.slice(i, j + 1));
      i = j;
      continue;
    }
    const header = open[2]!.replace(/^\s*md\s+magic-move/, "");
    const body = lines.slice(i + 1, j).join("\n");
    const options: Record<string, string> = {};
    const braces = /\{([^}]*)\}/.exec(header);
    if (braces) {
      for (const pair of braces[1]!.split(",")) {
        const kv = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(pair);
        if (kv) options[kv[1]!] = kv[2]!.replace(/^['"]|['"]$/g, "");
      }
    }
    const title = /\[([^\]]+)\]/.exec(header);
    const steps: MagicMoveStep[] = [];
    for (const m of body.matchAll(INNER)) {
      steps.push({ lang: m[1] || "text", meta: m[2]!.trim(), code: m[3]! });
    }
    const id = blocks.length;
    blocks.push({ options, title: title ? title[1]!.trim() : null, steps });
    out.push("", `<MagicMove block={${id}} />`, "");
    i = j;
  }
  return { text: out.join("\n"), blocks };
}
