import { describe, expect, test } from "bun:test";

import { splitDeck } from "../compiler/split.ts";
import {
  DELETED_FILE_SUFFIX,
  DELETED_SUFFIX,
  canonicalManifest,
  diff3,
  diffHunks,
  findConflicts,
  hasConflictMarkers,
  ignoreMatcher,
  isEditablePath,
  mergeDeckSource,
  mergeMdx,
  resolveConflict,
  resolveSlide,
  sha256Hex,
  sourceHash,
  sourceManifest,
} from "./index.ts";

const DECK = `---
title: Talk
theme: minimal
---

# Hello

First slide.

---

# Two

Line a
Line b

---
layout: center
---

# Three

---

# Four
`;

const slidesOf = (text: string) => splitDeck(text, { file: "deck.mdx", onError: () => {} }).slides;
const titles = (text: string) =>
  slidesOf(text).map((s) => /^#+\s+(.*)$/m.exec(s.content)?.[1] ?? "");

describe("diff", () => {
  test("hunks turn one array into the other", () => {
    const o = ["a", "b", "c", "d"];
    const x = ["a", "B", "c", "d", "e"];
    const hunks = diffHunks(o, x);
    expect(hunks).toEqual([
      { oStart: 1, oEnd: 2, xStart: 1, xEnd: 2 },
      { oStart: 4, oEnd: 4, xStart: 4, xEnd: 5 },
    ]);
  });

  test("diff3: separate changes apply, the same change once, overlapping ones conflict", () => {
    expect(diff3(["a", "b", "c"], ["A", "b", "c"], ["a", "b", "C"])).toEqual([
      { ok: ["A", "b", "C"] },
    ]);
    expect(diff3(["a"], ["x"], ["x"])).toEqual([{ ok: ["x"] }]);
    const c = diff3(["a", "b"], ["x", "b"], ["y", "b"]);
    expect(c[0]).toEqual({ conflict: { ours: ["x"], base: ["a"], theirs: ["y"] } });
  });

  test("zealous conflicts wrap only what differs", () => {
    const c = diff3(["a"], ["same", "x", "end"], ["same", "y", "end"]);
    expect(c).toEqual([
      { ok: ["same"] },
      { conflict: { ours: ["x"], base: ["a"], theirs: ["y"] } },
      { ok: ["end"] },
    ]);
  });

  test("a very different pair does not run away", () => {
    const a = Array.from({ length: 6000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 6000 }, (_, i) => `b${i}`);
    const t0 = performance.now();
    expect(diffHunks(a, b)).toEqual([{ oStart: 0, oEnd: 6000, xStart: 0, xEnd: 6000 }]);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("mergeMdx", () => {
  test("edits on different slides and the headmatter merge cleanly", () => {
    const ours = DECK.replace("Line a", "Line A (ours)").replace(
      "# Four\n",
      "# Four\n\nours added\n",
    );
    const theirs = DECK.replace("theme: minimal", "theme: neon").replace(
      "# Three",
      "# Three (theirs)",
    );
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toContain("theme: neon");
    expect(r.text).toContain("Line A (ours)");
    expect(r.text).toContain("# Three (theirs)");
    expect(r.text).toContain("ours added");
  });

  test("the same line edited both ways is a git-style conflict on that slide", () => {
    const r = mergeMdx(DECK, DECK.replace("Line a", "ours"), DECK.replace("Line a", "theirs"), {
      oursLabel: "local (your files)",
      baseLabel: "base v12",
      theirsLabel: "web v14 (Quick edit by Asha, 25 Oct 14:02)",
    });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      slide: 2,
      title: "Two",
      kind: "content",
      ours: "ours",
      theirs: "theirs",
      base: "Line a",
    });
    expect(r.text).toContain(
      "<<<<<<< local (your files)\nours\n||||||| base v12\nLine a\n=======\ntheirs\n>>>>>>> web v14 (Quick edit by Asha, 25 Oct 14:02)\nLine b",
    );
    expect(hasConflictMarkers(r.text)).toBe(true);
    // The conflict does not change how the deck splits.
    expect(slidesOf(r.text)).toHaveLength(4);
    expect(r.text.split("\n")[r.conflicts[0]!.line! - 1]).toStartWith("<<<<<<<");
  });

  test("resolve: ours, theirs, both", () => {
    const r = mergeMdx(DECK, DECK.replace("Line a", "ours"), DECK.replace("Line a", "theirs"));
    expect(resolveConflict(r.text, "ours")).toBe(DECK.replace("Line a", "ours"));
    expect(resolveConflict(r.text, "theirs")).toBe(DECK.replace("Line a", "theirs"));
    expect(resolveConflict(r.text, "both")).toBe(DECK.replace("Line a", "ours\ntheirs"));
    expect(hasConflictMarkers(resolveConflict(r.text, "both"))).toBe(false);
  });

  test("resolve one block of several, and every block of one slide", () => {
    const ours = DECK.replace("Line a", "o1").replace("# Four", "# Four o");
    const theirs = DECK.replace("Line a", "t1").replace("# Four", "# Four t");
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.conflicts.map((c) => c.slide)).toEqual([2, 4]);
    const first = resolveConflict(r.text, "theirs", 0);
    expect(findConflicts(first)).toHaveLength(1);
    expect(first).toContain("t1");
    const four = resolveSlide(r.text, 4, "ours");
    expect(findConflicts(four).map((c) => c.slide)).toEqual([2]);
    expect(four).toContain("# Four o");
  });

  test("a slide added on both sides at the same place keeps both, ours first", () => {
    const at = "\n---\nlayout: center\n---\n";
    const ours = DECK.replace(at, `\n---\n\n# Ours new\n${at}`);
    const theirs = DECK.replace(at, `\n---\n\n# Theirs new\n${at}`);
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(titles(r.text)).toEqual(["Hello", "Two", "Ours new", "Theirs new", "Three", "Four"]);
  });

  test("a reorder on one side and an edit on the other both apply", () => {
    // ours moves "Four" before "Two"; theirs edits Two.
    const ours = `---
title: Talk
theme: minimal
---

# Hello

First slide.

---

# Four

---

# Two

Line a
Line b

---
layout: center
---

# Three
`;
    const theirs = DECK.replace("Line b", "Line b, edited");
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(titles(r.text)).toEqual(["Hello", "Four", "Two", "Three"]);
    expect(r.text).toContain("Line b, edited");
  });

  test("deleted on one side, edited on the other: kept, marked; choosing the deletion deletes it", () => {
    const ours = DECK.replace("\n---\n\n# Two\n\nLine a\nLine b\n", "");
    const theirs = DECK.replace("Line a", "Line a, edited");
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ kind: "delete-edit", slide: 2 });
    expect(r.text).toContain(`<<<<<<< ours${DELETED_SUFFIX}`);
    expect(titles(resolveConflict(r.text, "ours"))).toEqual(["Hello", "Three", "Four"]);
    const kept = resolveConflict(r.text, "theirs");
    expect(titles(kept)).toEqual(["Hello", "Two", "Three", "Four"]);
    expect(kept).toContain("Line a, edited");
  });

  test("deleted on one side, untouched on the other: gone", () => {
    const ours = DECK.replace("\n---\n\n# Two\n\nLine a\nLine b\n", "");
    const r = mergeMdx(DECK, ours, DECK.replace("theme: minimal", "theme: neon"));
    expect(r.conflicts).toEqual([]);
    expect(titles(r.text)).toEqual(["Hello", "Three", "Four"]);
    expect(r.text).toContain("theme: neon");
  });

  test("headmatter merges per key; the same key both ways is a frontmatter conflict", () => {
    const ours = DECK.replace("title: Talk", "title: Ours");
    const theirs = DECK.replace("title: Talk", "title: Theirs").replace(
      "theme: minimal",
      "theme: neon",
    );
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      kind: "frontmatter",
      slide: 1,
      ours: "title: Ours",
      theirs: "title: Theirs",
    });
    // theme went in cleanly, and the head is still the head (the fence kept).
    expect(r.text).toContain("theme: neon");
    const split = splitDeck(resolveConflict(r.text, "theirs"), { file: "deck.mdx" });
    expect(split.headmatter).toEqual({ title: "Theirs", theme: "neon" });
    expect(split.slides).toHaveLength(4);
  });

  test("slide frontmatter merges per key, comments and formatting kept", () => {
    const base = "# A\n\n---\nlayout: center # keep me\nclass: x\n---\n\n# B\n";
    const ours = base.replace("class: x", "class: y");
    const theirs = base.replace("---\nlayout", "---\ntransition: fade\nlayout");
    const r = mergeMdx(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toContain("# keep me");
    expect(slidesOf(r.text)[1]!.frontmatter).toEqual({
      transition: "fade",
      layout: "center",
      class: "y",
    });
  });

  test("slides with an id are matched by it, even when rewritten", () => {
    const base = "# A\n\n---\nid: intro\n---\n\n# Intro\n\nold text\n\n---\n\n# Z\n";
    const ours = "# A\n\n---\n\n# Z\n\n---\nid: intro\n---\n\n# Completely new\n\nnothing alike\n";
    const theirs = base.replace("# Z", "# Z edited");
    const r = mergeMdx(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(titles(r.text)).toEqual(["A", "Z edited", "Completely new"]);
  });

  test("vertical slides and code fences with --- in them survive", () => {
    const base = "# A\n\n----\n\n# A.1\n\n```yaml\n---\nkey: v\n---\n```\n\n---\n\n# B\n";
    const ours = base.replace("key: v", "key: ours");
    const theirs = base.replace("# B", "# B (theirs)");
    const r = mergeMdx(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toBe(ours.replace("# B", "# B (theirs)"));
  });

  test("a conflict that opens a code block on one side only cannot swallow later slides", () => {
    const base = "# A\n\nx\n\n---\n\n# B\n\n---\n\n# C\n";
    const ours = base.replace("x", "```js\nconst a = 1;\n```");
    const theirs = base.replace("x", "plain text");
    const r = mergeMdx(base, ours, theirs);
    expect(r.conflicts).toHaveLength(1);
    expect(titles(r.text)).toEqual(["A", "B", "C"]);
  });

  test("no base: what differs conflicts unless one side equals the other", () => {
    const ours = DECK.replace("Line a", "ours");
    const theirs = DECK.replace("Line a", "theirs").replace(
      "# Four\n",
      "# Four\n\n---\n\n# Five\n",
    );
    const r = mergeMdx(null, ours, theirs);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ kind: "add-add", slide: 2 });
    expect(titles(r.text)).toEqual(["Hello", "Two", "Three", "Four", "Five"]);
    expect(mergeMdx(null, DECK, DECK).text).toBe(DECK);
  });

  test("CRLF, BOM and a missing final newline are not changes", () => {
    const crlf = `﻿${DECK.replace(/\n/g, "\r\n")}`;
    const theirs = DECK.replace("Line b", "Line b2").replace(/\n$/, "");
    const r = mergeMdx(DECK, crlf, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.text.startsWith("﻿")).toBe(true);
    expect(r.text).toContain("Line b2\r\n");
    expect(r.text.replace(/\r\n/g, "\n").replace(/^﻿/, "")).toBe(DECK.replace("Line b", "Line b2"));
  });

  test("nasty input never throws", () => {
    const nasty = [
      "",
      "\n",
      "---",
      "---\n---\n---",
      "```\nunclosed fence\n---\n# x",
      "---\ntitle: [unclosed\n---\n# broken yaml",
      "\u0000\u0001binary\u0000looking",
      "<<<<<<< half a conflict\n# x",
      "=======\n>>>>>>> stray",
      "::card\n---\n::",
      "a\r\nb\rc\n",
      "﻿---\ntitle: x\n---\n",
      DECK.repeat(30),
    ];
    for (const b of [null, ...nasty])
      for (const o of nasty)
        for (const t of nasty.slice(0, 6)) {
          const r = mergeMdx(b, o, t);
          expect(typeof r.text).toBe("string");
          expect(Array.isArray(r.conflicts)).toBe(true);
        }
    expect(() => mergeMdx(undefined as never, null as never, 42 as never)).not.toThrow();
  });

  test("a file replaced wholesale on one side, edited on the other", () => {
    const ours = "# Something else entirely\n\nnew talk\n";
    const theirs = DECK.replace("Line a", "Line a, edited");
    const r = mergeMdx(DECK, ours, theirs);
    expect(r.text).toContain("Something else entirely");
    expect(r.text).toContain("Line a, edited");
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  test("a large deck merges quickly", () => {
    const big = Array.from(
      { length: 800 },
      (_, i) => `# Slide ${i}\n\nText ${i}\n\n- point ${i}`,
    ).join("\n\n---\n\n");
    const ours = big.replace("Text 10\n", "Text 10 (ours)\n");
    const theirs = big.replace("Text 700\n", "Text 700 (theirs)\n");
    const t0 = performance.now();
    const r = mergeMdx(big, ours, theirs);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(r.conflicts).toEqual([]);
    expect(r.text).toContain("Text 10 (ours)");
    expect(r.text).toContain("Text 700 (theirs)");
  });
});

/* ── properties ────────────────────────────────────────────────────────────── */

/** A small seeded PRNG (mulberry32), so a failing case can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uid = 0;
interface GenSlide {
  fm: Record<string, string> | null;
  lines: string[];
  vertical: boolean;
}
const word = (r: () => number) =>
  ["alpha", "beta", "gamma", "delta", "kappa", "omega", "sigma"][Math.floor(r() * 7)]!;
const line = (r: () => number) => `${word(r)} ${word(r)} ${++uid}`;

function genSlide(r: () => number): GenSlide {
  const fm = r() < 0.3 ? { layout: r() < 0.5 ? "center" : "two-cols" } : null;
  const lines = [
    `# ${word(r)} ${++uid}`,
    "",
    ...Array.from({ length: 1 + Math.floor(r() * 4) }, () => line(r)),
  ];
  if (r() < 0.2) lines.push("", "```ts", `const x${++uid} = 1;`, "---", "```");
  return { fm, lines, vertical: r() < 0.15 };
}

function render(head: Record<string, string>, slides: GenSlide[]): string {
  const out = ["---", ...Object.entries(head).map(([k, v]) => `${k}: ${v}`), "---", ""];
  slides.forEach((s, i) => {
    if (i > 0) {
      out.push("", s.vertical ? "----" : "---");
      if (s.fm) out.push(...Object.entries(s.fm).map(([k, v]) => `${k}: ${v}`), "---");
      out.push("");
    }
    out.push(...s.lines);
  });
  return `${out.join("\n")}\n`;
}

type Deck = { head: Record<string, string>; slides: GenSlide[] };
const clone = (d: Deck): Deck => JSON.parse(JSON.stringify(d)) as Deck;

/** One side's edits, each confined to the base slides in `mine`, so two sides can be kept apart. */
function edit(
  r: () => number,
  d: Deck,
  mine: Set<number>,
  opts: { structural: boolean; tag: string },
): Deck {
  const e = clone(d);
  let entries = e.slides.map((s, i) => ({ i, s }));
  for (const { i, s } of entries) {
    if (!mine.has(i)) continue;
    const what = r();
    // Text lines only: rewriting a fence line would change the deck's structure on one side.
    const text = s.lines
      .map((l, k) => (/^[a-z]+ [a-z]+ \d+$/.test(l) ? k : -1))
      .filter((k) => k >= 0);
    if (what < 0.5 && text.length) s.lines[text[Math.floor(r() * text.length)]!] = line(r);
    else if (what < 0.8) s.lines.push(line(r));
    else if (s.fm) s.fm.layout = `changed-${++uid}`;
    else s.lines.splice(2, 0, line(r));
  }
  if (opts.structural) {
    const touched = [...mine].filter((i) => i < entries.length);
    const after = touched[Math.floor(r() * touched.length)];
    if (after !== undefined) {
      const at = entries.findIndex((x) => x.i === after);
      entries.splice(at + 1, 0, { i: -1, s: genSlide(r) });
    }
    const dels = touched.filter((i) => i > 0 && i !== after);
    if (dels.length && r() < 0.4) {
      const del = dels[Math.floor(r() * dels.length)];
      entries = entries.filter((x) => x.i !== del);
    }
  }
  e.slides = entries.map((x) => x.s);
  if (r() < 0.3) e.head[`${opts.tag}${Math.floor(r() * 3)}`] = `v${++uid}`;
  return e;
}

const changeSet = (base: string, side: string) => {
  const counts = new Map<string, number>();
  for (const l of base.split("\n")) counts.set(l, (counts.get(l) ?? 0) + 1);
  const out: string[] = [];
  for (const l of side.split("\n")) {
    const c = counts.get(l) ?? 0;
    if (c > 0) counts.set(l, c - 1);
    else if (l.trim()) out.push(l);
  }
  return out;
};

describe("merge properties", () => {
  const CASES = 250;

  test("merge(b, x, b) == x, merge(b, b, y) == y, merge(b, x, x) == x", () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const r = rng(seed);
      const base: Deck = {
        head: { title: `T${seed}` },
        slides: Array.from({ length: 2 + Math.floor(r() * 8) }, () => genSlide(r)),
      };
      const all = new Set(base.slides.map((_, i) => i).filter(() => r() < 0.5));
      const b = render(base.head, base.slides);
      const xd = edit(r, base, all, { structural: r() < 0.5, tag: "x" });
      const x = render(xd.head, xd.slides);
      expect(mergeMdx(b, x, b).text).toBe(x);
      expect(mergeMdx(b, b, x).text).toBe(x);
      expect(mergeMdx(b, x, x).text).toBe(x);
      expect(mergeMdx(null, x, x).text).toBe(x);
    }
  });

  test("edits to different slides merge cleanly, lose no line, and re-merge to themselves", () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const r = rng(seed * 7919);
      const base: Deck = {
        head: { title: `T${seed}` },
        slides: Array.from({ length: 4 + Math.floor(r() * 10) }, () => genSlide(r)),
      };
      const n = base.slides.length;
      const mineO = new Set<number>();
      const mineT = new Set<number>();
      // Keep the two sides at least one slide apart: a slide each side leaves alone in between.
      for (let i = 0; i < n; i++) if (i % 4 === 0) mineO.add(i);
      for (let i = 0; i < n; i++) if (i % 4 === 2) mineT.add(i);
      const structural = r() < 0.5;
      const b = render(base.head, base.slides);
      const od = edit(r, base, mineO, { structural, tag: "ours" });
      const td = edit(r, base, mineT, { structural, tag: "theirs" });
      const o = render(od.head, od.slides);
      const t = render(td.head, td.slides);
      const m = mergeMdx(b, o, t);
      const context = `seed ${seed}\n--- base\n${b}\n--- ours\n${o}\n--- theirs\n${t}\n--- merged\n${m.text}`;
      expect(m.conflicts, context).toEqual([]);
      expect(hasConflictMarkers(m.text), context).toBe(false);
      for (const l of [...changeSet(b, o), ...changeSet(b, t)])
        expect(m.text.split("\n"), `${context}\n--- lost: ${l}`).toContain(l);
      // Pull again with nothing new: nothing changes.
      expect(mergeMdx(b, m.text, t).text, context).toBe(m.text);
      expect(mergeMdx(b, o, m.text).text, context).toBe(m.text);
      expect(mergeMdx(t, m.text, t).text).toBe(m.text);
    }
  });

  test("conflicting edits keep every line of both sides until resolved, and resolving clears them", () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const r = rng(seed * 104729);
      const base: Deck = {
        head: { title: `T${seed}` },
        slides: Array.from({ length: 3 + Math.floor(r() * 6) }, () => genSlide(r)),
      };
      const both = new Set(base.slides.map((_, i) => i).filter(() => r() < 0.6));
      const b = render(base.head, base.slides);
      const od = edit(r, base, both, { structural: r() < 0.3, tag: "same" });
      const td = edit(r, base, both, { structural: r() < 0.3, tag: "same" });
      const o = render(od.head, od.slides);
      const t = render(td.head, td.slides);
      const m = mergeMdx(b, o, t);
      const context = `seed ${seed}\n--- base\n${b}\n--- ours\n${o}\n--- theirs\n${t}\n--- merged\n${m.text}`;
      const only = (x: string[], y: string[]) => x.filter((l) => !y.includes(l));
      const co = changeSet(b, o);
      const ct = changeSet(b, t);
      for (const l of [...only(co, ct), ...only(ct, co)])
        expect(m.text.split("\n"), `${context}\nlost: ${l}`).toContain(l);
      expect(findConflicts(m.text).length, context).toBe(m.conflicts.length);
      for (const choice of ["ours", "theirs", "both"] as const) {
        const resolved = resolveConflict(m.text, choice);
        expect(hasConflictMarkers(resolved), `${context}\n${choice}`).toBe(false);
        // A resolved file pulled again, unchanged on the other side, stays as resolved.
        expect(mergeMdx(t, resolved, t).text).toBe(resolved);
        expect(mergeMdx(resolved, resolved, resolved).text).toBe(resolved);
      }
      // Markers never change how many slides the file splits into, against the "both" resolution.
      expect(slidesOf(m.text).length, context).toBe(
        slidesOf(resolveConflict(m.text, "both")).length,
      );
    }
  });
});

