import { visit } from "unist-util-visit";

import { styleObject } from "./comark-attributes.ts";
import { jsxAttribute } from "./loose-object.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REVEAL.JS CLASSES WRITTEN AS HTML  —  what a slide pasted from a reveal deck means
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The importer (import/reveal.ts) rewrites a whole reveal page; this pass covers the HTML a person
 * pastes into deck.mdx by hand, with the same mapping:
 *
 *   <p class="fragment fade-up" data-fragment-index="2">…</p>
 *                              → <Click as="p" effect="fade-up" at="…">…</Click>
 *   <h2 class="r-fit-text">Big</h2>
 *                              → <h2 class="r-fit-text"><FitText>Big</FitText></h2>
 *
 * Fragment steps follow reveal's sortFragments: when no fragment on the slide names an index they
 * are left to count in document order like any other <Click>; when one does, every fragment gets
 * an absolute step — the indexed groups in index order, then the rest in document order. The
 * other `r-*` classes are plain CSS (themes/base.css).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** reveal.js's fragment styles, every one a Kadal click effect of the same name. */
const EFFECTS = new Set([
  "fade-in",
  "fade-out",
  "fade-up",
  "fade-down",
  "fade-left",
  "fade-right",
  "fade-in-then-out",
  "fade-in-then-semi-out",
  "current-visible",
  "grow",
  "shrink",
  "strike",
  "semi-fade-out",
  "highlight-red",
  "highlight-green",
  "highlight-blue",
  "highlight-current-red",
  "highlight-current-green",
  "highlight-current-blue",
]);

interface JsxAttr {
  type: string;
  name?: string;
  value?: unknown;
}
interface JsxNode {
  type: string;
  name?: string | null;
  attributes: JsxAttr[];
  children: Array<{ type: string; children?: unknown[] }>;
}

const isJsx = (n: { type: string }) =>
  n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement";

/** An intrinsic element (`p`, `li`, `span`), not a component: only those carry reveal's classes. */
const isHtml = (n: JsxNode) => !!n.name && /^[a-z][a-z0-9]*$/.test(n.name);

function attr(n: JsxNode, name: string): JsxAttr | undefined {
  return n.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
}

/** The class list, when it is plain text (`class="…"` or `className="…"`). */
function classesOf(n: JsxNode): string[] {
  const a = attr(n, "class") ?? attr(n, "className");
  return typeof a?.value === "string" ? a.value.split(/\s+/).filter(Boolean) : [];
}

function fitText(n: JsxNode) {
  const only = n.children.length === 1 ? n.children[0] : undefined;
  // `<h2 class="r-fit-text">` on lines of its own holds a paragraph: fit its text, not a <p>.
  const inner = only?.type === "paragraph" ? (only.children as JsxNode["children"]) : n.children;
  if (inner.some((c) => isJsx(c) && (c as JsxNode).name === "FitText")) return;
  n.children = [
    {
      type:
        only?.type === "paragraph" || n.type === "mdxJsxTextElement" ? "mdxJsxTextElement" : n.type,
      name: "FitText",
      attributes: [],
      children: inner,
    } as JsxNode["children"][number],
  ];
}

function toClick(n: JsxNode, step: number | undefined) {
  const cls = classesOf(n);
  const effect = cls.find((c) => EFFECTS.has(c));
  const other = cls.filter((c) => c !== "fragment" && !EFFECTS.has(c));
  const kept = n.attributes.filter((a) => {
    if (a.type !== "mdxJsxAttribute") return true;
    return !["class", "className", "data-fragment-index"].includes(a.name ?? "");
  });
  const out: JsxAttr[] = [{ type: "mdxJsxAttribute", name: "as", value: n.name }];
  if (step !== undefined) out.push({ type: "mdxJsxAttribute", name: "at", value: String(step) });
  if (effect && effect !== "fade-in")
    out.push({ type: "mdxJsxAttribute", name: "effect", value: effect });
  if (other.length)
    out.push({ type: "mdxJsxAttribute", name: "className", value: other.join(" ") });
  for (const a of kept)
    // An HTML style string would reach React as text; the component wants an object.
    out.push(
      a.type === "mdxJsxAttribute" && a.name === "style" && typeof a.value === "string"
        ? (jsxAttribute("style", styleObject(a.value)) as unknown as JsxAttr)
        : a,
    );
  n.name = "Click";
  n.attributes = out;
}

/** reveal's sortFragments: absolute steps, or null when no fragment names its index. */
function fragmentSteps(frags: JsxNode[]): Map<JsxNode, number> | null {
  const indexOf = (f: JsxNode) => {
    const v = attr(f, "data-fragment-index")?.value;
    const i = typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
    return Number.isFinite(i) ? i : null;
  };
  if (!frags.some((f) => indexOf(f) !== null)) return null;
  const indexed = new Map<number, JsxNode[]>();
  const rest: JsxNode[] = [];
  for (const f of frags) {
    const i = indexOf(f);
    if (i === null) rest.push(f);
    else indexed.set(i, [...(indexed.get(i) ?? []), f]);
  }
  const out = new Map<JsxNode, number>();
  let step = 0;
  for (const i of [...indexed.keys()].sort((a, b) => a - b)) {
    step++;
    for (const f of indexed.get(i)!) out.set(f, step);
  }
  for (const f of rest) out.set(f, ++step);
  return out;
}

export function remarkRevealClasses() {
  return (tree: unknown) => {
    const frags: JsxNode[] = [];
    visit(tree as never, (n: { type: string }) => {
      if (!isJsx(n)) return;
      const node = n as JsxNode;
      if (!isHtml(node)) return;
      const cls = classesOf(node);
      if (cls.includes("r-fit-text")) fitText(node);
      if (cls.includes("fragment")) frags.push(node);
    });
    const steps = fragmentSteps(frags);
    for (const f of frags) toClick(f, steps?.get(f));
  };
}
