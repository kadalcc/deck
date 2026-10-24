import YAML from "yaml";

import { cutDeck, titleOf } from "../compiler/split.ts";
import {
  type MarkerLabels,
  type MergeChunk,
  diff3,
  diffHunks,
  markerLines,
  merge2,
} from "./diff.ts";
import { DELETED_SUFFIX, markerBlocks, strayMarkers } from "./markers.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SLIDE-AWARE MERGE: two edits of one deck.mdx, together
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A line merge of two edited decks conflicts whenever both people touched the same stretch of
 * text — and in a deck, "the same stretch" is often just "the same slide boundary". This merge
 * works the way people think about a deck: in slides.
 *
 *   1. Cut base, ours and theirs into the headmatter and slides with the engine's own splitter
 *      (compiler/split.ts `cutDeck`: code fences, `---` inside frontmatter, `----` vertical
 *      slides and Comark blocks are all respected; includes stay unexpanded).
 *   2. Align each side's slides with the base's: an explicit `id:` first; then, in order, an LCS
 *      that maximises a similarity of normalised content and title; then, out of order, strong
 *      matches only — which is how a slide that moved is still the same slide.
 *   3. Merge the ORDER as a sequence of slide tokens with diff3, so one side's reorder, insertion
 *      or deletion applies cleanly; two insertions at the same place keep both, ours first.
 *   4. Merge each slide: unchanged on one side → the other's; both changed → per-key for the
 *      frontmatter (YAML-aware, formatting and comments kept) and a line diff3 for the body.
 *      Deleted on one side and edited on the other → the edited slide stays, its body inside
 *      markers whose deleting side's label ends with DELETED_SUFFIX (choosing it deletes it).
 *   5. Never throw: anything odd (broken YAML, unbalanced fences, CRLF, a BOM, a missing final
 *      newline, a file replaced wholesale, binary-looking text) degrades to a whole-file line
 *      merge, and that to a single whole-file conflict.
 *
 * Without a base (no snapshot of what both started from) every slide that differs between the
 * two sides is a conflict unless one side equals the other: the safe default, nothing guessed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A file's text, by its deck-relative POSIX path. */
export interface SourceFiles {
  [path: string]: string;
}

export interface Conflict {
  path: string;
  /** The slide it is on, counting from 1 within its file (the first slide is 1). */
  slide?: number;
  title?: string;
  kind: "content" | "delete-edit" | "add-add" | "frontmatter" | "move";
  ours: string;
  theirs: string;
  base: string | null;
  /** 1-based line of the conflict's `<<<<<<<` marker in the merged file. */
  line?: number;
}

export interface MergeOptions {
  /** Written after `<<<<<<<`. Default "ours". The CLI says "local (your files)". */
  oursLabel?: string;
  /** Written after `>>>>>>>`. Default "theirs". The CLI says "web v14 (Quick edit by Asha, …)". */
  theirsLabel?: string;
  /** Written after `|||||||`. Default "base". */
  baseLabel?: string;
  /** The file's path, for the conflicts. Default "deck.mdx". */
  path?: string;
}

interface Frontmatter {
  /** Lines between the separator and the YAML (a block fence's ```yaml, blank lines), or the head's `---`. */
  before: string[];
  yaml: string[];
  /** The closing fence. */
  after: string[];
}

/** A slide as text: the head (no separator) or one piece after a separator. */
interface Unit {
  sep: string | null;
  /** Blank lines above the headmatter (head only). */
  prefix: string[];
  fm: Frontmatter | null;
  body: string[];
  /**
   * The blank lines after the body, before the next separator. Not content: a slide that moves
   * to the end of the deck loses them and one that moves from it gains them, so they are kept
   * apart and never count as an edit.
   */
  pad: string[];
}

interface Parsed {
  head: Unit;
  slides: Unit[];
}

/** A unit's lines without its trailing blank lines (what merges and compares). */
const coreLines = (u: Unit): string[] => [
  ...(u.sep === null ? [] : [u.sep]),
  ...u.prefix,
  ...(u.fm ? [...u.fm.before, ...u.fm.yaml, ...u.fm.after] : []),
  ...u.body,
];
const unitText = (u: Unit) => coreLines(u).join("\n");

