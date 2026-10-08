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

const OUTER = /^([ \t]*)````+\s*md\s+magic-move([^\n]*)\n([\s\S]*?)\n\1````+[ \t]*$/gm;
const INNER = /```([\w+-]*)([^\n]*)\n([\s\S]*?)\n```/g;

export function findMagicMoves(text: string): { text: string; blocks: MagicMoveBlock[] } {
  const blocks: MagicMoveBlock[] = [];
  const replaced = text.replace(OUTER, (_m, _indent: string, header: string, body: string) => {
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
    return `\n<MagicMove block={${id}} />\n`;
  });
  return { text: replaced, blocks };
}
