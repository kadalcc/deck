import { toEstree } from "hast-util-to-estree";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMARK'S NAMED SLOTS  —  `#title` sections as props
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * remark-comark.ts leaves each named slot of a block component as a `<kadal-comark-slot>`
 * element among the component's children, so the slot's Markdown goes through every other pass
 * (code highlighting, maths, the glossary) like the rest of the slide. This pass, run last, moves
 * each one out of the children and into a prop holding its rendered content:
 *
 *   ::callout          <Callout title={<><p>A <em>named</em> slot.</p></>}>
 *   Body.                <p>Body.</p>
 *   #title             </Callout>
 *   A *named* slot.
 *   ::
 *
 * which is how a React component takes a second piece of content (`title`, `footer`, `icon`).
 * The fragment is built with hast-util-to-estree, the converter MDX itself compiles hast with,
 * so what is in a slot compiles exactly as it would anywhere else in the slide.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface HNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  attributes?: unknown[];
  children?: HNode[];
}

const isSlot = (n: HNode) => n.type === "element" && n.tagName === "kadal-comark-slot";

function lift(node: HNode) {
  if (!node.children) return;
  for (const child of node.children) lift(child);
  if (
    (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") ||
    !node.children.some(isSlot)
  )
    return;
  const kept: HNode[] = [];
  for (const child of node.children) {
    if (!isSlot(child)) {
      kept.push(child);
      continue;
    }
    const name = String(child.properties?.dataKadalSlot ?? "slot");
    const program = toEstree(
      { type: "root", children: (child.children ?? []) as never[] } as never,
      {
        elementAttributeNameCase: "react",
        stylePropertyNameCase: "dom",
      },
    );
    (node.attributes ??= []).push({
      type: "mdxJsxAttribute",
      name,
      value: { type: "mdxJsxAttributeValueExpression", value: "", data: { estree: program } },
    });
  }
  node.children = kept;
}

/** The rehype plugin; last in the list, after every pass that should see a slot's content. */
export function rehypeComarkSlots() {
  return (tree: unknown) => lift(tree as HNode);
}