/** Split trailing blank lines off a body. */
function padded(u: Omit<Unit, "pad">): Unit {
  let end = u.body.length;
  while (end > 0 && !u.body[end - 1]!.trim()) end--;
  return { ...u, body: u.body.slice(0, end), pad: u.body.slice(end) };
}

/** Cut a (normalised, LF) deck into units whose lines, concatenated, are the text again. */
function parseUnits(text: string): Parsed {
  const lines = text.split("\n");
  const pieces = cutDeck(text);
  const units: Unit[] = pieces.map((p, i) => padded(cutUnit(lines, p, i)));
  return { head: units[0]!, slides: units.slice(1) };
}

function cutUnit(
  lines: string[],
  p: ReturnType<typeof cutDeck>[number],
  i: number,
): Omit<Unit, "pad"> {
  if (i === 0) {
    if (!p.fence) return { sep: null, prefix: [], fm: null, body: lines.slice(0, p.end) };
    const { open, close } = p.fence;
    return {
      sep: null,
      prefix: lines.slice(0, open),
      fm: { before: [lines[open]!], yaml: lines.slice(open + 1, close), after: [lines[close]!] },
      body: lines.slice(close + 1, p.end),
    };
  }
  const sep = lines[p.start]!;
  if (!p.fence) return { sep, prefix: [], fm: null, body: lines.slice(p.start + 1, p.end) };
  const { open, close, block } = p.fence;
  return {
    sep,
    prefix: [],
    fm: {
      before: block ? lines.slice(p.start + 1, open + 1) : [],
      yaml: lines.slice((block ? open : p.start) + 1, close),
      after: [lines[close]!],
    },
    body: lines.slice(close + 1, p.end),
  };
}

/* ── alignment ─────────────────────────────────────────────────────────────── */

interface Info {
  unit: Unit;
  text: string;
  id: string | null;
  title: string | null;
  norm: string[];
}

function fmObject(u: Unit): Record<string, unknown> {
  if (!u.fm) return {};
  try {
    const v = YAML.parse(u.fm.yaml.join("\n")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function infoOf(u: Unit): Info {
  const fm = fmObject(u);
  let title: string | null = null;
  try {
    title = titleOf({ content: u.body.join("\n"), frontmatter: fm });
  } catch {
    /* no title */
  }
  return {
    unit: u,
    text: unitText(u),
    id: typeof fm.id === "string" && fm.id ? fm.id : null,
    title,
    norm: [...(u.fm?.yaml ?? []), ...u.body]
      .map((l) => l.trim().replace(/\s+/g, " ").toLowerCase())
      .filter(Boolean),
  };
}

/** 0–1: Dice over the multiset of normalised lines, lifted by an equal title (or, `chars`, letters). */
function similarity(a: Info, b: Info, chars = false): number {
  if (a.text === b.text) return 1;
  if (a.id && b.id && a.id !== b.id) return 0;
  let dice: number;
  if (!a.norm.length && !b.norm.length) dice = 1;
  else {
    const counts = new Map<string, number>();
    for (const l of a.norm) counts.set(l, (counts.get(l) ?? 0) + 1);
    let common = 0;
    for (const l of b.norm) {
      const c = counts.get(l) ?? 0;
      if (c > 0) {
        common++;
        counts.set(l, c - 1);
      }
    }
    dice = (2 * common) / (a.norm.length + b.norm.length);
  }
  // A short slide (a title, a line or two) edited is still mostly the same characters.
  // Both short, and only for slides in the same place (`chars`): letters alone are weak evidence.
  if (chars && a.norm.length <= 3 && b.norm.length <= 3)
    dice = Math.max(dice, bigramDice(a.norm.join("\n"), b.norm.join("\n")));
  if (a.title && a.title === b.title) dice = Math.max(dice, 0.6);
  return Math.min(dice, 0.99);
}

function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let common = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      common++;
      counts.set(g, c - 1);
    }
  }
  return (2 * common) / (a.length + b.length - 2);
}

const MATCH = 0.5;
const MOVE = 0.7;

