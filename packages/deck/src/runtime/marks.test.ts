import { describe, expect, test } from "bun:test";

import { cleanTyped } from "./edit.ts";
import {
  MARK_CLOSE as C,
  MARK_OPEN as O,
  cleanHref,
  extractMarks,
  markdownWithMarks,
} from "./marks.ts";

describe("markdownWithMarks", () => {
  test("bold, italic and links over plain text", () => {
    expect(
      markdownWithMarks("Ship it today", [
        { from: 0, to: 4, mark: "bold" },
        { from: 5, to: 7, mark: "italic" },
        { from: 8, to: 13, mark: "link", href: "https://kadal.cc" },
      ]),
    ).toBe("**Ship** _it_ [today](https://kadal.cc)");
  });

  test("nested marks open outer first and close inner first", () => {
    expect(
      markdownWithMarks("a big win", [
        { from: 2, to: 9, mark: "bold" },
        { from: 2, to: 5, mark: "italic" },
      ]),
    ).toBe("a **_big_ win**");
    expect(
      markdownWithMarks("read the docs", [
        { from: 0, to: 13, mark: "link", href: "https://x.test" },
        { from: 5, to: 8, mark: "bold" },
      ]),
    ).toBe("[read **the** docs](https://x.test)");
  });

  test("a mark's own spaces move outside it", () => {
    expect(markdownWithMarks("say  this  now", [{ from: 3, to: 11, mark: "bold" }])).toBe(
      "say  **this**  now",
    );
    expect(markdownWithMarks("   ", [{ from: 0, to: 3, mark: "bold" }])).toBe("   ");
  });

  test("italic inside a word is *…*, since _ would not emphasise there", () => {
    expect(markdownWithMarks("unbelievable", [{ from: 2, to: 6, mark: "italic" }])).toBe(
      "un*beli*evable",
    );
  });

  test("the plain text between marks goes through escape, the marks do not", () => {
    const escape = (s: string, start: boolean) =>
      (start ? "^" : "") + s.replace(/[*_[\]]/g, (c) => `\\${c}`);
    expect(markdownWithMarks("2*3 is six", [{ from: 7, to: 10, mark: "bold" }], escape)).toBe(
      "^2\\*3 is **six**",
    );
    expect(markdownWithMarks("a\nb", [{ from: 2, to: 3, mark: "italic" }], escape)).toBe(
      "^a\n_^b_",
    );
  });

  test("crossing marks, empty links and out-of-range marks are dropped", () => {
    expect(
      markdownWithMarks("abcdef", [
        { from: 0, to: 4, mark: "bold" },
        { from: 2, to: 6, mark: "italic" },
        { from: 1, to: 2, mark: "link" },
        { from: 4, to: 99, mark: "bold" },
      ]),
    ).toBe("**abcd**ef");
  });

  test("an address with spaces or parentheses is bracketed", () => {
    expect(
      markdownWithMarks("x", [{ from: 0, to: 1, mark: "link", href: "https://w.test/a_(b)" }]),
    ).toBe("[x](<https://w.test/a_(b)>)");
  });
});

describe("extractMarks", () => {
  test("sentinels out, marks at the offsets of the clean text", () => {
    const raw = `${O}Ship${C} it ${O}to${O}day${C}${C}`;
    const r = extractMarks(raw, [
      { mark: "bold" },
      { mark: "link", href: "https://x" },
      { mark: "italic" },
    ]);
    expect(r.text).toBe("Ship it today");
    expect(r.marks).toEqual([
      { from: 0, to: 4, mark: "bold" },
      { from: 8, to: 13, mark: "link", href: "https://x" },
      { from: 10, to: 13, mark: "italic" },
    ]);
  });

  test("survives the clean-up of what was typed (spaces, line breaks, ends)", () => {
    const raw = `  one ${O}two${C}\n\n ${O}three${C}  `;
    const r = extractMarks(cleanTyped(raw, false), [{ mark: "bold" }, { mark: "italic" }]);
    expect(r.text).toBe("one two three");
    expect(markdownWithMarks(r.text, r.marks)).toBe("one **two** _three_");
  });

  test("an emptied mark is dropped", () => {
    expect(extractMarks(`a${O}${C}b`, [{ mark: "bold" }])).toEqual({ text: "ab", marks: [] });
  });
});

describe("cleanHref", () => {
  test("a scheme for a bare domain, mailto for an address, script URLs refused", () => {
    expect(cleanHref(" kadal.cc/docs ")).toBe("https://kadal.cc/docs");
    expect(cleanHref("https://x.test")).toBe("https://x.test");
    expect(cleanHref("#/results")).toBe("#/results");
    expect(cleanHref("hello@kadal.cc")).toBe("mailto:hello@kadal.cc");
    expect(cleanHref("javascript:alert(1)")).toBeNull();
    expect(cleanHref("two words")).toBeNull();
    expect(cleanHref("")).toBeNull();
  });
});
