import type { Element, Root, Text } from "hast";

import { type TermMatcher, adhocId, inlineHtml } from "../glossary/model.ts";

/**
 * Links a slide's key terms to the deck's glossary: each mention the matcher finds is wrapped in
 * `<Term id auto>`, which shows the definition in a card after a short hover. The same idea as
 * the pass that links Paadam's notes (apps/paadam/mdx/rehype-glossary.ts), retuned for slides:
 *
 *   · A slide is the unit. With `repeat: "first"` a term is linked once per slide — every slide
 *     stands alone in front of an audience, nobody can scroll back to where it was first defined.
 *   · Body text goes first and headings only pick up what the body never mentions (`headings:
 *     "fallback"`): a slide whose title is its only mention of UTM still gets the link, but a
 *     title is not underlined when the sentence below it can carry the term instead.
 *   · Code, maths, links, controls and the components that animate or paint their own text
 *     (GradientText, Typewriter, Counter…) are left alone; `className="no-terms"` opts a block out.
 *
 * Explicit `<Term>` elements are settled here as well, so the author hears about a typo at build
 * time: `<Term>UTM</Term>` gets its `id`, `<Term def="…">` gets its definition rendered (with
 * KaTeX, which the browser never has to load), and both count as the slide's mention of the term.
 */
export interface RehypeGlossaryOptions {
  matcher: TermMatcher;
  /** False settles the slide's explicit `<Term>`s and links nothing else (`terms: false`). */
  auto?: boolean;
  repeat: "first" | "all";
  headings: "fallback" | boolean;
  /** Extra component names to leave alone, from the headmatter. */
  skip?: string[];
  /** Term ids this slide does not link (`terms: { skip: [...] }` in its frontmatter). */
  exclude?: Set<string>;
  math?: (tex: string) => string;
  warn?: (message: string) => void;
}

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIP_TAGS = new Set([
  "code",
  "pre",
  "a",
  "script",
  "style",
  "svg",
  "math",
  "kbd",
  "abbr",
  "button",
  "select",
  "option",
  "textarea",
  "iframe",
  "video",
  "audio",
]);
const SKIP_CLASSES = new Set(["no-terms", "katex", "math", "math-inline", "math-display"]);
const SKIP_JSX = new Set([
  "Code",
  "MagicMove",
  "Tex",
  "Math",
  "Mermaid",
  "Sketch",
  "Notes",
  "Link",
  "Anchor",
  "Toc",
  "Image",
  "Video",
  "Audio",
  "Iframe",
  "Youtube",
  "Tweet",
  "Kbd",
  "Counter",
  "Typewriter",
  "Encrypted",
  "Timer",
  "FitText",
  "Qr",
  "QrJoin",
  "Background",
  "GradientText",
  "Shimmer",
  "Icon",
  "Poll",
  "Quiz",
  "Questions",
  "Leaderboard",
  "WordCloud",
  "Presence",
  "Reactions",
  "Pace",
]);

interface JsxAttribute {
  type: "mdxJsxAttribute";
  name: string;
  value?: string | null | { type: string; value: string };
}
interface JsxElement {
  type: "mdxJsxTextElement" | "mdxJsxFlowElement";
  name: string | null;
  attributes: Array<JsxAttribute | { type: "mdxJsxExpressionAttribute" }>;
  children: Node[];
}
type Node = Root | Element | Text | JsxElement | { type: string; children?: Node[] };

const isJsx = (n: Node): n is JsxElement =>
  n.type === "mdxJsxTextElement" || n.type === "mdxJsxFlowElement";

function attr(el: JsxElement, name: string): JsxAttribute | undefined {
  return el.attributes.find(
    (a): a is JsxAttribute => a.type === "mdxJsxAttribute" && (a as JsxAttribute).name === name,
  );
}

const stringAttr = (el: JsxElement, name: string): string | null => {
  const v = attr(el, name)?.value;
  return typeof v === "string" ? v : null;
};

function setAttr(el: JsxElement, name: string, value: string) {
  const existing = attr(el, name);
  if (existing) existing.value = value;
  else el.attributes.push({ type: "mdxJsxAttribute", name, value });
}

