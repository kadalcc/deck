import type {
  CompileContext,
  Extension as FromMarkdownExtension,
  Token,
} from "mdast-util-from-markdown";
import YAML from "yaml";

import {
  type ComarkAttribute,
  bindingValue,
  camelCase,
  comarkName,
  parseComarkAttributes,
  styleObject,
} from "./comark-attributes.ts";
import { comarkSyntax } from "./comark-syntax.ts";
import { type Loose, jsxAttribute } from "./loose-object.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMARK (formerly MDC)  —  Markdown components without JSX, opt-in with `comark: true`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev's `comark: true` (`mdc: true` before it was renamed), read natively: the syntax is
 * tokenized by comark-syntax.ts inside MDX's own parser, and this pass turns what it found into
 * the JSX and HTML MDX already knows how to compile —
 *
 *   :badge[New]{tone="good"}                 <Badge tone="good">New</Badge>
 *   :icon{name="mdi:rocket"}                 <Icon name="mdi:rocket" />
 *   [red text]{style="color: red"}           <span style={{ color: "red" }}>red text</span>
 *   [big]{.text-4xl #intro}                  <span className="text-4xl" id="intro">big</span>
 *   **bold**{.accent}  `x`{.big}             the element itself, with the attributes
 *   [link](/x){target=_blank}                <a href="/x" target="_blank">
 *   ![](/cat.png){width=480 lazy}            <img src="/cat.png" width="480" loading="lazy">
 *
 *   ::callout{kind="warn"}                   <Callout kind="warn">
 *   The **default** slot.                      …the default slot: the children…
 *   #title                                     …a named slot: the `title` prop, its Markdown
 *   A *named* slot.                              rendered (`#my-slot` → `mySlot`; a slot of one
 *                                                paragraph arrives as its text, no `<p>`)
 *   ::                                       </Callout>
 *
 *   ::card                                   props as YAML, between `---` lines straight after
 *   ---                                      the opener (strings stay strings; numbers, lists
 *   title: Deep dive                          and objects arrive as data)
 *   tags: [mdx, slides]
 *   ---
 *   :::note                                  nested: one colon more than the block it is in
 *   Inner.
 *   :::
 *   ::
 *
 * A name is a component by its PascalCase name — Kadal's (`callout` → Callout, Slidev's
 * `auto-fit-text` → FitText) or the deck's own (`my-card` → MyCard) — unless it is an HTML
 * element's (`:span`, `::section{.grid}`), which renders as that element. `:prop="…"` binds data
 * (JSON or a JavaScript-style literal, never run); `style="…"` becomes a style object for a
 * component; `on…` handlers cannot be strings and are dropped with a warning.
 *
 * Kadal's own colon syntax keeps its meaning with Comark on: `::right::` slot markers
 * (compiler/slots.ts) and `::code-group` (compiler/code-groups.ts) are applied to the text
 * before MDX sees it, and an MDX `{expression}` that is not an attribute list stays one.
 * A block left open closes at the end of what it is in, with a warning.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface RemarkComarkOptions {
  warn?: (message: string, line?: number) => void;
}

// Loose mdast/hast shapes: this pass builds MDX JSX nodes, which the mdast types do not know.
interface Point {
  line: number;
  column: number;
  offset?: number;
}
interface Position {
  start: Point;
  end: Point;
}
interface MdNode {
  type: string;
  value?: string;
  name?: string | null;
  attributes?: unknown;
  children?: MdNode[];
  position?: Position;
  data?: Record<string, unknown> & { hName?: string; hProperties?: Record<string, unknown> };
  // comark tokens' fields
  colons?: number;
  raw?: string | null;
  yaml?: Array<{ line: number; text: string }>;
  yamlStart?: number | null;
  /** The props' closing `---` was found. */
  yamlClosed?: boolean;
}

// ── the parser's half: tokens → interim nodes ───────────────────────────────────────────────

function top(ctx: CompileContext): MdNode {
  return ctx.stack[ctx.stack.length - 1] as unknown as MdNode;
}

function enterNode(type: string, extra: Partial<MdNode> = {}) {
  return function (this: CompileContext, token: Token) {
    this.enter({ type, raw: null, ...extra } as never, token);
  };
}
function exitNode(this: CompileContext, token: Token) {
  this.exit(token);
}

