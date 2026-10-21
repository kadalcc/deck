import YAML from "yaml";

/**
 * A Slidev Markdown file cut into slides exactly as Slidev's parser cuts it
 * (@slidev/parser `parse`), so a deck converts slide for slide:
 *
 *   - any line that starts with `---` ends a slide (four dashes too: Slidev has no vertical slides);
 *     when the next line is not empty, the lines up to the next `---` are the slide's frontmatter
 *     (the first slide's is the headmatter);
 *   - a ```yaml fence that opens a slide is its frontmatter when it has no other ("block
 *     frontmatter");
 *   - fenced code and HTML comments are skipped while looking for separators;
 *   - the slide's notes are its LAST comment, when nothing but space follows it.
 *
 * Lines are kept so every report line points into the original file.
 */

export interface SlidevSlide {
  /** 0-based position in the file. */
  index: number;
  frontmatter: Record<string, unknown>;
  /** The frontmatter's text, and its first line (1-based); null when the slide has none. */
  frontmatterRaw: string | null;
  frontmatterLine: number | null;
  /** The slide's content without its frontmatter and notes. */
  body: string;
  /** The 1-based line of the body's first character. */
  bodyLine: number;
  note: string | null;
  noteLine: number | null;
  /** A YAML problem in the frontmatter, if any. */
  yamlError: string | null;
}

const RE_YAML_BLOCK = /^(\s*)```ya?ml[^\n]*\n([\s\S]*?)\n\s*```[^\n]*(\n|$)/;

function advanceComment(line: string, inComment: boolean): boolean {
  let cursor = 0;
  let state = inComment;
  while (cursor < line.length) {
    if (state) {
      const end = line.indexOf("-->", cursor);
      if (end < 0) return true;
      state = false;
      cursor = end + 3;
    } else {
      const start = line.indexOf("<!--", cursor);
      if (start < 0) return false;
      const end = line.indexOf("-->", start + 4);
      if (end < 0) return true;
      cursor = end + 3;
    }
  }
  return state;
}

function parseYaml(raw: string): { data: Record<string, unknown>; error: string | null } {
  try {
    const doc = YAML.parseDocument(raw);
    if (doc.errors.length) return { data: {}, error: doc.errors[0]!.message.split("\n")[0]! };
    const data = doc.toJSON() as unknown;
    return {
      data:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {},
      error: null,
    };
  } catch (e) {
    return { data: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseSlidev(markdown: string): SlidevSlide[] {
  const lines = markdown.split(/\r?\n/);
  // 1. Slidev's cut: raw [start, end) line ranges, a frontmatter block included in its slide's.
  const ranges: Array<[number, number]> = [];
  let start = 0;
  let inComment = false;
  const slice = (end: number) => {
    if (start === end) return;
    ranges.push([start, end]);
    start = end + 1;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    if (inComment) {
      inComment = advanceComment(raw, true);
      continue;
    }
    if (line.startsWith("---")) {
      slice(i);
      const next = lines[i + 1];
      if (line[3] !== "-" && next?.trim()) {
        start = i;
        for (i += 1; i < lines.length; i++) if (lines[i]!.trimEnd() === "---") break;
      }
    } else if (line.trimStart().startsWith("```")) {
      const level = /^\s*`+/.exec(line)![0].trim();
      let j = i + 1;
      for (; j < lines.length; j++) if (lines[j]!.startsWith(level)) break;
      if (j !== lines.length) i = j;
    } else inComment = advanceComment(raw, false);
  }
  if (start <= lines.length - 1) slice(lines.length);

  // 2. Each slide: its frontmatter (a `---` block, else a ```yaml block), body and notes.
  return ranges.map(([a, b], index) => {
    let frontmatterRaw: string | null = null;
    let frontmatterLine: number | null = null;
    let bodyStart = a;
    if (lines[a]!.startsWith("---") && lines[a]![3] !== "-") {
      let close = a + 1;
      while (close < b && lines[close]!.trimEnd() !== "---") close++;
      if (close < b || lines[close]?.trimEnd() === "---") {
        frontmatterRaw = lines.slice(a + 1, close).join("\n");
        frontmatterLine = a + 2;
        bodyStart = close + 1;
      } else bodyStart = a + 1;
    } else if (lines[a]!.startsWith("---")) bodyStart = a + 1;
    let body = lines.slice(bodyStart, b).join("\n");
    let bodyLine = bodyStart + 1;
    if (frontmatterRaw === null) {
      const block = RE_YAML_BLOCK.exec(body);
      if (block) {
        frontmatterRaw = block[2]!;
        frontmatterLine = bodyLine + block[1]!.split("\n").length;
        bodyLine += block[0].split("\n").length - (block[3] ? 1 : 0);
        body = body.slice(block[0].length);
      }
    }
    const { data, error } =
      frontmatterRaw !== null ? parseYaml(frontmatterRaw) : { data: {}, error: null };
    let note: string | null = null;
    let noteLine: number | null = null;
    const trimmedEnd = body.replace(/\s+$/, "");
    if (trimmedEnd.endsWith("-->")) {
      const open = trimmedEnd.lastIndexOf("<!--");
      if (open >= 0 && trimmedEnd.indexOf("-->", open + 4) === trimmedEnd.length - 3) {
        note = trimmedEnd.slice(open + 4, -3).trim();
        noteLine = bodyLine + trimmedEnd.slice(0, open).split("\n").length - 1;
        body = trimmedEnd.slice(0, open);
      }
    }
    return {
      index,
      frontmatter: data,
      frontmatterRaw,
      frontmatterLine,
      body,
      bodyLine,
      note: note || null,
      noteLine,
      yamlError: error,
    };
  });
}
