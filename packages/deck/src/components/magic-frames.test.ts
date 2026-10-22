import { describe, expect, test } from "bun:test";
import { createHighlighter } from "shiki";

import { findMagicMoves } from "../compiler/magic-move.ts";
import { magicMoveData } from "../compiler/pipeline.ts";
import { applyMagicHighlight, frameAt, magicFrames } from "./magic-frames.ts";

const lit = (f: ReturnType<typeof frameAt>) =>
  f ? { step: f.step, lines: f.lines === null ? "all" : [...f.lines].sort((a, b) => a - b) } : null;

describe("magic move highlight frames", () => {
  test("each (step, highlight) pair is a frame, in reading order", () => {
    const frames = magicFrames([
      { highlight: "*|1|2,3,4,5" },
      { highlight: null },
      { highlight: "2" },
    ]);
    expect(frames.map(lit)).toEqual([
      { step: 0, lines: "all" },
      { step: 0, lines: [1] },
      { step: 0, lines: [2, 3, 4, 5] },
      { step: 1, lines: "all" },
      { step: 2, lines: [2] },
    ]);
    // Clicks: 0 before the block's first, then one per frame; past the end stays on the last.
    expect(lit(frameAt(frames, 0))).toEqual({ step: 0, lines: "all" });
    expect(lit(frameAt(frames, 3))).toEqual({ step: 1, lines: "all" });
    expect(lit(frameAt(frames, 99))).toEqual({ step: 2, lines: [2] });
    expect(lit(frameAt(frames, -1))).toEqual({ step: 0, lines: "all" });
    expect(frameAt([], 0)).toBeNull();
  });

  test("from Slidev's syntax: the inner fences' ranges reach the data, one click each", async () => {
    const text = [
      "````md magic-move {at:4, lines: true}",
      "```js {*|1|2-5}",
      "let count = 1",
      "function add() {",
      "  count++",
      "}",
      "```",
      "Non-code text in between is ignored.",
      "```js {*}{lines: false}",
      "let count = 1",
      "const add = () => count += 1",
      "```",
      "````",
    ].join("\n");
    const hl = await createHighlighter({ themes: ["github-light", "github-dark"], langs: ["js"] });
    const [block] = magicMoveData(findMagicMoves(text).blocks, hl, {
      light: "github-light",
      dark: "github-dark",
    });
    expect(block!.steps.map((s) => s.highlight)).toEqual(["*|1|2,3,4,5", "*"]);
    // 3 frames + 1 = 4, so the block takes 3 clicks after its first state.
    expect(magicFrames(block!.steps)).toHaveLength(4);
  });

  test("lights the tokens of a line, reading lines back from the <br>s", () => {
    const el = (tag: string, ...cls: string[]) => {
      const set = new Set(cls);
      return {
        tagName: tag,
        classList: {
          contains: (c: string) => set.has(c),
          toggle: (c: string, on: boolean) => (on ? set.add(c) : set.delete(c), on),
        },
        has: (c: string) => set.has(c),
      };
    };
    const item = (...cls: string[]) => el("SPAN", "shiki-magic-move-item", ...cls);
    const anchor = el("SPAN");
    const a1 = item("shiki-magic-move-line-number");
    const a2 = item();
    const b1 = item();
    const leaving = item("shiki-magic-move-leave-active");
    const children = [anchor, a1, a2, el("BR"), b1, el("BR"), leaving];
    applyMagicHighlight({ children } as never, new Set([2]));
    expect([a1.has("is-dim"), a2.has("is-dim"), b1.has("is-dim"), b1.has("is-lit")]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(leaving.has("is-dim") || anchor.has("is-dim")).toBe(false);
    // Every line lit: nothing dims, and nothing is marked as the step's light either.
    applyMagicHighlight({ children } as never, null);
    expect([a1.has("is-dim"), b1.has("is-dim"), b1.has("is-lit")]).toEqual([false, false, false]);
  });

  test("tokens carry their colours as Shiki variables, one set for every theme", async () => {
    const hl = await createHighlighter({
      themes: ["github-light", "github-dark", "vitesse-light"],
      langs: ["ts"],
    });
    const [block] = magicMoveData(
      findMagicMoves("````md magic-move\n```ts\nconst a = 1\n```\n````").blocks,
      hl,
      { light: "github-light", dark: "github-dark", k1: "vitesse-light" },
    );
    const tokens = (
      block!.steps[0]!.tokens as {
        tokens: Array<{ content: string; htmlStyle?: Record<string, string> }>;
      }
    ).tokens;
    const kw = tokens.find((t) => t.content === "const")!;
    expect(Object.keys(kw.htmlStyle ?? {}).sort()).toEqual([
      "--shiki-dark",
      "--shiki-k1",
      "--shiki-light",
    ]);
  });
});
