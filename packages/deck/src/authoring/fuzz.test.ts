// @ts-nocheck — a port of the reviewer's script; plain JS on purpose.
import { expect, test } from "bun:test";

import { splitDeck } from "../compiler/split.ts";
import * as A from "./index.ts";

/**
 * Adversarial byte-preservation checks (from the PR #6 review): for decks with CRLF and mixed
 * line endings, fences holding separators and <Notes>, frontmatter-only slides, vertical stacks,
 * comments, unicode — every update, patch, notes edit, removal, move to every position and add at
 * every position must change exactly what it says: the slide count is right, every other slide
 * reads exactly as before, and the bytes outside the edited slide are identical.
 */
const decks = {
  basic: `---\ntitle: T\nlayout: cover\n---\n\n# Title\n\n---\n\n## A\n\ntext\n\n---\nlayout: center\n---\n\n## B\n\n<Notes>\nnote b [click] next\n</Notes>\n`,
  crlf: `---\r\ntitle: T\r\n---\r\n\r\n# Title\r\n\r\n---\r\n\r\n## A\r\n\r\n---\r\nlayout: center\r\n---\r\n\r\n## B\r\n`,
  fence:
    "---\ntitle: T\n---\n\n# Title\n\n---\n\n## Code\n\n```yaml\n---\nlayout: evil\n---\n# not a slide\n```\n\n---\n\n## After\n",
  fenceFm: "# One\n\n---\n\n```md\nkey: value\n---\nmore\n```\n\n---\n\n## Three\n",
  vertical:
    "---\ntitle: V\n---\n\n# Top\n\n---\n\n## Col1\n\n----\n\n## Col1 down\n\n----\nlayout: center\n---\n\n## Col1 down2\n\n---\n\n## Col2\n",
  onlyFm:
    "---\ntitle: X\n---\n\n# A\n\n---\nlayout: center\nbackground: aurora\n---\n\n---\n\n## C\n",
  trailing: "# A   \n\t\n---   \n\n## B  \n\n---\n## C",
  unicode:
    '---\ntitle: "தமிழ் 🎉"\n---\n\n# Ünïcødé 🎉\n\n---\n\n## 日本語 — “quotes”\n\nемоджи 👩‍👩‍👧\n',
  notesClick:
    "# A\n\n<Notes>\nfirst [click] second [click:3] third\n</Notes>\n\n---\n\n## B\n\n<Notes>bnotes</Notes>\n",
  noHead: "# First\n\n---\n\n## Second\n\n---\n\n## Third\n",
  commentsFm:
    "---\n# deck comment\ntitle: T # inline\ntheme: minimal\n---\n\n# T\n\n---\n# slide comment\nlayout: center # keep\n---\n\n## B\n",
  notesInCode:
    "# A\n\n---\n\n## Show notes syntax\n\n```mdx\n<Notes>\nexample notes\n</Notes>\n```\n\n---\n\n## C\n",
  fmWithSpaces: "--- \ntitle: T\n--- \n\n# A\n\n---\n\n## B\n",
  mixedEol: "# A\r\n\r\n---\n\n## B\n\n---\r\n\r\n## C\r\n",
  tildeFence: "# A\n\n---\n\n~~~\n---\n~~~\n\n---\n\n## C\n",
  emptyHeadmatterBody:
    "---\ntitle: T\ntheme: minimal\n---\n\n---\n\n# First real\n\n---\n\n## Second\n",
};
const files = (text: string, extra: Record<string, string> = {}) => ({
  entry: "deck.mdx",
  read: (p) => (p === "deck.mdx" ? text : (extra[p] ?? null)),
});
const sig = (s) => JSON.stringify({ fm: s.frontmatter, c: s.content, n: s.notes });
const split = (t, extra = {}) =>
  splitDeck(t, {
    file: "deck.mdx",
    resolveInclude: (p) =>
      extra[p.replace(/^\.\//, "")] != null
        ? { file: p.replace(/^\.\//, ""), text: extra[p.replace(/^\.\//, "")] }
        : null,
  });

const problems = [];
const report = (deck, op, msg) => problems.push(`${deck} :: ${op} :: ${msg}`);

function checkOthers(name, op, before, after, mapIndex) {
  // mapIndex: old index -> new index (or -1 removed)
  before.slides.forEach((s, i) => {
    const j = mapIndex(i);
    if (j < 0) return;
    const t = after.slides[j];
    if (!t) return report(name, op, `slide ${i}→${j} missing`);
    if (sig(s) !== sig(t))
      report(
        name,
        op,
        `slide ${i}→${j} changed: ${sig(s).slice(0, 120)} ≠ ${sig(t).slice(0, 120)}`,
      );
  });
}
function bytesOutside(name, op, text, next, r) {
  // lines before r.start and after r.end must be byte identical
  const eolA = text.split(/(?<=\n)/);
  const pre = eolA.slice(0, r.start).join("");
  const post = eolA.slice(r.end).join("");
  if (!next.startsWith(pre)) report(name, op, `bytes before target changed`);
  if (!next.endsWith(post))
    report(
      name,
      op,
      `bytes after target changed: want tail ${JSON.stringify(post.slice(-60))} got ${JSON.stringify(next.slice(-60))}`,
    );
}

for (const [name, text] of Object.entries(decks)) {
  let before;
  try {
    before = split(text);
  } catch (e) {
    report(name, "split", e.message);
    continue;
  }
  const n = before.slides.length;
  for (let k = 0; k < n; k++) {
    const r = before.slides[k].range;
    // updateSlide content
    try {
      const res = A.updateSlide(files(text), k, { content: "## Replaced ü\n\nnew body" });
      const next = res.files["deck.mdx"];
      const after = split(next);
      if (after.slides.length !== n)
        report(name, `update ${k}`, `count ${n}→${after.slides.length}`);
      checkOthers(name, `update ${k}`, before, after, (i) => (i === k ? -1 : i));
      if (after.slides[k]?.content !== "## Replaced ü\n\nnew body")
        report(name, `update ${k}`, `content wrong: ${JSON.stringify(after.slides[k]?.content)}`);
      if (before.slides[k].notes !== after.slides[k]?.notes)
        report(
          name,
          `update ${k}`,
          `notes lost: ${before.slides[k].notes} → ${after.slides[k]?.notes}`,
        );
      if (
        JSON.stringify(after.slides[k]?.frontmatter) !==
        JSON.stringify(before.slides[k].frontmatter)
      )
        report(name, `update ${k}`, `fm changed`);
      bytesOutside(name, `update ${k}`, text, next, r);
      if (text.includes("\r\n") && !text.match(/[^\r]\n/) && next.match(/[^\r]\n/))
        report(name, `update ${k}`, `LF introduced into CRLF file`);
    } catch (e) {
      report(name, `update ${k}`, `threw ${e.message}`);
    }
    // patch
    try {
      const res = A.updateSlide(files(text), k, { patch: { transition: "fade" } });
      const next = res.files["deck.mdx"];
      const after = split(next);
      if (after.slides.length !== n)
        report(name, `patch ${k}`, `count ${n}→${after.slides.length}`);
      checkOthers(name, `patch ${k}`, before, after, (i) => (i === k ? -1 : i));
      if (after.slides[k]?.frontmatter.transition !== "fade")
        report(name, `patch ${k}`, `patch not applied`);
      if (after.slides[k]?.content !== before.slides[k].content)
        report(name, `patch ${k}`, `content changed`);
      bytesOutside(name, `patch ${k}`, text, next, r);
    } catch (e) {
      report(name, `patch ${k}`, `threw ${e.message}`);
    }
    // setNotes
    try {
      const res = A.setNotes(files(text), k, "hello [click] world");
      const next = res.files["deck.mdx"];
      const after = split(next);
      if (after.slides.length !== n)
        report(name, `notes ${k}`, `count ${n}→${after.slides.length}`);
      checkOthers(name, `notes ${k}`, before, after, (i) => (i === k ? -1 : i));
      if (after.slides[k]?.notes !== "hello [click] world")
        report(name, `notes ${k}`, `notes wrong ${after.slides[k]?.notes}`);
      if (after.slides[k]?.content !== before.slides[k].content)
        report(
          name,
          `notes ${k}`,
          `content changed: ${JSON.stringify(before.slides[k].content)} → ${JSON.stringify(after.slides[k]?.content)}`,
        );
      bytesOutside(name, `notes ${k}`, text, next, r);
    } catch (e) {
      report(name, `notes ${k}`, `threw ${e.message}`);
    }
    // remove
    try {
      const res = A.removeSlide(files(text), k);
      const next = res.files["deck.mdx"];
      const after = split(next);
      if (after.slides.length !== n - 1)
        report(name, `remove ${k}`, `count ${n}→${after.slides.length}`);
      checkOthers(name, `remove ${k}`, before, after, (i) => (i === k ? -1 : i > k ? i - 1 : i));
    } catch (e) {
      report(name, `remove ${k}`, `threw ${e.message}`);
    }
    // move to every position
    for (let t = 0; t < n; t++) {
      try {
        const res = A.moveSlide(files(text), k, t);
        const next = res.files["deck.mdx"] ?? text;
        const after = split(next);
        if (after.slides.length !== n) {
          report(name, `move ${k}->${t}`, `count ${n}→${after.slides.length}`);
          continue;
        }
        const order = before.slides.map((_, i) => i).filter((i) => i !== k);
        order.splice(t, 0, k);
        const map = new Map(order.map((old, idx) => [old, idx]));
        // headmatter-derived slides (index 0) inherit headmatter; skip fm compare for those
        before.slides.forEach((s, i) => {
          const j = map.get(i);
          const a = after.slides[j];
          if (!a) return report(name, `move ${k}->${t}`, `slide ${i} missing`);
          if (s.content !== a.content || s.notes !== a.notes)
            report(
              name,
              `move ${k}->${t}`,
              `slide ${i}→${j} body differs: ${JSON.stringify(s.content).slice(0, 60)} vs ${JSON.stringify(a.content).slice(0, 60)}`,
            );
          if (i !== 0 && j !== 0 && JSON.stringify(s.frontmatter) !== JSON.stringify(a.frontmatter))
            report(
              name,
              `move ${k}->${t}`,
              `slide ${i}→${j} fm differs ${JSON.stringify(s.frontmatter)} vs ${JSON.stringify(a.frontmatter)}`,
            );
        });
        if (
          JSON.stringify(after.headmatter) !== JSON.stringify(before.headmatter) &&
          k !== 0 &&
          t !== 0
        )
          report(name, `move ${k}->${t}`, `headmatter changed`);
      } catch (e) {
        report(name, `move ${k}->${t}`, `threw ${e.message}`);
      }
    }
  }
  // add at every position
  for (let t = 0; t <= n; t++) {
    try {
      const res = A.addSlide(
        files(text),
        { content: "## New", frontmatter: { layout: "center" }, notes: "n [click]" },
        t,
      );
      const next = res.files["deck.mdx"];
      const after = split(next);
      if (after.slides.length !== n + 1)
        report(name, `add @${t}`, `count ${n}→${after.slides.length}`);
      if (after.slides[t]?.content !== "## New")
        report(
          name,
          `add @${t}`,
          `new slide not at ${t}: ${JSON.stringify(after.slides[t]?.content)}`,
        );
      checkOthers(name, `add @${t}`, before, after, (i) =>
        i === 0 && t === 0 ? -1 : i >= t ? i + 1 : i,
      );
      if (text.includes("\r\n") && !text.match(/[^\r]\n/) && next.match(/[^\r]\n/))
        report(name, `add ${t}`, `LF introduced into CRLF file`);
    } catch (e) {
      report(name, `add @${t}`, `threw ${e.message}`);
    }
  }
  // headmatter
  try {
    const res = A.updateHeadmatter(files(text), { theme: "rla", title: null });
    const next = res.files["deck.mdx"];
    const after = split(next);
    if (after.headmatter.theme !== "rla")
      report(name, "headmatter", `theme not set: ${JSON.stringify(after.headmatter)}`);
    if ("title" in after.headmatter) report(name, "headmatter", "title not removed");
    if (after.slides.length !== n) report(name, "headmatter", `count ${n}→${after.slides.length}`);
    checkOthers(name, "headmatter", before, after, (i) => (i === 0 ? -1 : i));
  } catch (e) {
    report(name, "headmatter", `threw ${e.message}`);
  }
}

test("every edit, on every slide of every awkward deck, changes only what it says", () => {
  expect(problems).toEqual([]);
});
