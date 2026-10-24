/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LINE DIFF AND THREE-WAY MERGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The small, dependable core under the slide-aware merge (sync/mdx.ts): Myers' O(ND) diff over
 * arrays of strings (lines, or slide tokens), its changes as hunks, and diff3 over a base and two
 * sides. Pure, no DOM or Node APIs; it never throws on odd input and never runs away on large
 * input — past MAX_EDIT the middle of a pair is treated as replaced whole, which the merge then
 * shows as one conflict instead of guessing.
 *
 * Two choices differ from git's defaults, both towards fewer needless conflicts in slides:
 *   · two changes conflict only when they overlap (or are insertions at the same point); edits
 *     on neighbouring lines both apply. Every line of either change still ends up in the result.
 *   · conflicts are "zealous": lines both sides wrote the same at the start or end of a conflict
 *     are moved out of it, so the markers wrap only what really differs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A change from `o` to `x`: `o[oStart, oEnd)` became `x[xStart, xEnd)`. */
export interface Hunk {
  oStart: number;
  oEnd: number;
  xStart: number;
  xEnd: number;
}

/** Edit distance past which the diff stops looking for a better script. */
const MAX_EDIT = 2000;

/**
 * The hunks that turn `o` into `x`. Common prefix and suffix are trimmed first (most edits are
 * small), lines are interned to numbers, then Myers' greedy forward search with a trace.
 */
export function diffHunks(o: readonly string[], x: readonly string[]): Hunk[] {
  let pre = 0;
  while (pre < o.length && pre < x.length && o[pre] === x[pre]) pre++;
  let suf = 0;
  while (
    suf < o.length - pre &&
    suf < x.length - pre &&
    o[o.length - 1 - suf] === x[x.length - 1 - suf]
  )
    suf++;
  const n = o.length - pre - suf;
  const m = x.length - pre - suf;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0) return [{ oStart: pre, oEnd: pre + n, xStart: pre, xEnd: pre + m }];

  const ids = new Map<string, number>();
  const intern = (s: string) => {
    let id = ids.get(s);
    if (id === undefined) ids.set(s, (id = ids.size));
    return id;
  };
  const a = Int32Array.from({ length: n }, (_, i) => intern(o[pre + i]!));
  const b = Int32Array.from({ length: m }, (_, i) => intern(x[pre + i]!));

  const max = Math.min(n + m, MAX_EDIT);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds V after d-1 steps, only its live diagonals -(d-1)…d-1: O(D²) memory, not O(D·N).
  const trace: Int32Array[] = [];
  let found = -1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d + 1, offset + d));
    for (let k = -d; k <= d; k += 2) {
      let i =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let j = i - k;
      while (i < n && j < m && a[i] === b[j]) {
        i++;
        j++;
      }
      v[offset + k] = i;
      if (i >= n && j >= m) {
        found = d;
        break outer;
      }
    }
  }
  // Too different to diff cheaply: the whole middle is one change.
  if (found < 0) return [{ oStart: pre, oEnd: pre + n, xStart: pre, xEnd: pre + m }];

  // Walk the trace back into a list of matched pairs (in reverse), then into hunks.
  const pairs: Array<[number, number]> = [];
  let i = n;
  let j = m;
  for (let d = found; d > 0; d--) {
    const t = trace[d]!;
    const vd = (diag: number) => t[diag + d - 1]!;
    const k = i - j;
    const prevK = k === -d || (k !== d && vd(k - 1) < vd(k + 1)) ? k + 1 : k - 1;
    const prevI = vd(prevK);
    const prevJ = prevI - prevK;
    while (i > prevI && j > prevJ) {
      i--;
      j--;
      pairs.push([i, j]);
    }
    i = prevI;
    j = prevJ;
  }
  while (i > 0 && j > 0) {
    i--;
    j--;
    pairs.push([i, j]);
  }
  pairs.reverse();

  const hunks: Hunk[] = [];
  let oi = 0;
  let xi = 0;
  for (const [pi, pj] of [...pairs, [n, m] as [number, number]]) {
    if (pi > oi || pj > xi)
      hunks.push({ oStart: pre + oi, oEnd: pre + pi, xStart: pre + xi, xEnd: pre + pj });
    oi = pi + 1;
    xi = pj + 1;
  }
  return hunks;
}

/** A piece of a merge: lines both agree on, or a conflict between the two sides. */
export type MergeChunk =
  | { ok: string[] }
  | { conflict: { ours: string[]; base: string[] | null; theirs: string[] } };

interface Tagged extends Hunk {
  side: 0 | 1;
}

/** Do two o-ranges collide? Overlap, an insertion at the same point, or one inside the other. */
function collide(a: { oStart: number; oEnd: number }, b: { oStart: number; oEnd: number }) {
  if (a.oStart < b.oEnd && b.oStart < a.oEnd) return true;
  if (a.oStart === a.oEnd && b.oStart === b.oEnd) return a.oStart === b.oStart;
  if (a.oStart === a.oEnd) return b.oStart < a.oStart && a.oStart < b.oEnd;
  if (b.oStart === b.oEnd) return a.oStart < b.oStart && b.oStart < a.oEnd;
  return false;
}

