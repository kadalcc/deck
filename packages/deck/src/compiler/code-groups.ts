/**
 * Slidev's code groups (VitePress's too): fences between `::code-group` and `::` become one block
 * with a tab per fence, each tab named by its fence's title.
 *
 *   ::code-group
 *
 *   ```sh [npm]
 *   npm i @kadal/deck
 *   ```
 *
 *   ```sh [bun]
 *   bun add @kadal/deck
 *   ```
 *
 *   ::
 *
 * Three colons work as well (`:::code-group` … `:::`, the VitePress spelling). Options follow the
 * opener the way they follow a fence: `::code-group {clicks:true}` turns the tabs over one click at
 * a time, `{print:'all'}` prints every tab rather than the open one, `{at:2}` starts the clicks
 * later. The lines become `<CodeGroup …>` and `</CodeGroup>` with blank lines around the fences,
 * so MDX compiles the fences inside as Markdown and `<CodeGroup>` reads their titles.
 *
 * Runs after `::slot::` markers are applied (compiler/slots.ts): a group can sit in a slot, and
 * neither marker can be mistaken for the other — a slot marker ends in `::`, a group's opener
 * never does and its closer has no name.
 */
import { parseLooseObject } from "./code-meta.ts";

const OPEN = /^[ \t]*(:{2,})code-group\b(.*)$/;
const CLOSE = /^[ \t]*(:{2,})[ \t]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

function propsOf(rest: string): string {
  const text = rest.trim().replace(/^\{([\s\S]*)\}$/, "$1");
  if (!text) return "";
  const opts = parseLooseObject(text);
  const out: string[] = [];
  if (opts.clicks === true || opts.clicks === "true") out.push("clicks");
  if (opts.print === "all" || opts.printAll === true) out.push(`print="all"`);
  if (opts.at !== undefined) out.push(`at={${JSON.stringify(String(opts.at))}}`);
  if (typeof opts.active === "number" || /^\d+$/.test(String(opts.active ?? "")))
    out.push(`active={${Number(opts.active)}}`);
  return out.length ? ` ${out.join(" ")}` : "";
}

export function applyCodeGroups(body: string): string {
  if (!/^[ \t]*:{2,}code-group\b/m.test(body)) return body;
  const lines = body.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let open: string | null = null; // the opener's colons
  for (const line of lines) {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1]!;
      else if (f[1]![0] === fence[0] && f[1]!.length >= fence.length && !f[2]!.trim()) fence = null;
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    const o: RegExpExecArray | null = open ? null : OPEN.exec(line);
    if (o) {
      open = o[1]!;
      out.push("", `<CodeGroup${propsOf(o[2]!)}>`, "");
      continue;
    }
    const c: RegExpExecArray | null = open ? CLOSE.exec(line) : null;
    if (c && c[1]!.length >= 2) {
      open = null;
      out.push("", "</CodeGroup>", "");
      continue;
    }
    out.push(line);
  }
  // An opener nobody closed closes at the end of the slide, rather than breaking the MDX.
  if (open) out.push("", "</CodeGroup>", "");
  return out.join("\n");
}
