import type { Diagnostic } from "./lint.ts";

/**
 * Slidev's syntax left in a Kadal deck. Most of it fails loudly (MDX rejects `@click` and
 * `:prop`), but a directive attribute or a Vue tag compiles and then does nothing — `<div v-click>`
 * shows from the start, `<v-clicks>` is an unknown element. Those get a warning with the Kadal
 * spelling, and a pointer at `kadal-deck import slidev`, which converts a whole deck.
 * (`v-drag`, `<v-drag>` and `<v-drag-arrow>` are read natively: compiler/remark-drag.ts.)
 */

const DIRECTIVES: Record<string, string> = {
  "v-click": "<Click>",
  "v-after": "<After>",
  "v-mark": "<Mark>",
  "v-motion": "<Motion>",
  "v-if": "a <Click>, <ClickCount when>, <RenderWhen> or <LightOrDark>",
  "v-else": "a <Click>, <RenderWhen> or <LightOrDark>",
  "v-show": "a <Click>",
  "v-for": "the items written out",
  "v-html": "the markup written out",
  "v-bind": "the props written out",
};

const TAGS: Record<string, string> = {
  "v-click": "<Click>",
  "v-after": "<After>",
  "v-clicks": "<Clicks>",
  "v-switch": "<Switch> with <Case at>",
  "v-click-gap": '<Click at="+N" />',
};

const IMPORT_HINT = "Or convert the whole deck: kadal-deck import slidev <slides.md>.";

interface JsxNode {
  type: string;
  name?: string | null;
  attributes?: Array<{ type: string; name?: string }>;
}

export function checkSlidevLeftovers(
  n: JsxNode,
  at: Pick<Diagnostic, "file" | "line" | "slide"> & { column?: number },
  add: (d: Diagnostic) => void,
) {
  if ((n.type !== "mdxJsxFlowElement" && n.type !== "mdxJsxTextElement") || !n.name) return;
  const tag = TAGS[n.name];
  if (tag)
    add({
      ...at,
      severity: "warning",
      code: "slidev-syntax",
      message: `<${n.name}> is Slidev's; Kadal draws it as an unknown element that does nothing.`,
      hint: `Write ${tag}. ${IMPORT_HINT}`,
    });
  for (const attr of n.attributes ?? []) {
    const base = attr.type === "mdxJsxAttribute" ? attr.name?.split(".")[0] : undefined;
    const kadal = base ? DIRECTIVES[base] : undefined;
    if (!kadal) continue;
    add({
      ...at,
      severity: "warning",
      code: "slidev-syntax",
      message: `${attr.name} is a Slidev (Vue) directive; in Kadal it is an attribute that does nothing.`,
      hint: `Use ${kadal}. ${IMPORT_HINT}`,
    });
  }
}
