import { visit } from "unist-util-visit";

import { iconFromTag, parseIconName } from "../icons/data.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ICON TAGS  —  Slidev's `<mdi-account />` as Kadal's `<Icon name="mdi:account" />`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <mdi-account-circle />                     → <Icon name="mdi:account-circle" size="1.2em" />
 *   <logos-vue class="text-3xl" />             → <Icon name="logos:vue" size="1.2em" class="text-3xl" />
 *   <div class="i-carbon-logo-github mr-2" />  → <Icon name="carbon:logo-github" size="1.2em" class="mr-2" />
 *
 * A lowercase tag becomes an icon only when an Iconify set starts it (icons/collections.ts, the
 * longest set wins) AND it is empty — an icon has no children — so a custom element that happens
 * to share a set's prefix (`<ion-button>Go</ion-button>`) is left alone. Slidev draws these at
 * 1.2em, and so does this, unless the tag sets a size of its own. Every other attribute is kept.
 *
 * `onIcon` hears every `set:icon` the slide names in a form the compiler can read — these tags,
 * `<Icon name="set:icon">`, and any `icon="set:icon"` prop (`<Chip icon="mdi:star">`) — which is
 * how the Vite plugin knows which drawings to bundle into the slide's module (icons/node.ts).
 * Names written as expressions (`name={x}`) are fetched at run time instead.
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
  children?: Array<{ type: string; value?: string }>;
}

export interface RemarkIconsOptions {
  onIcon?: (name: string) => void;
}

const isJsx = (n: { type: string }) =>
  n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement";

const literal = (attrs: JsxAttr[] | undefined, name: string) => {
  const a = attrs?.find((x) => x.type === "mdxJsxAttribute" && x.name === name);
  return a && typeof a.value === "string" ? a.value : undefined;
};

const empty = (n: JsxNode) =>
  !n.children?.length || n.children.every((c) => c.type === "text" && !c.value?.trim());

const attr = (name: string, value: string): JsxAttr => ({ type: "mdxJsxAttribute", name, value });

/** Turn the node into `<Icon name=…>`, keeping its other attributes. */
function toIcon(node: JsxNode, icon: string, attrs: JsxAttr[]) {
  const sized = attrs.some(
    (a) =>
      a.type === "mdxJsxAttribute" &&
      (a.name === "size" || a.name === "width" || a.name === "height"),
  );
  node.name = "Icon";
  node.attributes = [attr("name", icon), ...(sized ? [] : [attr("size", "1.2em")]), ...attrs];
  node.children = [];
}

/** UnoCSS's icon classes on an empty element: `i-carbon-logo-github` or `i-carbon:logo-github`. */
function classIcon(node: JsxNode): { icon: string; rest: string } | null {
  if (!node.name || !/^(div|span|i)$/.test(node.name) || !empty(node)) return null;
  const cls = literal(node.attributes, "class") ?? literal(node.attributes, "className");
  if (!cls) return null;
  const tokens = cls.split(/\s+/).filter(Boolean);
  const at = tokens.findIndex((t) => t.startsWith("i-") && iconFromTag(t));
  if (at === -1) return null;
  return {
    icon: iconFromTag(tokens[at]!)!,
    rest: tokens.filter((_, i) => i !== at).join(" "),
  };
}

export function remarkIcons(options: RemarkIconsOptions = {}) {
  const heard = (name: string | undefined) => {
    if (name && parseIconName(name)) options.onIcon?.(name);
  };
  return (tree: unknown) => {
    visit(tree as never, (n: { type: string }) => {
      if (!isJsx(n)) return;
      const node = n as JsxNode;
      const name = node.name ?? "";
      if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name) && empty(node)) {
        const icon = iconFromTag(name);
        if (icon) {
          toIcon(node, icon, node.attributes ?? []);
          heard(icon);
          return;
        }
      }
      const byClass = classIcon(node);
      if (byClass) {
        const kept = (node.attributes ?? []).filter(
          (a) => !(a.type === "mdxJsxAttribute" && (a.name === "class" || a.name === "className")),
        );
        toIcon(
          node,
          byClass.icon,
          byClass.rest ? [...kept, attr("className", byClass.rest)] : kept,
        );
        heard(byClass.icon);
        return;
      }
      if (name === "Icon") heard(literal(node.attributes, "name"));
      heard(literal(node.attributes, "icon"));
    });
  };
}
