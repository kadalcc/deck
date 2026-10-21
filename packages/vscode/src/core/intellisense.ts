import { type ComponentInfo, type FrontmatterKey, catalog } from "@kadal/deck/catalog";

import type { ParsedDeck } from "./deck.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FRONTMATTER AND COMPONENT INTELLISENSE, from the engine's catalog
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The catalog (`@kadal/deck/catalog`) is the one list of every deck and slide setting, layout,
 * transition, background, theme and component, with their documentation — the same data the JSON
 * Schema (`@kadal/deck/schema/frontmatter.json`), `kadal-deck info` and the MCP server are made
 * from. So completions and hovers here say exactly what the engine reads.
 *
 * Where the cursor is decides what is offered:
 *   the headmatter (YAML at the top)   deck settings, then slide settings (the first slide's)
 *   a slide's frontmatter              slide settings
 *   after `key: ` in either            that key's known values (layouts, transitions, themes…)
 *   `<` in a slide body                components, with their required props as a snippet
 *
 * A frontmatter being typed is often not closed yet (no `---` under it), so the position is read
 * from the lines around the cursor, with the deck's own split saying which `---` lines close a
 * block rather than open one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Scope = "head" | "slide";

export type Context =
  | { kind: "key"; scope: Scope; prefix: string; present: string[] }
  | { kind: "value"; scope: Scope; key: string; prefix: string }
  | { kind: "component"; prefix: string }
  | null;

const SEPARATOR = /^-{3,}\s*$/;
const KEY_LINE = /^([A-Za-z_][\w.-]*)\s*:(.*)$/;
const YAMLISH = (l: string) =>
  !l.trim() || /^\s+\S/.test(l) || /^\s*-\s/.test(l) || /^\s*#/.test(l) || KEY_LINE.test(l);

/** Lines inside fenced code (``` or ~~~), which hold no structure. */
function fencedLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  let open: string | null = null;
  lines.forEach((line, i) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!open) open = m[1]!;
      else if (m[1]![0] === open[0] && m[1]!.length >= open.length) {
        open = null;
        out.add(i);
        return;
      }
    }
    if (open) out.add(i);
  });
  return out;
}