describe("short slides: the same place is the same slide", () => {
  const deck = (...slides: string[]) => `---\ntitle: T\n---\n\n${slides.join("\n\n---\n\n")}\n`;

  test("a one-line slide edited both ways is a conflict, not two slides", () => {
    const b = deck("# Intro", "# Hi", "# End");
    const r = mergeMdx(b, deck("# Intro", "# Hello", "# End"), deck("# Intro", "# Hey", "# End"));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      slide: 2,
      kind: "content",
      ours: "# Hello",
      theirs: "# Hey",
    });
    expect(slidesOf(r.text)).toHaveLength(3);
    expect(resolveConflict(r.text, "theirs")).toBe(deck("# Intro", "# Hey", "# End"));
  });

  test("first, last and only slides", () => {
    const first = mergeMdx(
      deck("# A", "# Mid"),
      deck("# Apples", "# Mid"),
      deck("# Bees", "# Mid"),
    );
    expect(first.conflicts.map((c) => c.slide)).toEqual([1]);
    const last = mergeMdx(deck("# Mid", "# Z"), deck("# Mid", "# Zebra"), deck("# Mid", "# Yak"));
    expect(last.conflicts.map((c) => c.slide)).toEqual([2]);
    const only = mergeMdx(deck("# Hi"), deck("# Hello"), deck("# Hey"));
    expect(only.conflicts.map((c) => c.slide)).toEqual([1]);
    for (const r of [first, last, only])
      expect(slidesOf(r.text)).toHaveLength(slidesOf(resolveConflict(r.text, "ours")).length);
    // With no base snapshot the two still pair up and conflict.
    expect(mergeMdx(null, deck("# Mid", "# Zebra"), deck("# Mid", "# Yak")).conflicts).toHaveLength(
      1,
    );
  });

  test("slides that differ only in their title", () => {
    const b = deck("## Agenda\n\nWhat we cover.", "## Results\n\nNumbers go here.", "## Thanks");
    const o = deck("## Plan\n\nWhat we cover.", "## Results\n\nNumbers go here.", "## Thank you");
    const t = deck(
      "## Roadmap\n\nWhat we cover.",
      "## Results\n\nNumbers go here.",
      "## Questions?",
    );
    const r = mergeMdx(b, o, t);
    expect(r.conflicts.map((c) => c.slide)).toEqual([1, 3]);
    expect(slidesOf(r.text)).toHaveLength(3);
    // One side only: taken cleanly.
    expect(mergeMdx(b, o, b)).toEqual({ text: o, conflicts: [] });
    expect(mergeMdx(b, b, t)).toEqual({ text: t, conflicts: [] });
  });

  test("an add on both sides at the same place still keeps both", () => {
    const b = deck("# A", "# B");
    const r = mergeMdx(b, deck("# A", "# X", "# B"), deck("# A", "# Y", "# B"));
    expect(r.conflicts).toEqual([]);
    expect(titles(r.text)).toEqual(["A", "X", "Y", "B"]);
    // A run of new slides where the base had a different number of them is not paired either.
    const r2 = mergeMdx(
      deck("# A", "# S", "# B"),
      deck("# A", "# S", "# B"),
      deck("# A", "# P", "# Q", "# B"),
    );
    expect(r2.conflicts).toEqual([]);
    expect(titles(r2.text)).toEqual(["A", "P", "Q", "B"]);
  });

  test("slides with different ids in the same place are not paired", () => {
    const b = deck("---\nid: one\n---\n\n# Hi");
    const r = mergeMdx(b, deck("---\nid: two\n---\n\n# Hello"), b);
    expect(r).toEqual({ text: deck("---\nid: two\n---\n\n# Hello"), conflicts: [] });
  });

  test("property: one-line slides edited at the same place, on one side or both", () => {
    const words = ["Hi", "Yo", "Ok", "Go", "Up", "No", "So", "Me", "We", "Be"];
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 31337);
      const pickWord = () => `${words[Math.floor(r() * words.length)]}${Math.floor(r() * 100)}`;
      const n = 1 + Math.floor(r() * 6);
      const base = Array.from({ length: n }, (_, i) => `# S${i} ${pickWord()}`);
      const i = Math.floor(r() * n);
      const ours = [...base];
      const theirs = [...base];
      ours[i] = `# ${pickWord()}!`;
      theirs[i] = `# ${pickWord()}?`;
      const b = deck(...base);
      const context = `seed ${seed}: ${base.join(" | ")} → ${ours[i]} / ${theirs[i]}`;
      const both = mergeMdx(b, deck(...ours), deck(...theirs));
      expect(
        both.conflicts.map((c) => c.slide),
        context,
      ).toEqual([i + 1]);
      expect(slidesOf(both.text).length, context).toBe(n);
      expect(resolveConflict(both.text, "ours"), context).toBe(deck(...ours));
      expect(mergeMdx(b, deck(...ours), b).text, context).toBe(deck(...ours));
      expect(mergeMdx(b, b, deck(...theirs)).text, context).toBe(deck(...theirs));
    }
  });
});

