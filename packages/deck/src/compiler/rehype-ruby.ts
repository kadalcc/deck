import type { Element, ElementContent, Root, Text } from "hast";

/**
 * Notes auto-ruby (Slidev's `notesAutoRuby`): the headmatter maps words to their reading, and
 * every occurrence in the speaker notes is annotated —
 *
 *   notesAutoRuby:
 *     日本語: ni hon go
 *     勉強: べんきょう
 *
 *   私は日本語を勉強しています。 → 私は<ruby>日本語<rt>ni hon go</rt></ruby>を<ruby>勉強<rt>べんきょう</rt></ruby>しています。
 *
 * Longer words win where two overlap; code, existing ruby and links' targets are left alone. Only
 * the notes get it: the slide is what the audience reads, the notes are what the speaker says.
 */
export interface RehypeRubyOptions {
  ruby: Record<string, string>;
}

const SKIP = new Set(["code", "pre", "ruby", "rt", "rp", "script", "style", "math", "svg"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The map as a usable list: string readings only, longest word first. */
export function rubyEntries(map: unknown): Array<[string, string]> {
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.entries(map as Record<string, unknown>)
    .filter((e): e is [string, string] => !!e[0] && typeof e[1] === "string" && !!e[1])
    .sort((a, b) => b[0].length - a[0].length);
}

export function rehypeAutoRuby(options: RehypeRubyOptions) {
  const entries = rubyEntries(options.ruby);
  const reading = new Map(entries);
  const source = entries.map(([w]) => escape(w)).join("|");
  const pattern = entries.length ? new RegExp(source, "g") : null;
  const probe = entries.length ? new RegExp(source) : null;
  return (tree: Root) => {
    if (!pattern) return;
    const walk = (node: Root | Element) => {
      const next: ElementContent[] = [];
      let changed = false;
      for (const child of node.children as ElementContent[]) {
        if (child.type === "element") {
          if (!SKIP.has(child.tagName) && !hasClass(child, "katex")) walk(child);
          next.push(child);
          continue;
        }
        // An MDX component in the notes (`<Click>`, `<Term>`): its children are notes text too.
        if ((child as { type: string }).type.startsWith("mdxJsx") && "children" in child) {
          walk(child as unknown as Element);
          next.push(child);
          continue;
        }
        if (child.type !== "text" || !probe!.test(child.value)) {
          next.push(child);
          continue;
        }
        changed = true;
        let at = 0;
        for (const m of child.value.matchAll(pattern)) {
          if (m.index! > at) next.push(text(child.value.slice(at, m.index)));
          next.push({
            type: "element",
            tagName: "ruby",
            properties: {},
            children: [
              text(m[0]),
              {
                type: "element",
                tagName: "rt",
                properties: {},
                children: [text(reading.get(m[0])!)],
              },
            ],
          });
          at = m.index! + m[0].length;
        }
        if (at < child.value.length) next.push(text(child.value.slice(at)));
      }
      if (changed) node.children = next as never;
    };
    walk(tree);
  };
}

const text = (value: string): Text => ({ type: "text", value });

function hasClass(el: Element, name: string): boolean {
  const c = el.properties?.className;
  return Array.isArray(c)
    ? c.includes(name)
    : String(c ?? "")
        .split(" ")
        .includes(name);
}