/** For each slide of `side`, the index of the `base` slide it is (or undefined: new). */
function align(base: Info[], side: Info[]): Array<number | undefined> {
  const out: Array<number | undefined> = Array.from({ length: side.length }, () => undefined);
  const usedBase = new Set<number>();
  // 1 · explicit ids, when each is unique on both sides
  const ids = (xs: Info[]) => {
    const m = new Map<string, number[]>();
    xs.forEach((x, i) => x.id && m.set(x.id, [...(m.get(x.id) ?? []), i]));
    return m;
  };
  const bi = ids(base);
  const si = ids(side);
  for (const [id, js] of si) {
    const is = bi.get(id);
    if (js.length === 1 && is?.length === 1) {
      out[js[0]!] = is[0]!;
      usedBase.add(is[0]!);
    }
  }
  const restB = base.map((_, i) => i).filter((i) => !usedBase.has(i));
  const restS = side.map((_, j) => j).filter((j) => out[j] === undefined);
  const n = restB.length;
  const m = restS.length;
  // 2 · in order. Slides whose text did not change at all pair up first, by a diff of the
  // texts (fast, and most of a deck); each stretch between them is aligned by a weighted LCS
  // over their similarity.
  const pair = (bi: number, sj: number) => {
    out[sj] = bi;
    usedBase.add(bi);
  };
  const lcs = (bs: number[], ss: number[]) => {
    const n = bs.length;
    const m = ss.length;
    if (!n || !m || n * m > 250_000) return;
    const sims = new Float64Array(n * m);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) sims[i * m + j] = similarity(base[bs[i]!]!, side[ss[j]!]!, true);
    const dp = new Float64Array((n + 1) * (m + 1));
    const at = (i: number, j: number) => dp[i * (m + 1) + j]!;
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) {
        const s = sims[i * m + j]!;
        const take = s >= MATCH ? s + at(i + 1, j + 1) : -1;
        dp[i * (m + 1) + j] = Math.max(take, at(i + 1, j), at(i, j + 1));
      }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      const s = sims[i * m + j]!;
      if (s >= MATCH && Math.abs(at(i, j) - (s + at(i + 1, j + 1))) < 1e-9) {
        pair(bs[i]!, ss[j]!);
        i++;
        j++;
      } else if (Math.abs(at(i, j) - at(i + 1, j)) < 1e-9) i++;
      else j++;
    }
  };
  if (n && m) {
    const bt = restB.map((i) => base[i]!.text);
    const st = restS.map((j) => side[j]!.text);
    let ai = 0;
    let aj = 0;
    for (const h of [...diffHunks(bt, st), { oStart: n, oEnd: n, xStart: m, xEnd: m }]) {
      while (ai < h.oStart && aj < h.xStart) pair(restB[ai++]!, restS[aj++]!);
      lcs(restB.slice(h.oStart, h.oEnd), restS.slice(h.xStart, h.xEnd));
      ai = h.oEnd;
      aj = h.xEnd;
    }
  }
  // 3 · out of order: strong matches only — moved slides
  const leftB = base.map((_, i) => i).filter((i) => !usedBase.has(i));
  const leftS = side.map((_, j) => j).filter((j) => out[j] === undefined);
  if (leftB.length && leftS.length && leftB.length * leftS.length <= 250_000) {
    const pairs: Array<[number, number, number]> = [];
    for (const i of leftB)
      for (const j of leftS) {
        const s = similarity(base[i]!, side[j]!);
        if (s >= MOVE) pairs.push([s, i, j]);
      }
    pairs.sort((a, b) => b[0] - a[0]);
    for (const [, i, j] of pairs) {
      if (usedBase.has(i) || out[j] !== undefined) continue;
      out[j] = i;
      usedBase.add(i);
    }
  }
  // 4 · in place: a run of slides still unpaired, between two paired neighbours (or an end of
  // the file), pairs in order with the unpaired base slides between those neighbours when there
  // are as many of them. `# Hi` edited to `# Hello` shares too few letters to match, yet it is
  // the same slide; called new, an edit of it on both sides would come out as two slides instead
  // of a conflict. A slide added where the base had none has no partner here, so an add on both
  // sides still keeps both.
  for (let j = 0; j < side.length;) {
    if (out[j] !== undefined) {
      j++;
      continue;
    }
    let k = j;
    while (k < side.length && out[k] === undefined) k++;
    const lo = j > 0 ? out[j - 1]! : -1;
    const hi = k < side.length ? out[k]! : base.length;
    const gap: number[] = [];
    for (let i = lo + 1; i < hi; i++) if (!usedBase.has(i)) gap.push(i);
    if (gap.length === k - j)
      gap.forEach((i, d) => {
        const a = base[i]!;
        const b = side[j + d]!;
        if (a.id && b.id && a.id !== b.id) return;
        out[j + d] = i;
        usedBase.add(i);
      });
    j = k;
  }
  return out;
}

