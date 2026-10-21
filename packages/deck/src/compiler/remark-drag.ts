import { visit } from "unist-util-visit";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DRAGGABLE ELEMENTS  —  numbering them, and reading Slidev's spellings
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `<Drag>` and `<DragArrow>` save a new position back into the slide's source in `kadal-deck dev`
 * (vite/drag-dev.ts). One whose position is a frontmatter name (`pos="logo"`) is found by that
 * name; one whose position is written on the tag is found by its place among the slide's drag
 * sites, which this pass stamps on it as `data-drag-index` — and `dragSites` (authoring/drag.ts)
 * counts the same sites in the source text, the same way, to find the tag to rewrite.
 *
 * Slidev's spellings compile to Kadal's:
 *
 *   <v-drag pos="…">…</v-drag>, <VDrag>        → <Drag pos="…">
 *   <v-drag-arrow pos="…" />, <VDragArrow>     → <DragArrow pos="…" />
 *   <img v-drag="'logo'" src="…" />            → <Drag pos="logo"><img src="…" /></Drag>
 *   <img v-drag="[10,20,300,200]" src="…" />   → <Drag pos="10,20,300,200"><img … /></Drag>
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface JsxAttr {
  type: string;
  name?: string;
  value?: unknown;
}
interface JsxNode {
  type: string;
  name?: string | null;
  attributes?: JsxAttr[];
  children?: unknown[];
  position?: unknown;
}

/** Tag names that are a drag site of their own, and the component each one compiles to. */
export const DRAG_TAGS: Record<string, "Drag" | "DragArrow"> = {
  Drag: "Drag",
  DragArrow: "DragArrow",
  VDrag: "Drag",
  VDragArrow: "DragArrow",
  "v-drag": "Drag",
  "v-drag-arrow": "DragArrow",
};

/**
 * Slidev's `v-drag` directive value → a `pos`: `'name'` (a quoted frontmatter name), `[x,y,w,h,r]`
 * (numbers, `NaN` for an automatic height), or empty for "place it where it lies".
 */
export function directivePos(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  const quoted = /^(['"`])(.*)\1$/.exec(v);
  if (quoted) return quoted[2];
  const list = /^\[(.*)\]$/.exec(v);
  if (list)
    return list[1]!
      .split(",")
      .map((x) => (x.trim() === "NaN" ? "_" : x.trim()))
      .join(",");
  return v || undefined;
}

const isJsx = (n: { type: string }) =>
  n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement";

export function remarkDrag() {
  return (tree: unknown) => {
    let index = 0;
    visit(tree as never, (n: { type: string }, i, parent: { children: unknown[] } | undefined) => {
      if (!isJsx(n)) return;
      const node = n as JsxNode;
      const name = node.name ?? "";
      const as = DRAG_TAGS[name];
      if (as) {
        node.name = as;
        node.attributes = [
          ...(node.attributes ?? []),
          { type: "mdxJsxAttribute", name: "data-drag-index", value: String(index++) },
        ];
        return;
      }
      const directive = node.attributes?.find(
        (a) => a.type === "mdxJsxAttribute" && a.name === "v-drag",
      );
      if (!directive || !parent || typeof i !== "number") return;
      // Wrap: the element keeps every other attribute and moves inside a <Drag>.
      const pos = directivePos(directive.value);
      const inner: JsxNode = {
        ...node,
        attributes: node.attributes!.filter((a) => a !== directive),
      };
      const wrapper: JsxNode = {
        type: node.type,
        name: "Drag",
        attributes: [
          ...(pos ? [{ type: "mdxJsxAttribute", name: "pos", value: pos }] : []),
          { type: "mdxJsxAttribute", name: "data-drag-index", value: String(index++) },
          { type: "mdxJsxAttribute", name: "data-drag-directive", value: "" },
        ],
        children: [inner],
        position: node.position,
      };
      parent.children[i] = wrapper;
    });
  };
}
