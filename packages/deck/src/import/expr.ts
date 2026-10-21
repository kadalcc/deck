/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VUE TEMPLATE EXPRESSIONS, READ WITHOUT RUNNING THEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A Slidev slide is a Vue template: `:initial="{ x: -80 }"`, `v-click="[2, 4]"`, `{{ $slidev.nav.
 * currentPage }}`, `v-for="n in 3"`, `:enter="final"` (a const from the slide's `<script setup>`).
 * The importer must turn those into JSX without executing anything from the Slidev project — so
 * this is a small parser for the expression subset templates use (literals, object and array
 * literals, names, member access, unary/binary/ternary operators, template strings without
 * placeholders) and an evaluator over a scope of known values.
 *
 * `evaluate` answers one of three ways:
 *
 *   static     the value is known now (`{ x: -80 }`, `final`, `$frontmatter.title`, `2 * 3`)
 *   runtime    a path into Slidev's runtime the importer has a Kadal spelling for
 *              (`$slidev.nav.currentPage` → <SlideCurrentNo />); see markup.ts
 *   unknown    anything else (a call, a name nobody declared, `$clicks > 2`), with the reason
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Value =
  | null
  | undefined
  | boolean
  | number
  | string
  | Value[]
  | { [key: string]: Value };

type Node =
  | { t: "lit"; v: Value }
  | { t: "id"; name: string }
  | { t: "member"; obj: Node; prop: Node; computed: boolean }
  | { t: "call"; callee: Node; args: Node[] }
  | { t: "unary"; op: string; arg: Node }
  | { t: "bin"; op: string; l: Node; r: Node }
  | { t: "cond"; test: Node; yes: Node; no: Node }
  | { t: "obj"; props: Array<{ key: string | Node; value: Node } | { spread: Node }> }
  | { t: "arr"; items: Node[] }
  | { t: "tpl"; quasis: string[]; exprs: Node[] };

export class ExprError extends Error {}

const PUNCT = [
  "===",
  "!==",
  "...",
  "??",
  "?.",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "**",
  "=>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "?",
  ":",
  ".",
  ",",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "=",
];

type Tok = { k: "num" | "str" | "id" | "p" | "tpl"; v: string; parts?: string[] };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const numM = /^(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)/i.exec(src.slice(i));
    if (numM) {
      out.push({ k: "num", v: numM[0] });
      i += numM[0].length;
      continue;
    }
    if (ch === "`") {
      // a template string: its text parts and its ${…} sources, parsed later
      const parts: string[] = [];
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") {
          s += src[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (src[j] === "$" && src[j + 1] === "{") {
          let depth = 1;
          let k = j + 2;
          while (k < src.length && depth) {
            if (src[k] === "{") depth++;
            else if (src[k] === "}") depth--;
            k++;
          }
          parts.push(s, src.slice(j + 2, k - 1));
          s = "";
          j = k;
          continue;
        }
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError("an unclosed template string");
      parts.push(s);
      out.push({ k: "tpl", v: "`", parts });
      i = j + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") {
          const n = src[j + 1] ?? "";
          s += n === "n" ? "\n" : n === "t" ? "\t" : n;
          j += 2;
          continue;
        }
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError("an unclosed string");
      out.push({ k: "str", v: s });
      i = j + 1;
      continue;
    }
    const idM = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (idM) {
      out.push({ k: "id", v: idM[0] });
      i += idM[0].length;
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) throw new ExprError(`the character "${ch}"`);
    out.push({ k: "p", v: p });
    i += p.length;
  }
  return out;
}

const BINARY: Record<string, number> = {
  "??": 1,
  "||": 2,
  "&&": 3,
  "==": 4,
  "!=": 4,
  "===": 4,
  "!==": 4,
  "<": 5,
  ">": 5,
  "<=": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
  "**": 8,
};

