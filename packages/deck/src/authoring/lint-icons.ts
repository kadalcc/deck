import { ICONIFY_PREFIXES } from "../icons/collections.ts";
import {
  type IconifySet,
  iconFromSet,
  iconFromTag,
  iconPackage,
  nearIconNames,
  parseIconName,
} from "../icons/data.ts";
import type { Diagnostic } from "./lint.ts";
import { closest } from "./validate.ts";

/**
 * The icon half of the linter: every icon a slide names in a form the compiler reads — Slidev's
 * `<mdi-account />`, `<Icon name="mdi:account">`, an `icon="mdi:star"` prop, UnoCSS's
 * `class="i-mdi-account"` — checked against Iconify's sets and, when the caller can read the
 * deck's node_modules (`kadal-deck check`), against the installed set itself:
 *
 *   icon-set-unknown   `name="mdx:account"`: no Iconify set is called that (did you mean mdi?)
 *   icon-set-missing   the set is real but not installed: it works, fetched from the Iconify API
 *                      when the slide is shown — install `@iconify-json/<set>` to bundle it
 *   icon-unknown       the set is installed and has no such icon (with the nearest names)
 */

interface JsxNode {
  type: string;
  name?: string | null;
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
  children?: Array<{ type: string; value?: string }>;
}

/** Load a set for the deck (null: not installed); undefined when the caller cannot tell. */
export type IconSetLoader = (prefix: string) => IconifySet | null;

const literal = (n: JsxNode, name: string) => {
  const a = n.attributes?.find((x) => x.type === "mdxJsxAttribute" && x.name === name);
  return a && typeof a.value === "string" ? a.value : undefined;
};

/** The `set:icon` names one JSX node uses, each with how it was written (for the message). */
export function iconsOf(n: JsxNode): Array<{ name: string; written: string }> {
  if (n.type !== "mdxJsxFlowElement" && n.type !== "mdxJsxTextElement") return [];
  const out: Array<{ name: string; written: string }> = [];
  const tag = n.name ?? "";
  const empty =
    !n.children?.length || n.children.every((c) => c.type === "text" && !c.value?.trim());
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag) && empty) {
    const icon = iconFromTag(tag);
    if (icon) out.push({ name: icon, written: `<${tag} />` });
  }
  if (tag === "Icon") {
    const name = literal(n, "name");
    if (name?.includes(":")) out.push({ name, written: `<Icon name="${name}">` });
  }
  const prop = literal(n, "icon");
  if (prop?.includes(":")) out.push({ name: prop, written: `<${tag} icon="${prop}">` });
  if (/^(div|span|i)$/.test(tag) && empty) {
    const cls = literal(n, "class") ?? literal(n, "className") ?? "";
    for (const t of cls.split(/\s+/))
      if (t.startsWith("i-")) {
        const icon = iconFromTag(t);
        if (icon) out.push({ name: icon, written: `class="${t}"` });
      }
  }
  return out;
}

export function checkIcons(
  n: JsxNode,
  at: Pick<Diagnostic, "file" | "line" | "slide" | "column">,
  add: (d: Diagnostic) => void,
  load?: IconSetLoader,
  reported?: Set<string>,
) {
  for (const { name, written } of iconsOf(n)) {
    const parsed = parseIconName(name);
    if (!parsed) {
      add({
        ...at,
        severity: "warning",
        code: "icon-unknown",
        message: `${written}: "${name}" is not an icon name; write set:icon, e.g. mdi:account.`,
      });
      continue;
    }
    if (parsed.prefix === "lucide") continue; // bundled
    if (!ICONIFY_PREFIXES.has(parsed.prefix)) {
      const near = closest(parsed.prefix, ICONIFY_PREFIXES);
      add({
        ...at,
        severity: "warning",
        code: "icon-set-unknown",
        message: `${written}: there is no Iconify set "${parsed.prefix}"; the icon draws as an empty box.`,
        hint: near
          ? `Did you mean ${near}:${parsed.name}?`
          : "Browse the sets at https://icones.js.org.",
      });
      continue;
    }
    if (!load) continue;
    const set = load(parsed.prefix);
    if (!set) {
      // Once per set per run: a deck full of mdi icons needs one line, not forty.
      if (reported?.has(parsed.prefix)) continue;
      reported?.add(parsed.prefix);
      add({
        ...at,
        severity: "warning",
        code: "icon-set-missing",
        message: `${written}: the "${parsed.prefix}" icons are not installed, so they are fetched from the Iconify API when a slide shows them (a built deck needs the network for them).`,
        hint: `Install the set to bundle it: bun add -d ${iconPackage(parsed.prefix)}`,
      });
      continue;
    }
    if (!iconFromSet(set, parsed.name)) {
      const near = nearIconNames(set, parsed.name);
      add({
        ...at,
        severity: "warning",
        code: "icon-unknown",
        message: `${written}: the "${parsed.prefix}" set has no icon "${parsed.name}"; it draws as an empty box.`,
        hint: near.length
          ? `Did you mean ${near.map((x) => `${parsed.prefix}:${x}`).join(", ")}?`
          : `Browse the set at https://icones.js.org/collection/${parsed.prefix}.`,
      });
    }
  }
}