function comarkFromMarkdown(): FromMarkdownExtension {
  return {
    canContainEols: ["comarkText", "comarkSpan"],
    enter: {
      comarkText: function (this: CompileContext, token: Token) {
        this.enter({ type: "comarkText", name: "", raw: null, children: [] } as never, token);
      },
      comarkSpan: function (this: CompileContext, token: Token) {
        this.enter({ type: "comarkSpan", raw: null, children: [] } as never, token);
      },
      comarkAfter: enterNode("comarkAfter"),
      comarkBlock: function (this: CompileContext, token: Token) {
        this.enter({ type: "comarkBlock", name: null, colons: 0, raw: null } as never, token);
      },
      comarkBlockYaml: function (this: CompileContext, token: Token) {
        this.enter(
          { type: "comarkYaml", yaml: [], yamlStart: null, yamlClosed: false } as never,
          token,
        );
      },
    },
    exit: {
      comarkName(token) {
        top(this).name = this.sliceSerialize(token);
      },
      comarkAttributesValue(token) {
        top(this).raw = this.sliceSerialize(token);
      },
      comarkBlockMarker(token) {
        top(this).colons = this.sliceSerialize(token).length;
      },
      comarkBlockYamlFence(token) {
        const n = top(this);
        if (n.yamlStart === null || n.yamlStart === undefined) n.yamlStart = token.start.line;
        else n.yamlClosed = true;
      },
      comarkBlockYamlValue(token) {
        top(this).yaml!.push({ line: token.start.line, text: this.sliceSerialize(token) });
      },
      comarkText: exitNode,
      comarkSpan: exitNode,
      comarkAfter: exitNode,
      comarkBlock: exitNode,
      comarkBlockYaml: exitNode,
    },
  };
}

// ── attributes → JSX attributes or HTML properties ──────────────────────────────────────────

/** HTML's boolean attributes: a bare name on an element is these as `true`, anything else as "". */
const HTML_BOOLEANS = new Set(
  (
    "allowfullscreen async autofocus autoplay checked controls default defer disabled hidden " +
    "inert itemscope loop multiple muted nomodule novalidate open playsinline readonly required " +
    "reversed selected"
  ).split(" "),
);

type Warn = (message: string, line?: number) => void;

function attributesOf(node: MdNode, warn: Warn): ComarkAttribute[] {
  if (!node.raw) return [];
  const parsed = parseComarkAttributes(node.raw);
  if (!parsed)
    warn(`{${node.raw}} is not an attribute list; it is ignored.`, node.position?.start.line);
  return parsed ?? [];
}

const isHandler = (name: string) => /^on[a-z]/i.test(name) && name.length > 2;

/** For a component: MDX JSX attributes (className, id, strings, booleans, bound data, style). */
function jsxAttributes(attrs: ComarkAttribute[], warn: Warn, line?: number): unknown[] {
  const classes: string[] = [];
  const out: unknown[] = [];
  for (const a of attrs) {
    if (a.kind === "class") classes.push(a.value);
    else if (a.kind === "id") out.push({ type: "mdxJsxAttribute", name: "id", value: a.value });
    else if (isHandler(a.name))
      warn(`${a.name}: a Comark attribute is text, not a function; it is dropped.`, line);
    else if (a.name === "class" || a.name === "className") {
      if (typeof a.value === "string") classes.push(...a.value.split(/\s+/).filter(Boolean));
    } else if (a.name === "style" && typeof a.value === "string" && !a.bind)
      out.push(jsxAttribute("style", styleObject(a.value)));
    else if (a.bind) {
      const b = bindingValue(String(a.value));
      if (!b.ok)
        warn(`:${a.name}="${a.value}" is not JSON or a literal; it is passed as text.`, line);
      out.push(jsxAttribute(a.name, b.value));
    } else if (a.value === true) out.push({ type: "mdxJsxAttribute", name: a.name, value: null });
    else out.push({ type: "mdxJsxAttribute", name: a.name, value: a.value });
  }
  if (classes.length)
    out.unshift({ type: "mdxJsxAttribute", name: "className", value: classes.join(" ") });
  return out;
}