/** Parse one expression; throws ExprError on anything outside the subset. */
export function parseExpr(src: string): Node {
  const toks = lex(src);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (v?: string) => {
    const t = toks[pos];
    if (!t || (v !== undefined && t.v !== v))
      throw new ExprError(v ? `a missing "${v}"` : "an early end");
    pos++;
    return t;
  };
  const isP = (v: string) => peek()?.k === "p" && peek()!.v === v;

  function primary(): Node {
    const t = peek();
    if (!t) throw new ExprError("an early end");
    if (t.k === "num") {
      pos++;
      return { t: "lit", v: Number(t.v) };
    }
    if (t.k === "str") {
      pos++;
      return { t: "lit", v: t.v };
    }
    if (t.k === "tpl") {
      pos++;
      const parts = t.parts!;
      const quasis = parts.filter((_, k) => k % 2 === 0);
      const exprs = parts.filter((_, k) => k % 2 === 1).map((e) => parseExpr(e));
      return exprs.length ? { t: "tpl", quasis, exprs } : { t: "lit", v: quasis.join("") };
    }
    if (t.k === "id") {
      pos++;
      if (t.v === "true") return { t: "lit", v: true };
      if (t.v === "false") return { t: "lit", v: false };
      if (t.v === "null") return { t: "lit", v: null };
      if (t.v === "undefined") return { t: "lit", v: undefined };
      if (t.v === "NaN") return { t: "lit", v: Number.NaN };
      if (t.v === "Infinity") return { t: "lit", v: Number.POSITIVE_INFINITY };
      if (isP("=>")) throw new ExprError("an arrow function");
      return { t: "id", name: t.v };
    }
    if (isP("(")) {
      pos++;
      const e = expr();
      eat(")");
      if (isP("=>")) throw new ExprError("an arrow function");
      return e;
    }
    if (isP("[")) {
      pos++;
      const items: Node[] = [];
      while (!isP("]")) {
        items.push(expr());
        if (!isP("]")) eat(",");
      }
      eat("]");
      return { t: "arr", items };
    }
    if (isP("{")) {
      pos++;
      const props: Array<{ key: string | Node; value: Node } | { spread: Node }> = [];
      while (!isP("}")) {
        if (isP("...")) {
          pos++;
          props.push({ spread: expr() });
        } else {
          let key: string | Node;
          const k = eat();
          if (k.k === "p" && k.v === "[") {
            key = expr();
            eat("]");
          } else if (k.k === "p") throw new ExprError(`"${k.v}" in an object`);
          else key = k.v;
          if (isP(":")) {
            pos++;
            props.push({ key, value: expr() });
          } else if (typeof key === "string") props.push({ key, value: { t: "id", name: key } });
          else throw new ExprError("a computed key without a value");
        }
        if (!isP("}")) eat(",");
      }
      eat("}");
      return { t: "obj", props };
    }
    throw new ExprError(`"${t.v}"`);
  }

  function postfix(): Node {
    let n = primary();
    for (;;) {
      if (isP(".") || isP("?.")) {
        pos++;
        if (isP("(") || isP("[")) continue;
        const id = eat();
        if (id.k !== "id") throw new ExprError("a member name");
        n = { t: "member", obj: n, prop: { t: "lit", v: id.v }, computed: false };
      } else if (isP("[")) {
        pos++;
        const prop = expr();
        eat("]");
        n = { t: "member", obj: n, prop, computed: true };
      } else if (isP("(")) {
        pos++;
        const args: Node[] = [];
        while (!isP(")")) {
          args.push(expr());
          if (!isP(")")) eat(",");
        }
        eat(")");
        n = { t: "call", callee: n, args };
      } else return n;
    }
  }

  function unary(): Node {
    if (isP("!") || isP("-") || isP("+")) {
      const op = eat().v;
      return { t: "unary", op, arg: unary() };
    }
    if (peek()?.k === "id" && peek()!.v === "typeof") throw new ExprError("typeof");
    return postfix();
  }

  function binary(min: number): Node {
    let l = unary();
    for (;;) {
      const t = peek();
      const prec = t?.k === "p" ? BINARY[t.v] : undefined;
      if (prec === undefined || prec < min) return l;
      pos++;
      const r = binary(t!.v === "**" ? prec : prec + 1);
      l = { t: "bin", op: t!.v, l, r };
    }
  }

  function expr(): Node {
    const test = binary(1);
    if (isP("?")) {
      pos++;
      const yes = expr();
      eat(":");
      const no = expr();
      return { t: "cond", test, yes, no };
    }
    if (isP("=")) throw new ExprError("an assignment");
    return test;
  }

  const e = expr();
  if (pos < toks.length) throw new ExprError(`"${toks[pos]!.v}" after the expression`);
  return e;
}