/* ── merging one slide ─────────────────────────────────────────────────────── */

interface Pending {
  /** 0-based line within the emitted lines. */
  offset: number;
  kind: Conflict["kind"];
  ours: string;
  theirs: string;
  base: string | null;
}

interface Emitted {
  lines: string[];
  conflicts: Pending[];
}

const same = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) =>
  !!a && !!b && a.length === b.length && a.every((l, i) => l === b[i]);

/** Three-way pick of a value that cannot be merged further: the side that changed it wins, ours on a tie. */
function pick<T>(b: T | undefined, o: T, t: T, eq: (x: T, y: T) => boolean): T {
  if (eq(o, t)) return o;
  if (b !== undefined && eq(b, o)) return t;
  return o;
}

function mergeLines(
  b: string[] | null,
  o: string[],
  t: string[],
  kind: Conflict["kind"],
  labels: MarkerLabels,
): Emitted {
  const chunks: MergeChunk[] = b ? diff3(b, o, t) : merge2(o, t);
  const lines: string[] = [];
  const conflicts: Pending[] = [];
  for (const c of chunks) {
    if ("ok" in c) lines.push(...c.ok);
    else {
      conflicts.push({
        offset: lines.length,
        kind: b ? kind : kind === "frontmatter" ? "frontmatter" : "add-add",
        ours: c.conflict.ours.join("\n"),
        theirs: c.conflict.theirs.join("\n"),
        base: c.conflict.base ? c.conflict.base.join("\n") : null,
      });
      lines.push(...markerLines(c.conflict, labels));
    }
  }
  return { lines, conflicts };
}

const fmLines = (f: Frontmatter | null) => (f ? [...f.before, ...f.yaml, ...f.after] : null);

/** YAML text → its document, or null when it is not a clean mapping. */
function yamlDoc(lines: string[] | undefined): YAML.Document | null {
  const doc = YAML.parseDocument(lines?.join("\n") ?? "", { keepSourceTokens: false });
  if (doc.errors.length) return null;
  const c = doc.contents;
  if (c !== null && !YAML.isMap(c)) return null;
  if (c === null) doc.contents = doc.createNode({}) as never;
  return doc;
}

const docLines = (doc: YAML.Document): string[] => {
  const map = doc.contents as YAML.YAMLMap | null;
  if (!map || !map.items.length) return [];
  return doc.toString({ lineWidth: 0 }).replace(/\n$/, "").split("\n");
};

const jsonEq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/**
 * Frontmatter, per key: a key only one side changed takes that change; a key both changed to
 * different values is a conflict, written as markers around just that key's lines inside the
 * fence (the splitter keeps a fence with markers in it as frontmatter). Ours is the document
 * the changes go into, so its comments and formatting survive.
 */