function classesOf(node: Node): string[] {
  if (node.type === "element") {
    const cls: unknown = (node as Element).properties?.className;
    return Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? cls.split(/\s+/) : [];
  }
  if (isJsx(node))
    return (stringAttr(node, "className") ?? stringAttr(node, "class") ?? "").split(/\s+/);
  return [];
}

function textOf(node: Node): string {
  if (node.type === "text") return (node as Text).value;
  return ((node as { children?: Node[] }).children ?? []).map(textOf).join("");
}

export function rehypeGlossary(options: RehypeGlossaryOptions) {
  const { matcher, repeat, headings, exclude, math, warn } = options;
  const skipJsx = new Set([...SKIP_JSX, ...(options.skip ?? [])]);

  return (tree: Root) => {
    const seen = new Set<string>(exclude ?? []);
    const jobs: { node: Text; heading: boolean }[] = [];

    const settle = (el: JsxElement) => {
      const def = stringAttr(el, "def");
      if (def !== null) {
        setAttr(el, "html", inlineHtml(def.replace(/\s+/g, " ").trim(), math));
        const more = stringAttr(el, "more");
        if (more !== null)
          setAttr(el, "moreHtml", inlineHtml(more.replace(/\s+/g, " ").trim(), math));
        if (stringAttr(el, "id") === null) setAttr(el, "id", adhocId(`${textOf(el)}|${def}`));
        return;
      }
      if (attr(el, "def")) return; // an expression: the runtime renders it
      const wanted = stringAttr(el, "id") ?? textOf(el);
      const entry = matcher.resolve(wanted);
      if (!entry) {
        warn?.(`<Term> "${wanted.trim()}" is not in the glossary and has no def`);
        return;
      }
      setAttr(el, "id", entry.id);
      seen.add(entry.id);
    };

    const collect = (node: Node, heading: boolean) => {
      let inHeading = heading;
      if (node.type === "element") {
        const tag = (node as Element).tagName;
        if (SKIP_TAGS.has(tag)) return;
        if (HEADINGS.has(tag)) inHeading = true;
      } else if (isJsx(node)) {
        if (node.name === "Term") return settle(node);
        if (node.name && (skipJsx.has(node.name) || SKIP_TAGS.has(node.name))) return;
        if (node.name && HEADINGS.has(node.name)) inHeading = true;
      } else if (node.type !== "root") return;
      if (classesOf(node).some((c) => SKIP_CLASSES.has(c))) return;
      for (const child of (node as { children?: Node[] }).children ?? []) {
        if (child.type === "text") {
          if ((child as Text).value.trim()) jobs.push({ node: child as Text, heading: inHeading });
        } else collect(child, inHeading);
      }
    };
    collect(tree, false);

    const replacements = new Map<Text, Node[]>();
    const link = (job: { node: Text }) => {
      const src = job.node.value;
      const out: Node[] = [];
      let last = 0;
      for (const m of matcher.find(src)) {
        if (exclude?.has(m.entry.id)) continue;
        if (repeat === "first" && seen.has(m.entry.id)) continue;
        seen.add(m.entry.id);
        if (m.index > last) out.push({ type: "text", value: src.slice(last, m.index) });
        out.push({
          type: "mdxJsxTextElement",
          name: "Term",
          attributes: [
            { type: "mdxJsxAttribute", name: "id", value: m.entry.id },
            { type: "mdxJsxAttribute", name: "auto", value: null },
          ],
          children: [{ type: "text", value: m.text }],
        });
        last = m.index + m.text.length;
      }
      if (!out.length) return;
      if (last < src.length) out.push({ type: "text", value: src.slice(last) });
      replacements.set(job.node, out);
    };

    if (options.auto === false) return;
    if (headings === "fallback") {
      jobs.filter((j) => !j.heading).forEach(link);
      jobs.filter((j) => j.heading).forEach(link);
    } else jobs.filter((j) => headings || !j.heading).forEach(link);

    if (!replacements.size) return;
    const rebuild = (node: Node) => {
      const kids = (node as { children?: Node[] }).children;
      if (!kids) return;
      const next: Node[] = [];
      for (const child of kids) {
        const swap = child.type === "text" ? replacements.get(child as Text) : undefined;
        if (swap) next.push(...swap);
        else {
          rebuild(child);
          next.push(child);
        }
      }
      (node as { children: Node[] }).children = next;
    };
    rebuild(tree);
  };
}