/** Names whose value lives in Slidev's runtime: what an expression reaching them needs. */
export const RUNTIME_ROOTS = new Set([
  "$slidev",
  "$nav",
  "$page",
  "$clicks",
  "$clicksContext",
  "$renderContext",
  "$route",
  "$scale",
]);

export type Evaluated =
  | { kind: "static"; value: Value }
  | { kind: "runtime"; path: string }
  | { kind: "unknown"; reason: string };

class Runtime {
  constructor(readonly path: string) {}
}

function pathOf(n: Node): string | null {
  if (n.t === "id") return n.name;
  if (n.t === "member" && !n.computed && n.prop.t === "lit") {
    const base = pathOf(n.obj);
    return base ? `${base}.${String(n.prop.v)}` : null;
  }
  return null;
}

/**
 * Evaluate against `scope` (plain values: script-setup consts, v-for variables, `$frontmatter`,
 * a static `$slidev.configs`). A bare path into a runtime root comes back as `runtime`.
 */
export function evaluate(src: string, scope: Record<string, Value> = {}): Evaluated {
  let ast: Node;
  try {
    ast = parseExpr(src);
  } catch (e) {
    return { kind: "unknown", reason: e instanceof ExprError ? `it has ${e.message}` : String(e) };
  }
  const path = pathOf(ast);
  if (path && RUNTIME_ROOTS.has(path.split(".")[0]!)) {
    const known = lookup(path, scope);
    if (known !== NOT_FOUND) return { kind: "static", value: known as Value };
    return { kind: "runtime", path };
  }
  try {
    return { kind: "static", value: run(ast, scope) };
  } catch (e) {
    if (e instanceof Runtime)
      return { kind: "unknown", reason: `it reads ${e.path} while the deck runs` };
    return { kind: "unknown", reason: e instanceof ExprError ? e.message : String(e) };
  }
}

const NOT_FOUND = Symbol("not found");

/** A dotted path in the scope (`$slidev.configs.title`), or NOT_FOUND. */
function lookup(path: string, scope: Record<string, Value>): Value | typeof NOT_FOUND {
  const [root, ...rest] = path.split(".");
  if (!(root! in scope)) return NOT_FOUND;
  let v: Value = scope[root!];
  for (const k of rest) {
    if (v === null || typeof v !== "object" || Array.isArray(v) || !(k in v)) return NOT_FOUND;
    v = (v as Record<string, Value>)[k];
  }
  return v;
}