function mergeFrontmatter(
  b: Frontmatter | null,
  o: Frontmatter | null,
  t: Frontmatter | null,
  hasBase: boolean,
  labels: MarkerLabels,
): { fm: Frontmatter | null; conflicts: Pending[] } {
  const fb = fmLines(b);
  const fo = fmLines(o);
  const ft = fmLines(t);
  if (fo === ft || same(fo, ft)) return { fm: o, conflicts: [] };
  if (hasBase && (fb === fo || same(fb, fo))) return { fm: t, conflicts: [] };
  if (hasBase && (fb === ft || same(fb, ft))) return { fm: o, conflicts: [] };
  const frame = o ?? t ?? b!;
  const dO = yamlDoc(o?.yaml);
  const dT = yamlDoc(t?.yaml);
  const dB = hasBase ? yamlDoc(b?.yaml) : null;
  if (!dO || !dT || (hasBase && !dB)) {
    // Not YAML we can read on some side: merge its lines instead.
    const merged = mergeLines(
      hasBase ? (b?.yaml ?? []) : null,
      o?.yaml ?? [],
      t?.yaml ?? [],
      "frontmatter",
      labels,
    );
    return {
      fm: { before: frame.before, yaml: merged.lines, after: frame.after },
      conflicts: merged.conflicts.map((c) => ({
        ...c,
        kind: "frontmatter",
        offset: c.offset + frame.before.length,
      })),
    };
  }
  const js = (d: YAML.Document | null) => (d?.toJS() ?? {}) as Record<string, unknown>;
  const vo = js(dO);
  const vt = js(dT);
  const vb = js(dB);
  const keys = [...Object.keys(vo), ...Object.keys(vt).filter((k) => !(k in vo))];
  const node = (d: YAML.Document, k: string) => {
    const n = d.get(k, true) as unknown;
    return YAML.isNode(n) ? n.clone() : n;
  };
  const conflicted: string[] = [];
  for (const k of keys) {
    const o1 = vo[k];
    const t1 = vt[k];
    if (jsonEq(o1, t1) && k in vo === k in vt) continue;
    if (hasBase && jsonEq(vb[k], o1) && k in vb === k in vo) {
      if (k in vt) dO.set(k, node(dT, k));
      else dO.delete(k);
      continue;
    }
    if (hasBase && jsonEq(vb[k], t1) && k in vb === k in vt) continue;
    conflicted.push(k);
  }
  if (!conflicted.length) {
    const yaml = docLines(dO);
    // No settings left: no fence either (an empty `---`/`---` pair would read as two separators).
    if (!yaml.length) return { fm: null, conflicts: [] };
    return { fm: { before: frame.before, yaml, after: frame.after }, conflicts: [] };
  }
  // The two sides of the conflict differ only in the conflicted keys, so the markers wrap only those.
  const withValues = (from: YAML.Document | null, values: Record<string, unknown>) => {
    const d = dO.clone();
    for (const k of conflicted) {
      if (from && k in values) d.set(k, node(from, k));
      else d.delete(k);
    }
    return docLines(d);
  };
  const merged = mergeLines(
    hasBase ? withValues(dB, vb) : null,
    docLines(dO),
    withValues(dT, vt),
    "frontmatter",
    labels,
  );
  return {
    fm: { before: frame.before, yaml: merged.lines, after: frame.after },
    conflicts: merged.conflicts.map((c) => ({
      ...c,
      kind: "frontmatter",
      offset: c.offset + frame.before.length,
    })),
  };
}

/** Merge one slide (or the head) that both sides still have. */
function mergeUnit(b: Unit | null, o: Unit, t: Unit, labels: MarkerLabels): Emitted {
  const to = unitText(o);
  const tt = unitText(t);
  if (to === tt) return { lines: coreLines(o), conflicts: [] };
  if (b) {
    const tb = unitText(b);
    if (tb === to) return { lines: coreLines(t), conflicts: [] };
    if (tb === tt) return { lines: coreLines(o), conflicts: [] };
  }
  const sep = pick(b?.sep, o.sep, t.sep, (x, y) => x === y);
  const prefix = pick(b?.prefix, o.prefix, t.prefix, same);
  const fm = mergeFrontmatter(b?.fm ?? null, o.fm, t.fm, !!b, labels);
  const body = mergeLines(b ? b.body : null, o.body, t.body, "content", labels);
  const lead = [...(sep === null ? [] : [sep]), ...prefix];
  const fmText = fmLines(fm.fm) ?? [];
  return {
    lines: [...lead, ...fmText, ...body.lines],
    conflicts: [
      ...fm.conflicts.map((c) => ({ ...c, offset: c.offset + lead.length })),
      ...body.conflicts.map((c) => ({ ...c, offset: c.offset + lead.length + fmText.length })),
    ],
  };
}

/** A slide one side deleted and the other edited: kept, its body inside markers. */
function deleteEdit(b: Unit, kept: Unit, keptBy: "ours" | "theirs", labels: MarkerLabels): Emitted {
  const lead = [
    ...(kept.sep === null ? [] : [kept.sep]),
    ...kept.prefix,
    ...(fmLines(kept.fm) ?? []),
  ];
  const c = {
    ours: keptBy === "ours" ? kept.body : [],
    base: b.body,
    theirs: keptBy === "theirs" ? kept.body : [],
  };
  const l: MarkerLabels =
    keptBy === "ours"
      ? { ...labels, theirs: `${labels.theirs}${DELETED_SUFFIX}` }
      : { ...labels, ours: `${labels.ours}${DELETED_SUFFIX}` };
  return {
    lines: [...lead, ...markerLines(c, l)],
    conflicts: [
      {
        offset: lead.length,
        kind: "delete-edit",
        ours: c.ours.join("\n"),
        theirs: c.theirs.join("\n"),
        base: b.body.join("\n"),
      },
    ],
  };
}

