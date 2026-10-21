/**
 * A line diff, for the static face of a `{monaco-diff}` block: what print, export, the phone
 * remote and a deck without Monaco show instead of the diff editor. One unified listing, removed
 * lines in red and added ones in green, the way a review reads.
 *
 * Longest common subsequence over lines: quadratic, which is nothing at the size of code on a
 * slide (a 200-line block is 40 000 cells). Blocks past MAX lines fall back to "all removed, then
 * all added" rather than spending a second on a diff nobody can read on a slide anyway.
 */
export type DiffOp = { kind: "same" | "remove" | "add"; text: string };

const MAX = 600;

export function diffLines(original: string, modified: string): DiffOp[] {
  const a = original.split("\n");
  const b = modified.split("\n");
  if (a.length > MAX || b.length > MAX)
    return [
      ...a.map((text) => ({ kind: "remove" as const, text })),
      ...b.map((text) => ({ kind: "add" as const, text })),
    ];
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: the common length of a[i..] and b[j..], in one flat array.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: b[j]! });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!)
      out.push({ kind: "remove", text: a[i++]! });
    else out.push({ kind: "add", text: b[j++]! });
  }
  while (i < n) out.push({ kind: "remove", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** Slidev's separator inside a `{monaco-diff}` fence: a line of `~~~` between the two versions. */
export function splitDiffSource(source: string): { original: string; modified: string } {
  const lines = source.split("\n");
  const at = lines.findIndex((l) => /^~~~\s*$/.test(l));
  if (at < 0) return { original: source, modified: source };
  return { original: lines.slice(0, at).join("\n"), modified: lines.slice(at + 1).join("\n") };
}
