import YAML from "yaml";

import { type GlossaryEntry, inlineHtml, linkLabel, termId } from "./model.ts";

/**
 * `glossary.yaml` → entries. The key is the term as the card titles it; the value is either the
 * definition itself or a mapping:
 *
 *   GNSS: Satellite positioning — GPS, NavIC, Galileo and the rest.
 *   UTM:
 *     full: Universal Transverse Mercator
 *     def: Sixty projections, each 6° wide, that turn latitude and longitude into **metres**.
 *     more: Chennai sits in zone 44N.
 *     aliases: [UTM zone 44N]
 *     tag: Projection
 *     link: https://epsg.io/32644          # or { href, label }
 *     see: [WGS84, EPSG]
 *     auto: false                           # never linked automatically; <Term> still finds it
 *
 * Definitions take inline Markdown and $maths$; both are rendered here, at build time, so the
 * browser receives finished HTML. Problems an author should hear about come back as `warnings`
 * rather than failing the build: a talk should never stop compiling over a glossary typo.
 */
export interface ParsedGlossary {
  entries: GlossaryEntry[];
  warnings: string[];
}

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean)
    : typeof value === "string"
      ? value
          .split(/\s*[,;]\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

const text = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim() || null
    : null;

export function parseGlossary(
  source: string,
  where: string,
  math?: (tex: string) => string,
): ParsedGlossary {
  const warnings: string[] = [];
  let doc: unknown;
  try {
    doc = YAML.parse(source);
  } catch (e) {
    return { entries: [], warnings: [`${where}: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (doc === null || doc === undefined) return { entries: [], warnings };
  if (typeof doc !== "object" || Array.isArray(doc)) {
    return { entries: [], warnings: [`${where}: the glossary must be a YAML mapping of terms`] };
  }

  const entries: GlossaryEntry[] = [];
  const pendingSee = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const [rawName, value] of Object.entries(doc as Record<string, unknown>)) {
    const name = rawName.trim();
    const id = termId(name);
    if (!id) {
      warnings.push(`${where}: "${rawName}" has no letters or digits to make an id from`);
      continue;
    }
    if (ids.has(id)) {
      warnings.push(`${where}: "${name}" repeats an earlier term (id "${id}"); the first one wins`);
      continue;
    }
    const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<
      string,
      unknown
    >;
    const def = text(typeof value === "object" ? v.def : value);
    if (!def) {
      warnings.push(`${where}: "${name}" has no definition`);
      continue;
    }
    const more = text(v.more);
    const href = text(
      typeof v.link === "object" && v.link ? (v.link as { href?: unknown }).href : v.link,
    );
    const label =
      typeof v.link === "object" && v.link ? text((v.link as { label?: unknown }).label) : null;
    ids.add(id);
    pendingSee.set(id, list(v.see));
    entries.push({
      id,
      name,
      full: text(v.full),
      aliases: list(v.aliases),
      tag: text(v.tag),
      link: href ? { href, label: label ?? linkLabel(href) } : null,
      see: [],
      auto: v.auto !== false,
      html: { def: inlineHtml(def, math), more: more ? inlineHtml(more, math) : null },
    });
  }

  // `see:` names terms the way a person would (by name or alias); resolve them to ids.
  const byWord = new Map<string, string>();
  for (const e of entries) {
    for (const w of [e.name, ...e.aliases, e.id]) {
      const key = w.toLowerCase();
      const owner = byWord.get(key);
      if (owner && owner !== e.id && w !== e.id) {
        warnings.push(`${where}: "${w}" names both "${owner}" and "${e.id}"; the first one wins`);
      } else if (!owner) byWord.set(key, e.id);
    }
  }
  for (const e of entries) {
    for (const ref of pendingSee.get(e.id) ?? []) {
      const target = byWord.get(ref.toLowerCase()) ?? byWord.get(termId(ref));
      if (!target) warnings.push(`${where}: "${e.name}" says see "${ref}", which is not a term`);
      else if (target !== e.id && !e.see.includes(target)) e.see.push(target);
    }
  }
  return { entries, warnings };
}