/* ── the deck ──────────────────────────────────────────────────────────────── */

/** Where `token` belongs in `merged`, after the nearest earlier token of `seq` that is there. */
function insertAfterNeighbour(merged: string[], seq: string[], token: string) {
  const at = seq.indexOf(token);
  for (let k = at - 1; k >= 0; k--) {
    const p = merged.indexOf(seq[k]!);
    if (p >= 0) {
      merged.splice(p + 1, 0, token);
      return;
    }
  }
  merged.unshift(token);
}

function slideAware(
  base: string | null,
  ours: string,
  theirs: string,
  labels: MarkerLabels,
): { lines: string[]; conflicts: Pending[] } {
  const pb = base === null ? null : parseUnits(base);
  const po = parseUnits(ours);
  const pt = parseUnits(theirs);
  const io = po.slides.map(infoOf);
  const it = pt.slides.map(infoOf);

  // Each unit with the blank lines that follow it; the last one ends the way ours ends.
  const items: Array<{ e: Emitted; pad: string[] }> = [];
  const emit = (e: Emitted, from: Unit) => items.push({ e, pad: from.pad });
  const plain = (u: Unit) => emit({ lines: coreLines(u), conflicts: [] }, u);
  const finish = () => {
    const out: string[] = [];
    const conflicts: Pending[] = [];
    const lastPad = (po.slides[po.slides.length - 1] ?? po.head).pad;
    items.forEach(({ e, pad }, k) => {
      for (const c of e.conflicts) conflicts.push({ ...c, offset: c.offset + out.length });
      out.push(...e.lines);
      // A slide that was last and no longer is gets the blank line a separator wants above it.
      out.push(...(k === items.length - 1 ? lastPad : pad.length || !e.lines.length ? pad : [""]));
    });
    return { lines: out, conflicts };
  };

  emit(mergeUnit(pb?.head ?? null, po.head, pt.head, labels), po.head);

  if (!pb) {
    // No base: pair ours with theirs; pairs that differ conflict, the rest are kept, ours first.
    const pair = align(io, it);
    const order = io.map((_, j) => `o${j}`);
    const theirsSeq = it.map((_, j) => (pair[j] === undefined ? `t${j}` : `o${pair[j]}`));
    for (const tok of theirsSeq)
      if (!order.includes(tok)) insertAfterNeighbour(order, theirsSeq, tok);
    const partner = new Map<number, number>();
    pair.forEach((oj, tj) => oj !== undefined && partner.set(oj, tj));
    for (const tok of order) {
      const k = Number(tok.slice(1));
      if (tok[0] === "t") plain(pt.slides[k]!);
      else {
        const tj = partner.get(k);
        if (tj === undefined) plain(po.slides[k]!);
        else emit(mergeUnit(null, po.slides[k]!, pt.slides[tj]!, labels), po.slides[k]!);
      }
    }
    return finish();
  }

  const ib = pb.slides.map(infoOf);
  const mo = align(ib, io);
  const mt = align(ib, it);
  const baseSeq = ib.map((_, i) => `b${i}`);
  const oursSeq = io.map((_, j) => (mo[j] === undefined ? `o${j}` : `b${mo[j]}`));
  // A slide both sides added, word for word, is one slide (a re-merge of a merge, or the same
  // paste on both sides), not two.
  const newOurs = new Map<string, number>();
  io.forEach((x, j) => mo[j] === undefined && !newOurs.has(x.text) && newOurs.set(x.text, j));
  const sameNew = new Map<number, number>();
  it.forEach((x, j) => {
    const oj = mt[j] === undefined ? newOurs.get(x.text) : undefined;
    if (oj !== undefined && ![...sameNew.values()].includes(oj)) sameNew.set(j, oj);
  });
  const theirsSeq = it.map((_, j) =>
    mt[j] !== undefined ? `b${mt[j]}` : sameNew.has(j) ? `o${sameNew.get(j)}` : `t${j}`,
  );
  const oursOf = new Map<number, number>();
  mo.forEach((i, j) => i !== undefined && oursOf.set(i, j));
  const theirsOf = new Map<number, number>();
  mt.forEach((i, j) => i !== undefined && theirsOf.set(i, j));

  // The order, merged as a sequence of tokens.
  let merged: string[] = [];
  for (const c of diff3(baseSeq, oursSeq, theirsSeq)) {
    if ("ok" in c) merged.push(...c.ok);
    else
      merged.push(
        ...c.conflict.ours,
        ...c.conflict.theirs.filter((x) => !c.conflict.ours.includes(x)),
      );
  }
  merged = merged.filter((x, k) => merged.indexOf(x) === k);
  // Which base slides stay: on both sides; or on one side that edited it (the other deleted it).
  const keep = new Map<string, "both" | "ours" | "theirs">();
  ib.forEach((b, i) => {
    const o = oursOf.get(i);
    const t = theirsOf.get(i);
    if (o !== undefined && t !== undefined) keep.set(`b${i}`, "both");
    else if (o !== undefined && io[o]!.text !== b.text) keep.set(`b${i}`, "ours");
    else if (t !== undefined && it[t]!.text !== b.text) keep.set(`b${i}`, "theirs");
  });
  merged = merged.filter((x) => x[0] !== "b" || keep.has(x));
  for (const [tok, by] of keep)
    if (!merged.includes(tok))
      insertAfterNeighbour(merged, by === "theirs" ? theirsSeq : oursSeq, tok);
  for (const tok of oursSeq)
    if (tok[0] === "o" && !merged.includes(tok)) insertAfterNeighbour(merged, oursSeq, tok);
  for (const tok of theirsSeq)
    if (tok[0] === "t" && !merged.includes(tok)) insertAfterNeighbour(merged, theirsSeq, tok);

  for (const tok of merged) {
    const k = Number(tok.slice(1));
    if (tok[0] === "o") plain(po.slides[k]!);
    else if (tok[0] === "t") plain(pt.slides[k]!);
    else {
      const b = pb.slides[k]!;
      const by = keep.get(tok)!;
      const o = po.slides[oursOf.get(k) ?? -1];
      const t = pt.slides[theirsOf.get(k) ?? -1];
      if (by === "both") emit(mergeUnit(b, o!, t!, labels), o!);
      else if (by === "ours") emit(deleteEdit(b, o!, "ours", labels), o!);
      else emit(deleteEdit(b, t!, "theirs", labels), t!);
    }
  }
  return finish();
}