/** Where `line`:`character` is, for completions. `deck` is the parse of the same text. */
export function contextAt(
  text: string,
  deck: ParsedDeck | null,
  line: number,
  character: number,
): Context {
  const lines = text.split(/\r?\n/);
  const current = lines[line] ?? "";
  const before = current.slice(0, character);
  const fenced = fencedLines(lines);

  // In a frontmatter block: walk up through YAML-like lines to the `---` that opened it.
  const fm = (() => {
    if (fenced.has(line) && !isBlockFrontmatter(lines, line)) return null;
    for (let k = line - 1; k >= 0; k--) {
      const l = lines[k]!;
      if (/^\s*(`{3,}|~{3,})ya?ml\s*$/.test(l)) {
        // A ```yaml block right after a separator is that slide's frontmatter.
        let s = k - 1;
        while (s >= 0 && !lines[s]!.trim()) s--;
        return s >= 0 && SEPARATOR.test(lines[s]!) && !deck?.closeLines.has(s)
          ? ("slide" as const)
          : null;
      }
      if (SEPARATOR.test(l)) {
        if (fenced.has(k) || deck?.closeLines.has(k)) return null;
        // The first `---` of the file (nothing but blank lines above it) opens the headmatter.
        const top = lines.slice(0, k).every((x) => !x.trim());
        return top ? ("head" as const) : ("slide" as const);
      }
      if (!YAMLISH(l)) return null;
    }
    return null;
  })();

  if (fm) {
    if (/^\s/.test(current)) return null; // nested values: the catalog does not go that deep
    const key = KEY_LINE.exec(before);
    if (key) {
      return { kind: "value", scope: fm, key: key[1]!, prefix: key[2]!.trimStart() };
    }
    if (/^[A-Za-z_][\w.-]*$|^$/.test(before)) {
      const present: string[] = [];
      for (let k = line - 1; k >= 0 && !SEPARATOR.test(lines[k]!); k--) {
        const m = KEY_LINE.exec(lines[k]!);
        if (m) present.push(m[1]!);
      }
      for (let k = line + 1; k < lines.length && !SEPARATOR.test(lines[k]!); k++) {
        const m = KEY_LINE.exec(lines[k]!);
        if (m) present.push(m[1]!);
      }
      return { kind: "key", scope: fm, prefix: before, present };
    }
    return null;
  }

  if (fenced.has(line)) return null;
  const tag = /<([A-Z][\w.]*)?$/.exec(before);
  if (tag) return { kind: "component", prefix: tag[1] ?? "" };
  return null;
}

function isBlockFrontmatter(lines: string[], line: number): boolean {
  for (let k = line - 1; k >= 0; k--) {
    if (/^\s*(`{3,}|~{3,})ya?ml\s*$/.test(lines[k]!)) return true;
    if (/^\s*(`{3,}|~{3,})/.test(lines[k]!)) return false;
  }
  return false;
}

/** The settings offered in a scope: deck settings first in the headmatter, then slide ones. */
export function keysFor(scope: Scope): FrontmatterKey[] {
  const slide = catalog.slideFrontmatter;
  if (scope === "slide") return slide;
  const names = new Set(catalog.deckFrontmatter.map((k) => k.name));
  return [...catalog.deckFrontmatter, ...slide.filter((k) => !names.has(k.name))];
}

/** A setting by name (or one of its aliases), deck settings first in the headmatter. */
export function keyInfo(name: string, scope: Scope): FrontmatterKey | null {
  return keysFor(scope).find((k) => k.name === name || (k.aliases ?? []).includes(name)) ?? null;
}

export interface ValueSuggestion {
  value: string;
  detail?: string;
}

/** Known values for a setting: its enum, the catalog's list for it, or its suggestions. */
export function valuesFor(name: string, scope: Scope): ValueSuggestion[] {
  const named = (list: Array<{ name: string; summary: string }>) =>
    list.map((x) => ({ value: x.name, detail: x.summary }));
  switch (name) {
    case "layout":
      return named(catalog.layouts);
    case "transition":
    case "backgroundTransition":
      return named(catalog.transitions);
    case "transitionSpeed":
      return named(catalog.transitionSpeeds);
    case "theme":
      return named(catalog.themes);
    case "background":
      return named(catalog.backgrounds);
  }
  const key = keyInfo(name, scope);
  if (!key) return [];
  const out = new Map<string, ValueSuggestion>();
  for (const v of key.type.variants) {
    for (const e of v.enum ?? []) out.set(String(e), { value: String(e) });
    if (v.type === "boolean" && !v.enum) {
      out.set("true", { value: "true" });
      out.set("false", { value: "false" });
    }
  }
  for (const s of key.type.suggest ?? []) if (!out.has(s)) out.set(s, { value: s });
  return [...out.values()];
}

/** Markdown documentation for a setting. */
export function keyDocs(key: FrontmatterKey): string {
  const parts = [`**${key.name}**: \`${key.type.text}\``, "", key.description];
  if (key.default !== undefined) parts.push("", `Default: \`${JSON.stringify(key.default)}\``);
  if (key.aliases?.length)
    parts.push("", `Also written: ${key.aliases.map((a) => `\`${a}\``).join(", ")}`);
  if (key.example) parts.push("", "```yaml", key.example, "```");
  return parts.join("\n");
}

/** The components a slide can use (not the Markdown element mappings). */
export function components(): ComponentInfo[] {
  return catalog.components.filter((c) => !c.mapping);
}

export function componentInfo(name: string): ComponentInfo | null {
  return components().find((c) => c.name === name) ?? null;
}

/**
 * A snippet for a component: its required props as tab stops, and a body unless it is usually
 * written self-closing (no children in its example).
 */
export function componentSnippet(c: ComponentInfo): string {
  let n = 1;
  const props = c.props
    .filter((p) => p.required)
    .map((p) => {
      const quoted = p.type.variants.every((v) => v.type === "string");
      return quoted ? `${p.name}="\${${n++}}"` : `${p.name}={\${${n++}}}`;
    });
  const open = [c.name, ...props].join(" ");
  const selfClosing =
    new RegExp(`<${c.name}\\b[^>]*/>`).test(c.example) &&
    !new RegExp(`</${c.name}>`).test(c.example);
  return selfClosing ? `${open} />` : `${open}>\n\t\${${n}}\n</${c.name}>`;
}

export function componentDocs(c: ComponentInfo): string {
  const props = c.props
    .map(
      (p) =>
        `- \`${p.name}${p.required ? "" : "?"}\`: \`${p.type.text}\`${p.description ? ` — ${p.description}` : ""}`,
    )
    .join("\n");
  return [
    `**<${c.name}>** · ${c.category}`,
    "",
    c.summary,
    "",
    "```mdx",
    c.example,
    "```",
    ...(props ? ["", props] : []),
  ].join("\n");
}
