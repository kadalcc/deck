import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Small pure helpers the extension's VS Code side uses: finding the deck's own CLI, reading the
 * dev server's address from its output, turning `kadal-deck check --json` into problems, and the
 * smallest edit between two texts (so a reorder is one undo step that keeps the cursor).
 */

/** The deck's own `kadal-deck` (node_modules/.bin, up the tree), or null. */
export function localCli(deckDir: string): string | null {
  let dir = deckDir;
  for (;;) {
    const bin = join(
      dir,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "kadal-deck.cmd" : "kadal-deck",
    );
    if (existsSync(bin)) return bin;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const quote = (s: string) => (/^[\w./:@=-]+$/.test(s) ? s : JSON.stringify(s));

/**
 * The command line for `args`: the configured template (`${args}` and `${port}` filled in), the
 * deck's own CLI, or `npx -p @kadal/deck kadal-deck`.
 */
export function cliCommand(
  deckDir: string,
  args: string[],
  { template = "", port }: { template?: string; port?: number } = {},
): string {
  const joined = args.map(quote).join(" ");
  if (template.trim())
    return template.replaceAll("${args}", joined).replaceAll("${port}", String(port ?? ""));
  const local = localCli(deckDir);
  return `${local ? quote(local) : "npx -y -p @kadal/deck kadal-deck"} ${joined}`;
}

/** The dev command: `kadal-deck dev --port N --strictPort`, or the configured template. */
export function devCommand(deckDir: string, port: number, template = ""): string {
  return cliCommand(deckDir, ["dev", "--port", String(port), "--strictPort"], { template, port });
}

// oxlint-disable-next-line no-control-regex -- Vite colours its output
const ANSI = /\u001b\[[0-9;]*m/g;

/** The local URL Vite prints (`➜  Local:   http://localhost:3030/`), or null. */
export function localUrl(output: string): string | null {
  const m = /Local:\s+(https?:\/\/\S+)/.exec(output.replace(ANSI, ""));
  return m ? m[1]!.replace(/\/?$/, "/") : null;
}

export interface CheckDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  /** Relative to the deck folder (as `check --json` prints it) or absolute. */
  file: string;
  /** 0-based. */
  line: number;
  column: number;
  hint?: string;
}

/** `kadal-deck check --json` output → problems, by absolute file. */
export function parseCheck(json: string, deckDir: string): Map<string, CheckDiagnostic[]> {
  const out = new Map<string, CheckDiagnostic[]>();
  let data: { diagnostics?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(json) as typeof data;
  } catch {
    return out;
  }
  for (const d of data.diagnostics ?? []) {
    const rel = String(d.file ?? "deck.mdx");
    const file = rel.startsWith("/") || /^[a-z]:[\\/]/i.test(rel) ? rel : join(deckDir, rel);
    const sev = d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "info";
    const list = out.get(file) ?? [];
    list.push({
      severity: sev,
      code: String(d.code ?? "kadal-deck"),
      message: String(d.message ?? ""),
      file,
      line: Math.max(0, Number(d.line ?? 1) - 1),
      column: Math.max(0, Number(d.column ?? 1) - 1),
      ...(typeof d.hint === "string" ? { hint: d.hint } : {}),
    });
    out.set(file, list);
  }
  return out;
}

/** The one changed span between two texts: offsets in `before`, and what replaces it. */
export function minimalEdit(
  before: string,
  after: string,
): { start: number; end: number; text: string } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  return { start, end: endB, text: after.slice(start, endA) };
}