/**
 * The slide of a deck file that a line is on, counting from 1 as the deck does (an empty head
 * piece is not a slide, nor a later piece with neither content nor settings), and its title.
 */
export function slideAtLine(text: string, line: number): { slide: number; title: string | null } {
  const t = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let pieces;
  try {
    pieces = cutDeck(t);
  } catch {
    return { slide: 1, title: null };
  }
  let n = 0;
  let title: string | null = null;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const blank = !p.lines.join("\n").trim();
    const isSlide = i === 0 ? !blank : !(blank && !p.frontmatter?.trim());
    if (isSlide) {
      n++;
      try {
        title = titleOf({ content: p.lines.join("\n"), frontmatter: {} });
      } catch {
        title = null;
      }
    }
    if (line >= p.start && line < p.end)
      return { slide: Math.max(1, n), title: isSlide ? title : null };
  }
  return { slide: Math.max(1, n), title };
}

/** Text the way the merge reads it, and how to give it back the way ours was written. */
function normalise(text: string) {
  const bom = text.startsWith("﻿");
  const body = (bom ? text.slice(1) : text).replace(/\r\n?/g, "\n");
  const eol = body.endsWith("\n");
  return { bom, crlf: /\r\n/.test(text), eol, text: eol ? body.slice(0, -1) : body };
}

const labelsOf = (o: MergeOptions): MarkerLabels => ({
  ours: o.oursLabel?.trim() || "ours",
  theirs: o.theirsLabel?.trim() || "theirs",
  base: o.baseLabel?.trim() || "base",
});