function run(n: Node, scope: Record<string, Value>): Value {
  switch (n.t) {
    case "lit":
      return n.v;
    case "id":
      if (n.name in scope) return scope[n.name];
      if (RUNTIME_ROOTS.has(n.name)) throw new Runtime(n.name);
      throw new ExprError(`the name "${n.name}", which nothing on the slide declares`);
    case "member": {
      const path = pathOf(n);
      if (path) {
        const found = lookup(path, scope);
        if (found !== NOT_FOUND) return found as Value;
        if (RUNTIME_ROOTS.has(path.split(".")[0]!)) throw new Runtime(path);
      }
      const obj = run(n.obj, scope);
      const key = run(n.prop, scope);
      if (obj === null || obj === undefined) return undefined;
      if (typeof key !== "string" && typeof key !== "number") throw new ExprError("an odd key");
      if (Array.isArray(obj)) return key === "length" ? obj.length : obj[Number(key)];
      if (typeof obj === "string") return key === "length" ? obj.length : obj[Number(key)];
      if (typeof obj === "object") return Object.hasOwn(obj, key) ? obj[key] : undefined;
      return undefined;
    }
    case "call":
      throw new ExprError("a function call");
    case "unary": {
      const a = run(n.arg, scope);
      return n.op === "!" ? !a : n.op === "-" ? -(a as number) : +(a as number);
    }
    case "bin": {
      const l = run(n.l, scope);
      if (n.op === "&&") return l ? run(n.r, scope) : l;
      if (n.op === "||") return l ? l : run(n.r, scope);
      if (n.op === "??") return l ?? run(n.r, scope);
      const r = run(n.r, scope);
      const L = l as number;
      const R = r as number;
      switch (n.op) {
        case "+":
          return typeof l === "string" || typeof r === "string" ? String(l) + String(r) : L + R;
        case "-":
          return L - R;
        case "*":
          return L * R;
        case "/":
          return L / R;
        case "%":
          return L % R;
        case "**":
          return L ** R;
        case "<":
          return L < R;
        case ">":
          return L > R;
        case "<=":
          return L <= R;
        case ">=":
          return L >= R;
        case "==":
        case "===":
          return l === r;
        case "!=":
        case "!==":
          return l !== r;
      }
      throw new ExprError(`the operator ${n.op}`);
    }
    case "cond":
      return run(n.test, scope) ? run(n.yes, scope) : run(n.no, scope);
    case "arr":
      return n.items.map((x) => run(x, scope));
    case "tpl":
      return n.quasis
        .map((q, k) => q + (k < n.exprs.length ? String(run(n.exprs[k]!, scope)) : ""))
        .join("");
    case "obj": {
      const out: Record<string, Value> = {};
      for (const p of n.props) {
        if ("spread" in p) {
          const v = run(p.spread, scope);
          if (v && typeof v === "object") Object.assign(out, v);
        } else {
          const key = typeof p.key === "string" ? p.key : String(run(p.key, scope));
          out[key] = run(p.value, scope);
        }
      }
      return out;
    }
  }
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A value as JavaScript source for a JSX attribute: `{ x: -80, transition: { delay: 2 } }`. */
export function toJs(v: Value): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "number")
    return Number.isFinite(v)
      ? String(v)
      : Number.isNaN(v)
        ? "NaN"
        : v > 0
          ? "Infinity"
          : "-Infinity";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(toJs).join(", ")}]`;
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!entries.length) return "{}";
  return `{ ${entries.map(([k, x]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${toJs(x)}`).join(", ")} }`;
}

/**
 * The value of a `<script setup>` block's top-level `const`s whose initialisers are static
 * (`const final = { x: 0, transition: { type: 'spring' } }`), and what else the block holds.
 */
export function scriptConsts(
  code: string,
  scope: Record<string, Value> = {},
): {
  consts: Record<string, Value>;
  rest: string[];
} {
  const consts: Record<string, Value> = {};
  const rest: string[] = [];
  const text = code.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
  let i = 0;
  const decl =
    /(?:^|\n)\s*(?:export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*/g;
  const starts: Array<{ name: string; at: number; head: number }> = [];
  for (const m of text.matchAll(decl))
    starts.push({ name: m[2]!, at: m.index! + m[0].length, head: m.index! });
  for (const s of starts) {
    if (s.head > i && text.slice(i, s.head).trim()) rest.push(text.slice(i, s.head).trim());
    const end = initialiserEnd(text, s.at);
    const init = text.slice(s.at, end).trim().replace(/;$/, "");
    const r = evaluate(init, { ...scope, ...consts });
    if (r.kind === "static") consts[s.name] = r.value;
    else rest.push(`const ${s.name} = ${init}`);
    i = end;
  }
  if (text.slice(i).trim()) rest.push(text.slice(i).trim());
  return { consts, rest: rest.filter((r) => r && r !== ";") };
}

/** Where an initialiser ends: the first `;` or newline at bracket depth 0 outside strings. */
function initialiserEnd(text: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (depth === 0 && (ch === ";" || ch === "\n")) {
      // A line that ends while an operator waits for more is not the end.
      const before = text.slice(from, i).trimEnd();
      if (ch === "\n" && /[=+\-*/?:,&|]$/.test(before)) continue;
      return ch === ";" ? i + 1 : i;
    }
  }
  return text.length;
}

/**
 * Vue's `:class` binding as a JavaScript expression that gives a class string: an object
 * (`{ active: on }`) keeps the keys whose values hold, an array joins its parts, anything else is
 * used as it is. `tokens` are the class names it can produce (for the utility stylesheet).
 */
export function translateClass(
  src: string,
  resolve: (name: string) => string | null,
  special?: (path: string) => string | null | undefined,
): { js: string; tokens: string[] } | null {
  let ast: Node;
  try {
    ast = parseExpr(src);
  } catch {
    return null;
  }
  const tokens: string[] = [];
  const collect = (n: Node) => {
    if (n.t === "lit" && typeof n.v === "string") tokens.push(...n.v.split(/\s+/).filter(Boolean));
    if (n.t === "cond") {
      collect(n.yes);
      collect(n.no);
    }
    if (n.t === "bin") {
      collect(n.l);
      collect(n.r);
    }
  };
  const part = (n: Node): string | null => {
    if (n.t === "obj") {
      const out: string[] = [];
      for (const p of n.props) {
        if ("spread" in p || typeof p.key !== "string") return null;
        const cond = translateExpr(printSource(p.value), resolve, special);
        if (cond === null) return null;
        tokens.push(...p.key.split(/\s+/).filter(Boolean));
        out.push(`(${cond}) ? ${JSON.stringify(p.key)} : ""`);
      }
      return out.join(", ");
    }
    if (n.t === "arr") {
      const items = n.items.map(part);
      return items.some((x) => x === null) ? null : items.join(", ");
    }
    collect(n);
    return translateExpr(printSource(n), resolve, special);
  };
  const js = part(ast);
  return js === null ? null : { js: `[${js}].filter(Boolean).join(" ")`, tokens };
}

/** An AST back to source (names kept as written), so a part of it can be translated alone. */
function printSource(n: Node): string {
  return translateExprAst(n, (name) => name) ?? "undefined";
}

/**
 * An expression rewritten as JavaScript for a converted Vue component: each free name goes
 * through `resolve` (a prop → `p.count`, a ref → `counter`, `$slidev.nav.currentPage` → a layer's
 * `props.page`), and the whole is null when a name has no answer or the syntax is outside the
 * subset. Member names after a dot are not free names; `x.value` on a resolved ref drops `.value`.
 */
export function translateExpr(
  src: string,
  resolve: (name: string) => string | null,
  special?: (path: string) => string | null | undefined,
): string | null {
  let ast: Node;
  try {
    ast = parseExpr(src);
  } catch {
    return null;
  }
  return translateExprAst(ast, resolve, special);
}

function translateExprAst(
  ast: Node,
  resolve: (name: string) => string | null,
  special?: (path: string) => string | null | undefined,
): string | null {
  const print = (n: Node, parent = 0): string | null => {
    switch (n.t) {
      case "lit":
        return toJs(n.v);
      case "id": {
        const sp = special?.(n.name);
        return sp !== undefined ? sp : resolve(n.name);
      }
      case "member": {
        const path = pathOf(n);
        if (path && special) {
          const sp = special(path);
          if (sp !== undefined) return sp;
        }
        // a ref's `.value` is the state itself
        if (!n.computed && n.prop.t === "lit" && n.prop.v === "value" && n.obj.t === "id")
          return print(n.obj, parent);
        const obj = print(n.obj, 20);
        if (obj === null) return null;
        if (!n.computed && n.prop.t === "lit") return `${obj}.${String(n.prop.v)}`;
        const prop = print(n.prop);
        return prop === null ? null : `${obj}[${prop}]`;
      }
      case "call":
        return null;
      case "unary": {
        const a = print(n.arg, 15);
        return a === null ? null : `${n.op}${a}`;
      }
      case "bin": {
        const prec = BINARY[n.op] ?? 0;
        const l = print(n.l, prec);
        const r = print(n.r, prec + 1);
        if (l === null || r === null) return null;
        const s = `${l} ${n.op} ${r}`;
        return prec < parent ? `(${s})` : s;
      }
      case "cond": {
        const t = print(n.test, 1);
        const y = print(n.yes);
        const no = print(n.no);
        if (t === null || y === null || no === null) return null;
        return parent > 0 ? `(${t} ? ${y} : ${no})` : `${t} ? ${y} : ${no}`;
      }
      case "tpl": {
        const exprs = n.exprs.map((x) => print(x));
        if (exprs.some((x) => x === null)) return null;
        const esc = (q: string) => q.replace(/[`\\]/g, (c) => `\\${c}`).replace(/\$\{/g, "\\${");
        return `\`${n.quasis.map((q, k) => esc(q) + (k < exprs.length ? `\${${exprs[k]}}` : "")).join("")}\``;
      }
      case "arr": {
        const items = n.items.map((x) => print(x));
        return items.some((x) => x === null) ? null : `[${items.join(", ")}]`;
      }
      case "obj": {
        const parts: string[] = [];
        for (const p of n.props) {
          if ("spread" in p) {
            const v = print(p.spread);
            if (v === null) return null;
            parts.push(`...${v}`);
          } else {
            const v = print(p.value);
            if (v === null || typeof p.key !== "string") return null;
            parts.push(`${IDENT.test(p.key) ? p.key : JSON.stringify(p.key)}: ${v}`);
          }
        }
        return `{ ${parts.join(", ")} }`;
      }
    }
  };
  return print(ast);
}