/* ── the whole source ──────────────────────────────────────────────────────── */

describe("mergeDeckSource", () => {
  test("per path: one side's change, add or delete is taken; both sides merge by kind", () => {
    const base = {
      "deck.mdx": DECK,
      "glossary.yaml": "a: 1\nb: 2\n",
      "data/x.json": '{\n  "a": 1\n}\n',
      "drawings/s.svg": "<svg/>",
    };
    const ours = {
      ...base,
      "deck.mdx": DECK.replace("Line a", "ours"),
      "pages/new.mdx": "# new",
    } as Record<string, string>;
    delete ours["glossary.yaml"];
    const theirs = {
      ...base,
      "deck.mdx": DECK.replace("# Four", "# Four (web)"),
      "data/x.json": '{\n  "a": 2\n}\n',
    };
    const r = mergeDeckSource(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.deleted).toEqual([]);
    expect(Object.keys(r.files).sort()).toEqual([
      "data/x.json",
      "deck.mdx",
      "drawings/s.svg",
      "pages/new.mdx",
    ]);
    expect(r.files["deck.mdx"]).toContain("ours");
    expect(r.files["deck.mdx"]).toContain("# Four (web)");
    expect(r.files["data/x.json"]).toContain('"a": 2');
  });

  test("a deletion on the other side is reported in `deleted`", () => {
    const base = { "deck.mdx": DECK, "pages/a.mdx": "# A" };
    const theirs = { "deck.mdx": DECK };
    const r = mergeDeckSource(base, base, theirs);
    expect(r.deleted).toEqual(["pages/a.mdx"]);
    expect(r.files).toEqual({ "deck.mdx": DECK });
  });

  test("drawings edited both ways conflict whole; broken JSON after a line merge is a conflict", () => {
    const base = { "drawings/s.svg": "<svg>\n<a/>\n</svg>", "data/x.json": '{"a":1,\n"b":2}' };
    const ours = { "drawings/s.svg": "<svg>\n<b/>\n</svg>", "data/x.json": '{"a":1,\n"b":3}' };
    const theirs = {
      "drawings/s.svg": "<svg>\n<a/>\n<c/>\n</svg>",
      "data/x.json": '{"a":2,\n"b":2}',
    };
    const r = mergeDeckSource(base, ours, theirs);
    // the JSON line merge is clean and still parses
    expect(JSON.parse(r.files["data/x.json"]!)).toEqual({ a: 2, b: 3 });
    expect(r.conflicts.map((c) => c.path)).toEqual(["drawings/s.svg"]);
    expect(r.clean).toBe(false);
  });

  test("a file deleted on one side and edited on the other is kept, and resolving to the deletion empties it", () => {
    const base = { "deck.mdx": DECK, "pages/a.mdx": "# A\n\nold" };
    const ours = { "deck.mdx": DECK };
    const theirs = { "deck.mdx": DECK, "pages/a.mdx": "# A\n\nnew" };
    const r = mergeDeckSource(base, ours, theirs, { oursLabel: "local", theirsLabel: "web v3" });
    expect(r.conflicts).toMatchObject([{ path: "pages/a.mdx", kind: "delete-edit" }]);
    expect(r.files["pages/a.mdx"]).toStartWith(`<<<<<<< local${DELETED_FILE_SUFFIX}`);
    expect(resolveConflict(r.files["pages/a.mdx"]!, "ours")).toBe("");
    expect(resolveConflict(r.files["pages/a.mdx"]!, "theirs")).toBe("# A\n\nnew");
  });

  test("no base: everything that differs conflicts, the same file on both sides does not", () => {
    const r = mergeDeckSource(
      null,
      { "deck.mdx": DECK, "a.yaml": "x: 1" },
      { "deck.mdx": DECK, "a.yaml": "x: 2" },
    );
    expect(r.conflicts).toMatchObject([{ path: "a.yaml", kind: "add-add" }]);
    expect(r.files["deck.mdx"]).toBe(DECK);
  });
});