/** For an HTML element (or a Markdown one: `**x**{…}`): hast properties. */
function htmlProperties(
  attrs: ComarkAttribute[],
  tag: string,
  warn: Warn,
  line?: number,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const classes: string[] = [];
  for (const a of attrs) {
    if (a.kind === "class") classes.push(a.value);
    else if (a.kind === "id") props.id = a.value;
    else if (isHandler(a.name))
      warn(`${a.name}: a Comark attribute is text, not a function; it is dropped.`, line);
    else if (a.name === "class" || a.name === "className") {
      if (typeof a.value === "string") classes.push(...a.value.split(/\s+/).filter(Boolean));
    } else if (tag === "img" && a.name === "lazy" && a.value === true) props.loading = "lazy";
    else if (a.bind) {
      const v = bindingValue(String(a.value)).value;
      props[a.name] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    } else if (a.value === true)
      props[a.name] = HTML_BOOLEANS.has(a.name.toLowerCase()) ? true : "";
    else props[a.name] = a.value;
  }
  if (classes.length) props.className = classes;
  return props;
}

/** Merge attributes into a Markdown element's hast properties (`**x**{.y}`, `![](z){width=1}`). */
function addProperties(node: MdNode, props: Record<string, unknown>) {
  const data = (node.data ??= {});
  const own = (data.hProperties ??= {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(props)) {
    if (k === "className") {
      const before = Array.isArray(own.className)
        ? (own.className as string[])
        : typeof own.className === "string"
          ? [own.className]
          : [];
      own.className = [...before, ...(v as string[])];
    } else own[k] = v;
  }
}

/** The tag a Markdown element compiles to, for the img-only and boolean rules. */
const TAG_OF: Record<string, string> = {
  strong: "strong",
  emphasis: "em",
  delete: "del",
  inlineCode: "code",
  link: "a",
  linkReference: "a",
  image: "img",
  imageReference: "img",
};

// ── building the output nodes ───────────────────────────────────────────────────────────────

/** What `:name…` / `::name…` becomes, with these children. */
function element(
  name: string,
  attrs: ComarkAttribute[],
  children: MdNode[],
  flow: boolean,
  position: Position | undefined,
  warn: Warn,
): MdNode {
  const target = comarkName(name);
  const line = position?.start.line;
  if ("element" in target)
    return {
      type: "comarkElement",
      children,
      position,
      data: {
        hName: target.element,
        hProperties: htmlProperties(attrs, target.element, warn, line),
      },
    };
  return {
    type: flow ? "mdxJsxFlowElement" : "mdxJsxTextElement",
    name: target.component,
    attributes: jsxAttributes(attrs, warn, line),
    children,
    position,
  };
}

/** `[label]{…}`: a span. */
function spanOf(node: MdNode, warn: Warn): MdNode {
  return element("span", attributesOf(node, warn), node.children ?? [], false, node.position, warn);
}

/** Inline: components and spans built, `{…}` after an element put on that element. */
function inline(children: MdNode[], warn: Warn): MdNode[] {
  const out: MdNode[] = [];
  for (const child of children) {
    if (child.type === "comarkText") {
      out.push(
        element(
          child.name ?? "span",
          attributesOf(child, warn),
          child.children ?? [],
          false,
          child.position,
          warn,
        ),
      );
      continue;
    }
    if (child.type === "comarkSpan") {
      out.push(spanOf(child, warn));
      continue;
    }
    if (child.type === "comarkAfter") {
      const prev = out[out.length - 1];
      const attrs = attributesOf(child, warn);
      const adjacent =
        prev?.position?.end.offset !== undefined &&
        prev.position.end.offset === child.position?.start.offset;
      const line = child.position?.start.line;
      if (prev && adjacent && TAG_OF[prev.type]) {
        addProperties(prev, htmlProperties(attrs, TAG_OF[prev.type]!, warn, line));
        continue;
      }
      if (prev && adjacent && prev.type === "comarkElement") {
        addProperties(prev, htmlProperties(attrs, String(prev.data?.hName), warn, line));
        continue;
      }
      if (prev && adjacent && prev.type === "mdxJsxTextElement") {
        (prev.attributes as unknown[]).push(...jsxAttributes(attrs, warn, line));
        continue;
      }
      // Nothing to put them on: the text as written, as it was before Comark.
      warn(`{${child.raw ?? ""}} follows nothing it can apply to; it is shown as text.`, line);
      out.push({ type: "text", value: `{${child.raw ?? ""}}`, position: child.position });
      continue;
    }
    out.push(child);
  }
  return out;
}

const SLOT = /^#([A-Za-z][\w-]*)[ \t]*$/;

/**
 * A block's children cut at its `#slot` lines. A marker is a line of its own; it may open a
 * paragraph (`#title` then the slot's first line) or sit in the middle of one.
 */
function sections(children: MdNode[]): Array<{ slot: string; nodes: MdNode[] }> {
  const out: Array<{ slot: string; nodes: MdNode[] }> = [{ slot: "default", nodes: [] }];
  const add = (n: MdNode) => out[out.length - 1]!.nodes.push(n);
  for (const child of children) {
    if (child.type !== "paragraph" || !child.children?.some((c) => c.type === "text")) {
      add(child);
      continue;
    }
    // Walk the paragraph line by line through its text nodes.
    let current: MdNode[] = [];
    let atLineStart = true;
    let found = false;
    const flush = () => {
      // trim the line endings left at the cut
      const first = current[0];
      if (first?.type === "text") first.value = first.value!.replace(/^\r?\n/, "");
      const last = current[current.length - 1];
      if (last?.type === "text") last.value = last.value!.replace(/\r?\n$/, "");
      const kept = current.filter((c) => c.type !== "text" || c.value);
      if (kept.length) add({ ...child, children: kept });
      current = [];
    };
    for (const node of child.children) {
      if (node.type !== "text") {
        current.push(node);
        atLineStart = false;
        continue;
      }
      const lines = node.value!.split("\n");
      let buffer = "";
      lines.forEach((l, i) => {
        const startOfLine = i > 0 || atLineStart;
        const m = startOfLine ? SLOT.exec(l.replace(/\r$/, "")) : null;
        const lastLine = i === lines.length - 1;
        if (m) {
          if (buffer) current.push({ type: "text", value: buffer });
          buffer = "";
          flush();
          out.push({ slot: m[1]!, nodes: [] });
          found = true;
          return;
        }
        buffer += l + (lastLine ? "" : "\n");
      });
      if (buffer)
        current.push({ ...node, value: buffer, position: found ? undefined : node.position });
      atLineStart = node.value!.endsWith("\n");
    }
    if (!found) {
      add(child);
      continue;
    }
    flush();
  }
  return out;
}

/** An opener's `---` YAML, as props. */
function yamlProps(open: MdNode, warn: Warn): unknown[] {
  if (open.yamlStart === null || open.yamlStart === undefined) return [];
  const lines: string[] = [];
  for (const { line, text } of open.yaml ?? []) {
    while (lines.length < line - open.yamlStart - 1) lines.push("");
    lines.push(text);
  }
  let value: unknown;
  try {
    value = YAML.parse(lines.join("\n"));
  } catch (e) {
    warn(
      `::${open.name}'s props are not YAML (${(e as Error).message.split("\n")[0]}).`,
      open.yamlStart,
    );
    return [];
  }
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value)) {
    warn(`::${open.name}'s props must be YAML keys and values.`, open.yamlStart);
    return [];
  }
  return Object.entries(value as Record<string, Loose>).map(([k, v]) => jsxAttribute(k, v));
}