function toConflicts(text: string, path: string, pending: Pending[]): Conflict[] {
  return pending.map((p) => {
    const at = slideAtLine(text, p.offset);
    return {
      path,
      slide: at.slide,
      ...(at.title ? { title: at.title } : {}),
      kind: p.kind,
      ours: p.ours,
      theirs: p.theirs,
      base: p.base,
      line: p.offset + 1,
    };
  });
}

/**
 * Merge two edits of one deck file. Never throws. `text` has conflict markers where the two
 * could not be reconciled, one entry in `conflicts` per marker block, in order.
 */
export function mergeMdx(
  base: string | null,
  ours: string,
  theirs: string,
  opts: MergeOptions = {},
): { text: string; conflicts: Conflict[] } {
  const path = opts.path ?? "deck.mdx";
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const o0 = s(ours);
  const t0 = s(theirs);
  const b0 = base === null || base === undefined ? null : s(base);
  if (o0 === t0) return { text: o0, conflicts: [] };
  if (b0 !== null && b0 === o0) return { text: t0, conflicts: [] };
  if (b0 !== null && b0 === t0) return { text: o0, conflicts: [] };

  const no = normalise(o0);
  const nt = normalise(t0);
  const nb = b0 === null ? null : normalise(b0);
  const labels = labelsOf(opts);
  const finish = (lines: string[], pending: Pending[]) => {
    let text = lines.join("\n");
    const conflicts = toConflicts(text, path, pending);
    // A final newline is kept when either side has one: editors disagree about it, people do not.
    if (no.eol || nt.eol) text += "\n";
    if (no.crlf) text = text.replace(/\n/g, "\r\n");
    return { text: no.bom ? `﻿${text}` : text, conflicts };
  };
  // Same text but for line endings or a BOM: nothing to merge.
  if (no.text === nt.text) return finish(no.text.split("\n"), []);
  if (nb && nb.text === no.text) return finish(nt.text.split("\n"), []);
  if (nb && nb.text === nt.text) return finish(no.text.split("\n"), []);

  // oxlint-disable-next-line no-control-regex -- NUL is how binary-looking text is told apart
  const binary = /\u0000/.test(no.text + nt.text + (nb?.text ?? ""));
  if (!binary) {
    try {
      const r = slideAware(nb?.text ?? null, no.text, nt.text, labels);
      return finish(r.lines, r.conflicts);
    } catch {
      /* fall through to the whole-file merge */
    }
  }
  try {
    const r = mergeLines(
      nb ? nb.text.split("\n") : null,
      no.text.split("\n"),
      nt.text.split("\n"),
      "content",
      labels,
    );
    return finish(r.lines, r.conflicts);
  } catch {
    const c = {
      ours: no.text.split("\n"),
      base: nb ? nb.text.split("\n") : null,
      theirs: nt.text.split("\n"),
    };
    return finish(markerLines(c, labels), [
      {
        offset: 0,
        kind: nb ? "content" : "add-add",
        ours: no.text,
        theirs: nt.text,
        base: nb?.text ?? null,
      },
    ]);
  }
}

/**
 * The conflicts left in a file's text, read back from its markers (after a merge, or a file
 * someone saved half-resolved). Stray marker lines come back as conflicts too, with empty sides,
 * so nothing that would block publishing goes unreported.
 */
export function findConflicts(text: string, path = "deck.mdx"): Conflict[] {
  const mdx = /\.mdx?$/i.test(path);
  const out: Conflict[] = markerBlocks(text).map((b) => {
    const at = mdx ? slideAtLine(text, b.start) : null;
    const deleted =
      b.oursLabel.endsWith(DELETED_SUFFIX.trim()) || b.theirsLabel.endsWith(DELETED_SUFFIX.trim());
    return {
      path,
      ...(at ? { slide: at.slide, ...(at.title ? { title: at.title } : {}) } : {}),
      kind: deleted ? "delete-edit" : b.baseLines === null ? "add-add" : "content",
      ours: b.ours.join("\n"),
      theirs: b.theirs.join("\n"),
      base: b.baseLines ? b.baseLines.join("\n") : null,
      line: b.start + 1,
    };
  });
  for (const l of strayMarkers(text)) {
    const at = mdx ? slideAtLine(text, l) : null;
    out.push({
      path,
      ...(at ? { slide: at.slide } : {}),
      kind: "content",
      ours: "",
      theirs: "",
      base: null,
      line: l + 1,
    });
  }
  return out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}