describe("markers", () => {
  test("only whole lines at column 0 are markers; strays still count", () => {
    expect(hasConflictMarkers("```\n <<<<<<< indented\n =======\n >>>>>>> x\n```")).toBe(false);
    expect(hasConflictMarkers("a\n<<<<<<< left over\nb")).toBe(true);
    expect(findConflicts("a\n>>>>>>> left over")).toHaveLength(1);
    expect(hasConflictMarkers("=======\nheading underline")).toBe(false);
  });
});

describe("manifest", () => {
  test("editable paths", () => {
    for (const p of [
      "deck.mdx",
      "pages/a.mdx",
      "pages/deep/b.md",
      "slides/01-intro.mdx",
      "glossary.yaml",
      "data/x.csv",
      "data/nested/y.json",
      "drawings/s.svg",
      "drawings/x.excalidraw",
    ])
      expect(isEditablePath(p), p).toBe(true);
    for (const p of [
      "src/components.tsx",
      "deck.config.ts",
      "package.json",
      "public/a.png",
      "vite.config.ts",
      "../deck.mdx",
      "/deck.mdx",
      "pages/../src/x.mdx",
      ".kadal-deck/sync.json",
      "pages/.hidden.mdx",
      "README.md",
      "other.mdx",
      "data/x.ts",
    ])
      expect(isEditablePath(p), p).toBe(false);
  });

  test("ignore files read like .gitignore", () => {
    const ignored = ignoreMatcher(
      "# drafts\npages/drafts/\n*.secret.yaml\n!keep.secret.yaml\n/data/big.csv",
    );
    expect(ignored("pages/drafts/x.mdx")).toBe(true);
    expect(ignored("pages/a.mdx")).toBe(false);
    expect(ignored("data/a.secret.yaml")).toBe(true);
    expect(ignored("keep.secret.yaml")).toBe(false);
    expect(ignored("data/big.csv")).toBe(true);
    expect(ignored("data/sub/data/big.csv")).toBe(false);
  });

  test("the hash is of the sorted path<TAB>sha lines", async () => {
    const m = await sourceManifest({ "pages/a.mdx": "a", "deck.mdx": "é" });
    expect(m["deck.mdx"]!.size).toBe(2);
    expect(m["deck.mdx"]!.sha256).toBe(await sha256Hex("é"));
    expect(canonicalManifest(m)).toBe(
      `deck.mdx	${m["deck.mdx"]!.sha256}
pages/a.mdx	${m["pages/a.mdx"]!.sha256}
`,
    );
    expect(await sourceHash(m)).toBe(await sha256Hex(canonicalManifest(m)));
    expect(await sourceHash({ b: { sha256: "1" }, a: { sha256: "2" } })).toBe(
      await sourceHash({ a: { sha256: "2" }, b: { sha256: "1" } }),
    );
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