interface Frame {
  open: MdNode;
  nodes: MdNode[];
}

/** Openers and closers among `children` paired up into elements, the Markdown between inside. */
function nest(children: MdNode[], warn: Warn): MdNode[] {
  const root: MdNode[] = [];
  const stack: Frame[] = [];
  const sink = () => (stack.length ? stack[stack.length - 1]!.nodes : root);

  const finish = (frame: Frame, close: MdNode | null) => {
    const { open } = frame;
    const line = open.position?.start.line;
    if (!close)
      warn(
        `::${open.name} is never closed (a line of ${":".repeat(open.colons ?? 2)}); it ends with what it is in.`,
        line,
      );
    const end =
      close?.position?.end ??
      frame.nodes[frame.nodes.length - 1]?.position?.end ??
      open.position?.end;
    const position = open.position && end ? { start: open.position.start, end } : undefined;
    const attrs = attributesOf(open, warn);
    const cut = sections(frame.nodes);
    const target = comarkName(open.name!);
    let kids: MdNode[];
    if ("element" in target) {
      if (cut.length > 1)
        warn(
          `<${target.element}> has no named slots; ::${open.name}'s #${cut[1]!.slot} is drawn in line.`,
          line,
        );
      kids = cut.flatMap((s) => s.nodes);
    } else {
      kids = [];
      for (const s of cut) {
        if (s.slot === "default") kids.push(...s.nodes);
        else {
          const prop = camelCase(s.slot);
          // One paragraph is a line of text — a title, a label — so it arrives as that text.
          const only = s.nodes.length === 1 && s.nodes[0]!.type === "paragraph";
          kids.push({
            type: "comarkSlot",
            children: only ? (s.nodes[0]!.children ?? []) : s.nodes,
            data: { hName: "kadal-comark-slot", hProperties: { dataKadalSlot: prop } },
          });
        }
      }
    }
    const el = element(open.name!, attrs, kids, true, position, warn);
    if (el.type === "mdxJsxFlowElement")
      (el.attributes as unknown[]).push(...yamlProps(open, warn));
    else if (open.yamlStart != null)
      warn(`<${String(el.data?.hName)}> takes no YAML props; they are ignored.`, line);
    sink().push(el);
  };

  for (const child of children) {
    if (child.type === "comarkYaml") {
      // Only ever straight after an opener (comark-syntax.ts): that opener's props.
      const frame = stack[stack.length - 1];
      if (frame && !frame.nodes.length && frame.open.yamlStart == null) {
        Object.assign(frame.open, {
          yaml: child.yaml,
          yamlStart: child.yamlStart,
          yamlClosed: child.yamlClosed,
        });
        if (!child.yamlClosed)
          warn(
            `::${frame.open.name}'s props never close (a line of ---); they run to the end of the block.`,
            child.position?.start.line,
          );
      }
      continue;
    }
    if (child.type !== "comarkBlock") {
      sink().push(child);
      continue;
    }
    if (child.name) {
      stack.push({ open: child, nodes: [] });
      continue;
    }
    // A closer: the innermost open block with as many colons, else the innermost one.
    if (!stack.length) {
      // Nothing open: the line is text again, as it was before Comark — the last line of the
      // paragraph just above it (the end of a VitePress `::: tip`), or a paragraph of its own.
      const colons = ":".repeat(child.colons ?? 2);
      const prev = root[root.length - 1];
      const last = prev?.children?.[prev.children.length - 1];
      if (
        prev?.type === "paragraph" &&
        prev.position &&
        child.position &&
        prev.position.end.line === child.position.start.line - 1 &&
        last?.type === "text"
      ) {
        last.value += `\n${colons}`;
        prev.position = { start: prev.position.start, end: child.position.end };
      } else
        root.push({
          type: "paragraph",
          children: [{ type: "text", value: colons }],
          position: child.position,
        });
      continue;
    }
    let at = stack.length - 1;
    for (let k = stack.length - 1; k >= 0; k--)
      if (stack[k]!.open.colons === child.colons) {
        at = k;
        break;
      }
    while (stack.length - 1 > at) finish(stack.pop()!, null);
    finish(stack.pop()!, child);
  }
  while (stack.length) finish(stack.pop()!, null);
  return root;
}

/** Every parent, children first: inline forms built, then blocks paired. */
function transform(parent: MdNode, warn: Warn) {
  if (!parent.children) return;
  for (const child of parent.children) if (child.children) transform(child, warn);
  let kids = parent.children;
  if (
    kids.some((c) => c.type === "comarkText" || c.type === "comarkSpan" || c.type === "comarkAfter")
  )
    kids = inline(kids, warn);
  if (kids.some((c) => c.type === "comarkBlock")) kids = nest(kids, warn);
  parent.children = kids;
}

/**
 * The remark plugin: Comark's syntax in the parser, and the pass that turns it into JSX. Put
 * `rehypeComarkSlots` (rehype-comark.ts) last among the rehype plugins for named slots.
 */
export function remarkComark(this: { data(): unknown }, options: RemarkComarkOptions = {}) {
  const data = this.data() as {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
  };
  (data.micromarkExtensions ??= []).push(comarkSyntax());
  (data.fromMarkdownExtensions ??= []).push(comarkFromMarkdown());
  const warn: Warn = options.warn ?? (() => {});
  return (tree: unknown) => transform(tree as MdNode, warn);
}
