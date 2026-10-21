/**
 * Fence options the way Slidev writes them — a JavaScript object literal, not JSON:
 *
 *   ```mermaid {theme: 'neutral', scale: 0.8}
 *   $$ {1|3|all} {at: 2, finally: 'all'}
 *
 * Keys may be bare words or quoted; strings take either quote; numbers, booleans, null, arrays and
 * nested objects work; trailing commas are fine. Nothing is evaluated — an identifier or a call
 * is an error with its position, not code run at build time.
 */
export type Loose = null | boolean | number | string | Loose[] | { [key: string]: Loose };

export class LooseSyntaxError extends Error {
  override name = "LooseSyntaxError";
}

export function parseLoose(text: string): Loose {
  let i = 0;
  const src = text;
  const fail = (what: string): never => {
    throw new LooseSyntaxError(`${what} at character ${i + 1} of ${JSON.stringify(src)}`);
  };
  const space = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const value = (): Loose => {
    space();
    const c = src[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"' || c === "'") return string();
    const word = /^(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|true|false|null|undefined)/i.exec(
      src.slice(i),
    );
    if (!word) return fail("Expected a value");
    i += word[0].length;
    const w = word[0];
    if (w === "true") return true;
    if (w === "false") return false;
    if (w === "null" || w === "undefined") return null;
    const n = Number(w);
    if (!Number.isFinite(n)) return fail("Expected a value");
    return n;
  };
  const string = (): string => {
    const q = src[i++];
    let out = "";
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") {
        const e = src[i + 1] ?? "";
        out += e === "n" ? "\n" : e === "t" ? "\t" : e;
        i += 2;
      } else out += src[i++];
    }
    if (src[i] !== q) fail("Unclosed string");
    i++;
    return out;
  };
  const key = (): string => {
    space();
    if (src[i] === '"' || src[i] === "'") return string();
    const m = /^[A-Za-z_$][\w$-]*|^\d+/.exec(src.slice(i));
    if (!m) return fail("Expected a key");
    i += m[0].length;
    return m[0];
  };
  const object = (): Record<string, Loose> => {
    i++;
    const out: Record<string, Loose> = {};
    for (;;) {
      space();
      if (src[i] === "}") {
        i++;
        return out;
      }
      const k = key();
      space();
      if (src[i] !== ":") fail(`Expected ":" after "${k}"`);
      i++;
      out[k] = value();
      space();
      if (src[i] === ",") i++;
      else if (src[i] !== "}") fail('Expected "," or "}"');
    }
  };
  const array = (): Loose[] => {
    i++;
    const out: Loose[] = [];
    for (;;) {
      space();
      if (src[i] === "]") {
        i++;
        return out;
      }
      out.push(value());
      space();
      if (src[i] === ",") i++;
      else if (src[i] !== "]") fail('Expected "," or "]"');
    }
  };
  const result = value();
  space();
  if (i < src.length) fail("Unexpected text");
  return result;
}

/** `{…}` groups of a fence's meta, in order, outside quotes. */
export function braceGroups(meta: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < meta.length; i++) {
    const c = meta[i]!;
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < meta.length && meta[i] !== q) i += meta[i] === "\\" ? 2 : 1;
      continue;
    }
    if (c === "{") {
      if (depth++ === 0) start = i;
    } else if (c === "}" && depth > 0 && --depth === 0) out.push(meta.slice(start, i + 1));
  }
  return out;
}

/* ── values as ESTree, for JSX attributes the compiler writes itself ─────────────────────── */

type Estree = Record<string, unknown>;

function expression(value: Loose): Estree {
  if (value === null) return { type: "Literal", value: null, raw: "null" };
  if (typeof value === "number" && value < 0)
    return {
      type: "UnaryExpression",
      operator: "-",
      prefix: true,
      argument: { type: "Literal", value: -value, raw: String(-value) },
    };
  if (typeof value !== "object") return { type: "Literal", value, raw: JSON.stringify(value) };
  if (Array.isArray(value)) return { type: "ArrayExpression", elements: value.map(expression) };
  return {
    type: "ObjectExpression",
    properties: Object.entries(value).map(([k, v]) => ({
      type: "Property",
      kind: "init",
      method: false,
      shorthand: false,
      computed: false,
      key: { type: "Literal", value: k, raw: JSON.stringify(k) },
      value: expression(v),
    })),
  };
}

/**
 * An MDX JSX attribute for any JSON value: a plain string attribute for a string, an expression
 * (`scale={0.8}`, `config={{…}}`) for everything else.
 */
export function jsxAttribute(name: string, value: Loose): Record<string, unknown> {
  if (typeof value === "string") return { type: "mdxJsxAttribute", name, value };
  return {
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(value),
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          comments: [],
          body: [{ type: "ExpressionStatement", expression: expression(value) }],
        },
      },
    },
  };
}