/** Lines both sides changed to the same thing at a conflict's edges are not part of it. */
function zealous(ours: string[], base: string[] | null, theirs: string[]): MergeChunk[] {
  let pre = 0;
  while (pre < ours.length && pre < theirs.length && ours[pre] === theirs[pre]) pre++;
  let suf = 0;
  while (
    suf < ours.length - pre &&
    suf < theirs.length - pre &&
    ours[ours.length - 1 - suf] === theirs[theirs.length - 1 - suf]
  )
    suf++;
  const out: MergeChunk[] = [];
  if (pre) out.push({ ok: ours.slice(0, pre) });
  const o = ours.slice(pre, ours.length - suf);
  const t = theirs.slice(pre, theirs.length - suf);
  if (o.length || t.length) out.push({ conflict: { ours: o, base, theirs: t } });
  if (suf) out.push({ ok: ours.slice(ours.length - suf) });
  return out;
}

/** Three-way merge of lines: what `ours` and `theirs` each did to `base`, together. */
export function diff3(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
): MergeChunk[] {
  const hunks: Tagged[] = [
    ...diffHunks(base, ours).map((h) => ({ ...h, side: 0 as const })),
    ...diffHunks(base, theirs).map((h) => ({ ...h, side: 1 as const })),
  ].sort((a, b) => a.oStart - b.oStart || a.oEnd - b.oEnd || a.side - b.side);

  const out: MergeChunk[] = [];
  const keep = (lines: readonly string[]) => {
    if (!lines.length) return;
    const last = out[out.length - 1];
    if (last && "ok" in last) last.ok.push(...lines);
    else out.push({ ok: [...lines] });
  };
  let at = 0;
  let h = 0;
  while (h < hunks.length) {
    // A region: this hunk and every later one that collides with what the region covers.
    const region: Tagged[] = [hunks[h]!];
    let oStart = hunks[h]!.oStart;
    let oEnd = hunks[h]!.oEnd;
    h++;
    while (h < hunks.length && collide({ oStart, oEnd }, hunks[h]!)) {
      region.push(hunks[h]!);
      oStart = Math.min(oStart, hunks[h]!.oStart);
      oEnd = Math.max(oEnd, hunks[h]!.oEnd);
      h++;
    }
    keep(base.slice(at, oStart));
    at = oEnd;
    const sides = [region.filter((r) => r.side === 0), region.filter((r) => r.side === 1)];
    /** What one side made of base[oStart, oEnd): its hunks, and base lines between them. */
    const textOf = (side: 0 | 1): string[] => {
      const src = side === 0 ? ours : theirs;
      const hs = sides[side]!;
      if (!hs.length) return base.slice(oStart, oEnd);
      const first = hs[0]!;
      const last = hs[hs.length - 1]!;
      return src.slice(first.xStart - (first.oStart - oStart), last.xEnd + (oEnd - last.oEnd));
    };
    if (!sides[1]!.length) keep(textOf(0));
    else if (!sides[0]!.length) keep(textOf(1));
    else {
      const o = textOf(0);
      const t = textOf(1);
      if (o.length === t.length && o.every((l, i) => l === t[i])) keep(o);
      else
        for (const c of zealous(o, base.slice(oStart, oEnd), t)) {
          if ("ok" in c) keep(c.ok);
          else out.push(c);
        }
    }
  }
  keep(base.slice(at));
  return out;
}

/** Two-way "merge" with no base: what both have is kept, every difference is a conflict. */
export function merge2(ours: readonly string[], theirs: readonly string[]): MergeChunk[] {
  const out: MergeChunk[] = [];
  let at = 0;
  for (const h of diffHunks(ours, theirs)) {
    if (h.oStart > at) out.push({ ok: ours.slice(at, h.oStart) });
    out.push({
      conflict: {
        ours: ours.slice(h.oStart, h.oEnd),
        base: null,
        theirs: theirs.slice(h.xStart, h.xEnd),
      },
    });
    at = h.oEnd;
  }
  if (at < ours.length) out.push({ ok: ours.slice(at) });
  return out;
}

/** The labels written on a conflict's marker lines. */
export interface MarkerLabels {
  ours: string;
  base: string;
  theirs: string;
}

/** A conflict as git writes it (diff3 style: with the base, when there is one). */
export function markerLines(
  c: { ours: string[]; base: string[] | null; theirs: string[] },
  labels: MarkerLabels,
): string[] {
  return [
    `<<<<<<< ${labels.ours}`,
    ...c.ours,
    ...(c.base ? [`||||||| ${labels.base}`, ...c.base] : []),
    "=======",
    ...c.theirs,
    `>>>>>>> ${labels.theirs}`,
  ];
}
