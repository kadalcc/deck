/**
 * ─────────────────────────────────────────────────────────────────────────────
 * \( … \) AND \[ … \]  —  LaTeX's own maths delimiters, beside remark-math's dollars
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * reveal.js's KaTeX plugin reads `\(x^2\)` inline and `\[x^2\]` as display maths. In Markdown a
 * backslash before a bracket is an escape, so by the time a text node exists the backslash is
 * gone: this has to be a syntax extension, tried before the escape. It produces remark-math's own
 * nodes — `inlineMath`, and `math` for a `\[ … \]` that is a paragraph of its own — so rehype-katex,
 * `$$ {1|3}` line steps and everything else downstream treat them as dollars.
 *
 *   \(a^2 + b^2\)            inline
 *   \[ \int_0^1 x\,dx \]     display (a paragraph of its own becomes a `$$` block)
 *   \\(not maths\\)          a doubled backslash is the escape for a literal one
 *
 * Code is never read: inline code and fences claim their text first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// micromark's character codes: null is the end of the input, -5…-3 are line endings.
type Code = number | null;
interface Effects {
  enter(type: string): unknown;
  exit(type: string): unknown;
  consume(code: Code): void;
}
type State = (code: Code) => State | undefined;
interface Token {
  type: string;
}
interface CompileContext {
  enter(node: unknown, token: Token): void;
  exit(token: Token): void;
  sliceSerialize(token: Token): string;
  stack: Array<{ type: string; value?: string; data?: Record<string, unknown> }>;
}

const BACKSLASH = 92;
const CLOSE: Record<number, number> = { 40: 41, 91: 93 }; // ( → )   [ → ]
const lineEnding = (code: Code) => code !== null && code < -2;

function tokenizeTex(effects: Effects, ok: State, nok: State): State {
  let close = 0;
  let escaped = false;
  let size = 0;
  const start: State = (code) => {
    effects.enter("texMath");
    effects.enter("texMathMarker");
    effects.consume(code);
    return open;
  };
  const open: State = (code) => {
    if (code === null || !CLOSE[code]) return nok(code);
    close = CLOSE[code]!;
    effects.consume(code);
    effects.exit("texMathMarker");
    return between;
  };
  const between: State = (code) => {
    if (code === null) return nok(code);
    if (lineEnding(code)) {
      effects.enter("lineEnding");
      effects.consume(code);
      effects.exit("lineEnding");
      escaped = false;
      return between;
    }
    effects.enter("texMathChunk");
    return chunk(code);
  };
  const chunk: State = (code) => {
    if (code === null || lineEnding(code)) {
      effects.exit("texMathChunk");
      return between(code);
    }
    if (escaped && code === close) {
      // `\)` / `\]`, with something between it and the opener.
      if (size < 2) return nok(code);
      effects.consume(code);
      effects.exit("texMathChunk");
      effects.exit("texMath");
      return ok;
    }
    // A backslash escapes the next character, so `\\)` (a LaTeX line break, then a bracket) is not
    // the end.
    escaped = code === BACKSLASH && !escaped;
    size++;
    effects.consume(code);
    return chunk;
  };
  return start;
}

const texConstruct = { name: "texMath", tokenize: tokenizeTex };

function enterTex(this: CompileContext, token: Token) {
  this.enter({ type: "inlineMath", value: "", data: {} }, token);
}

function exitTex(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token);
  const display = raw[1] === "[";
  const value = raw.slice(2, -2).trim();
  const node = this.stack[this.stack.length - 1]!;
  node.value = value;
  node.data = {
    hName: "code",
    hProperties: { className: ["language-math", display ? "math-display" : "math-inline"] },
    hChildren: [{ type: "text", value }],
    texDisplay: display,
  };
  this.exit(token);
}

interface MdNode {
  type: string;
  value?: string;
  data?: Record<string, unknown>;
  children?: MdNode[];
}

/** A paragraph that is one `\[ … \]` and nothing else is remark-math's `math` block. */
function displayBlocks(node: MdNode) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    const kids = child.children?.filter((c) => !(c.type === "text" && !c.value?.trim()));
    const only = kids?.length === 1 ? kids[0]! : null;
    if (child.type === "paragraph" && only?.type === "inlineMath" && only.data?.texDisplay) {
      const value = only.value ?? "";
      return {
        type: "math",
        meta: null,
        value,
        data: {
          hName: "pre",
          hChildren: [
            {
              type: "element",
              tagName: "code",
              properties: { className: ["language-math", "math-display"] },
              children: [{ type: "text", value }],
            },
          ],
        },
      } as MdNode;
    }
    displayBlocks(child);
    return child;
  });
}

export function remarkTexDelimiters(this: { data(): unknown }) {
  const data = this.data() as Record<string, unknown[] | undefined>;
  (data.micromarkExtensions ??= []).push({ text: { [BACKSLASH]: texConstruct } });
  (data.fromMarkdownExtensions ??= []).push({
    enter: { texMath: enterTex },
    exit: { texMath: exitTex },
  });
  return (tree: unknown) => displayBlocks(tree as MdNode);
}
