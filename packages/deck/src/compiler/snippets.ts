/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SNIPPET IMPORTS: `<<< @/snippets/tide.ts#ask {2,3|5} [tide.ts]`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev's (and VitePress's) way of keeping the code on a slide the same as the code in the repo:
 * a line that starts with `<<<` names a file, and becomes a code fence holding that file — or one
 * region of it — before MDX sees the slide.
 *
 *   <<< @/snippets/tide.ts                    `@` is the deck's folder (where deck.mdx is)
 *   <<< ./tide.ts                             relative to the file the slide is written in
 *   <<< @/snippets/tide.ts#ask                only the `#region ask` … `#endregion` part
 *   <<< @/snippets/tide.js ts                 a language other than the extension's
 *   <<< @/snippets/tide.ts {2,3|5}{lines:true} [tide.ts]
 *                                             anything after it is fence meta, as on a fence
 *   <<< @/snippets/tide.ts {monaco-write}     an editor that saves back to the file (dev only)
 *
 * A region is marked in whatever comment the language has — `// #region ask`, `# region ask`,
 * `<!-- #region ask -->`, `/* #region ask *\/`, `-- #region ask`, C#'s `#region ask` — and ends at
 * the matching `#endregion`. Marker lines inside it are dropped and the region is dedented, so
 * an excerpt from the middle of a class reads as if it were written for the slide.
 *
 * The fence that comes out carries `kadal-snippet="path#region"` in its meta: the editor's save
 * (`{monaco-write}`) needs to know where the code came from. Reading is the caller's business —
 * the Vite plugin reads the disk and watches the file, the runtime compiler looks in its `files`
 * map and reports the path as missing (the shell then fetches it and compiles again). A file that
 * cannot be read, or a region that is not in it, becomes a notice on the slide, never a crash.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SnippetSource {
  /** The path the deck's tools use for the file: deck-root relative, POSIX (`snippets/tide.ts`). */
  path: string;
  text: string;
}

/**
 * Read one snippet. `path` is already resolved: deck-root relative, no `@/` and no `./` left.
 * Null when there is no such file.
 */
export type SnippetReader = (path: string) => SnippetSource | null;

export interface SnippetImport {
  /** As written after `<<<`. */
  spec: string;
  /** Deck-root relative. */
  path: string;
  region: string | null;
  lang: string;
  meta: string;
}

const LINE = /^([ \t]*)<<<[ \t]+(\S+)(.*)$/;
const OPEN = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/** File extensions whose Shiki language is not the extension itself. */
const EXT_LANG: Record<string, string> = {
  mts: "ts",
  cts: "ts",
  mjs: "js",
  cjs: "js",
  py: "python",
  rs: "rust",
  rb: "ruby",
  kt: "kotlin",
  kts: "kotlin",
  yml: "yaml",
  sh: "bash",
  zsh: "bash",
  md: "md",
  mdx: "mdx",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  ps1: "powershell",
  htm: "html",
  txt: "text",
};

export function langOfPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (base === "Dockerfile") return "docker";
  if (base === "Makefile") return "make";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "text";
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_LANG[ext] ?? ext;
}

/** `a/b` + `../c/d.ts` → `c/d.ts`; POSIX, `.` and `..` folded, never above the root. */
export function normalisePath(dir: string, rel: string): string {
  const parts = `${dir ? `${dir}/` : ""}${rel}`.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else out.push(p);
  }
  return out.join("/");
}

/**
 * Where a spec points, deck-root relative: `@/x` from the deck's folder, anything else from the
 * folder of `fromDir` (the deck-root relative folder of the file the slide is written in).
 */
export function resolveSnippetPath(spec: string, fromDir: string): string {
  if (spec.startsWith("@/")) return normalisePath("", spec.slice(2));
  if (spec.startsWith("/")) return normalisePath("", spec.slice(1));
  return normalisePath(fromDir, spec);
}

/** Read the `<<<` line's parts; null when the line is not one. */
export function parseSnippetLine(line: string, fromDir = ""): SnippetImport | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const raw = m[2]!;
  const hash = raw.indexOf("#");
  const spec = hash < 0 ? raw : raw.slice(0, hash);
  const region = hash < 0 ? null : raw.slice(hash + 1) || null;
  let rest = m[3]!.trim();
  // A language word may come first: anything not starting a meta group.
  let lang: string | null = null;
  const word = /^([\w+#.-]+)(?=\s|$)/.exec(rest);
  if (word && !/^(twoslash|data-)/.test(word[1]!)) {
    lang = word[1]!;
    rest = rest.slice(word[0].length).trim();
  }
  const path = resolveSnippetPath(spec, fromDir);
  return { spec: raw, path, region, lang: lang ?? langOfPath(spec), meta: rest };
}

const MARKER =
  /^\s*(?:\/\/+|\/\*+|#+|<!--|--|;+|%+|'|REM\b|\{\/\*)?\s*#?\s*(end\s*region|region)\b[ \t]*([^\s*]*?)?\s*(?:\*+\/\}?|-->)?\s*$/i;

/** A region marker line: `{ end: false, name: "ask" }`, or null. */
export function regionMarker(line: string): { end: boolean; name: string } | null {
  const m = MARKER.exec(line);
  if (!m) return null;
  return { end: /^end/i.test(m[1]!), name: (m[2] ?? "").trim() };
}

export interface Extracted {
  code: string;
  /** 0-based line range of the region's body in the file (exclusive end); the whole file without one. */
  start: number;
  end: number;
  /** The indentation taken off every line, put back on a save. */
  indent: string;
  /** The region held markers of its own, which the excerpt does not show: it cannot be saved back. */
  nested: boolean;
}

/** The region `name` of a file's text (or all of it when name is null); null when it is not there. */
export function extractRegion(text: string, name: string | null): Extracted | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (name === null) {
    // The whole file, as it is: a save must write back exactly what is shown.
    const body = text.replace(/\r\n/g, "\n").replace(/\n$/, "");
    return { code: body, start: 0, end: lines.length, indent: "", nested: false };
  }
  const startAt = lines.findIndex((l) => {
    const m = regionMarker(l);
    return !!m && !m.end && m.name === name;
  });
  if (startAt < 0) return null;
  let depth = 1;
  let endAt = lines.length;
  let nested = false;
  for (let i = startAt + 1; i < lines.length; i++) {
    const m = regionMarker(lines[i]!);
    if (!m) continue;
    if (!m.end) {
      depth++;
      nested = true;
      continue;
    }
    if (m.name === name || --depth === 0) {
      endAt = i;
      break;
    }
    nested = true;
  }
  const body = lines.slice(startAt + 1, endAt).filter((l) => !regionMarker(l));
  const indent = commonIndent(body);
  return {
    code: body.map((l) => l.slice(indent.length)).join("\n"),
    start: startAt + 1,
    end: endAt,
    indent,
    nested,
  };
}

function commonIndent(lines: string[]): string {
  let best: string | null = null;
  for (const l of lines) {
    if (!l.trim()) continue;
    const ind = /^[ \t]*/.exec(l)![0];
    if (best === null || ind.length < best.length) best = ind;
  }
  return best ?? "";
}

/**
 * The file's text with region `name` replaced by `code` (re-indented as it was), or the whole file
 * when name is null. Null when the region is gone or holds markers the excerpt did not show.
 */
export function replaceRegion(text: string, name: string | null, code: string): string | null {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = code.replace(/\r\n/g, "\n");
  if (name === null) {
    const trailing = /\r?\n$/.test(text) ? eol : "";
    return body.split("\n").join(eol) + trailing;
  }
  const found = extractRegion(text, name);
  if (!found || found.nested) return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const next = body.split("\n").map((l) => (l.trim() ? found.indent + l : l));
  lines.splice(found.start, found.end - found.start, ...next);
  return lines.join(eol);
}

function fenceFor(code: string, min = 3): string {
  let longest = 0;
  for (const m of code.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(min, longest + 1));
}

function notice(indent: string, message: string, path: string | null): string[] {
  const code = path === null ? "" : ` <code>{${JSON.stringify(path)}}</code>`;
  return [
    "",
    `${indent}<div className="deck-notice deck-snippet-missing" role="note">{${JSON.stringify(message)}}${code}</div>`,
    "",
  ];
}

export interface ExpandResult {
  text: string;
  /** Every snippet read (deck-root relative), for watching. */
  used: string[];
  /** Snippets that could not be read: the file is missing. */
  missing: string[];
  problems: string[];
}

/**
 * Replace every `<<<` line of a slide (outside code fences — a slide that SHOWS the syntax keeps
 * it — but inside a magic-move block, whose steps may be snippets too) with the fence it means.
 * `fromDir` is the deck-root relative folder of the file the slide comes from. `missingMessage`
 * words a file that is not there (a deck's kit says it was not in the last CLI build).
 */
export function expandSnippets(
  text: string,
  fromDir: string,
  read: SnippetReader,
  missingMessage?: (path: string) => string,
): ExpandResult {
  const used: string[] = [];
  const missing: string[] = [];
  const problems: string[] = [];
  if (!text.includes("<<<")) return { text, used, missing, problems };
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: { mark: string; magic: boolean } | null = null;
  for (const line of lines) {
    const open = OPEN.exec(line);
    if (open) {
      const mark = open[1]!;
      if (!fence) {
        fence = { mark, magic: mark.length >= 4 && /^\s*md\s+magic-move/.test(open[2]!) };
        out.push(line);
        continue;
      }
      if (mark[0] === fence.mark[0] && mark.length >= fence.mark.length && !open[2]!.trim()) {
        fence = null;
        out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }
    if (fence && !fence.magic) {
      out.push(line);
      continue;
    }
    const imp = parseSnippetLine(line, fromDir);
    if (!imp) {
      out.push(line);
      continue;
    }
    const indent = /^[ \t]*/.exec(line)![0];
    const file = read(imp.path);
    if (!file) {
      missing.push(imp.path);
      const said = missingMessage?.(imp.path);
      problems.push(said ?? `snippet ${imp.spec}: ${imp.path} could not be read`);
      // Inside a magic-move block a notice would break the block; an empty step says it instead.
      if (fence?.magic) out.push("```text", said ?? `snippet not found: ${imp.path}`, "```");
      else
        out.push(
          ...(said ? notice(indent, said, null) : notice(indent, "Snippet not found:", imp.path)),
        );
      continue;
    }
    used.push(file.path);
    const region = extractRegion(file.text, imp.region);
    if (!region) {
      problems.push(`snippet ${imp.spec}: no region "${imp.region}" in ${file.path}`);
      if (fence?.magic) out.push("```text", `no region ${imp.region} in ${file.path}`, "```");
      else out.push(...notice(indent, `No region "${imp.region}" in`, file.path));
      continue;
    }
    // Inside magic move the step fences must stay shorter than the block's own fence.
    const mark = fence?.magic ? "```" : fenceFor(region.code);
    const source = `${file.path}${imp.region ? `#${imp.region}` : ""}`;
    const meta = [imp.lang, imp.meta, `kadal-snippet="${source.replace(/"/g, "")}"`]
      .filter(Boolean)
      .join(" ");
    out.push(`${indent}${mark}${meta}`);
    for (const l of region.code.split("\n")) out.push(l ? `${indent}${l}` : l);
    out.push(`${indent}${mark}`);
  }
  return { text: out.join("\n"), used, missing, problems };
}
