/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CATALOG  —  @kadal/deck/catalog
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything a deck can say, as data: layouts, built-in components and their props, backgrounds,
 * themes, transitions, click effects, code-fence options, deck and slide frontmatter, keys,
 * routes, the live room, the CLI. Half of it is read out of the engine's source by
 * tools/catalog-extract.ts (generated.ts), half is prose (components.ts, reference.ts); the test
 * suite fails when the two disagree with the registries. Pure data and string functions — no
 * React, no Node — so an MCP server, an editor or a Worker can import it.
 *
 *   import { catalog, searchCatalog, catalogMarkdown, frontmatterSchema } from "@kadal/deck/catalog";
 * ─────────────────────────────────────────────────────────────────────────────
 */
import pkg from "../../package.json" with { type: "json" };
import { DEFAULT_CONFIG } from "../core/model.ts";
import { KEY_BINDINGS } from "../core/keyboard.ts";
import { COMPONENT_META } from "./components.ts";
import { GENERATED } from "./generated.ts";
import {
  BACKGROUND_META,
  CLI,
  CLICK_AT,
  CLICK_EFFECT_META,
  CODE_META,
  DECK_KEY_DOCS,
  EXIT_CODES,
  EXTRA_DECK_KEYS,
  LAYOUT_META,
  LIVE,
  PLAIN_BACKGROUNDS,
  QUERY_PARAMS,
  ROUTES,
  SLIDE_KEYS,
  SUGGEST,
  THEMES,
  TRANSITION_META,
  TRANSITION_SPEED_META,
} from "./reference.ts";
import type {
  BackgroundInfo,
  Catalog,
  CatalogSection,
  ComponentInfo,
  FrontmatterKey,
  PropInfo,
  ValueShape,
} from "./types.ts";

export type * from "./types.ts";
export { catalogMarkdown, sectionMarkdown } from "./markdown.ts";
export { frontmatterSchema, shapeSchema } from "./schema.ts";
export { THEME_PACKAGES } from "./reference.ts";

function components(): ComponentInfo[] {
  const byName = new Map(GENERATED.components.map((c) => [c.name, c]));
  return GENERATED.components.flatMap((g) => {
    const meta = COMPONENT_META[g.name];
    if (!meta) return [];
    let props: PropInfo[] = g.props;
    if (meta.propsFrom) {
      const from = byName.get(meta.propsFrom.name)?.props ?? [];
      props = from.filter((p) => !meta.propsFrom!.omit?.includes(p.name));
    }
    const fromMeta = {
      ...(meta.propsFrom ? COMPONENT_META[meta.propsFrom.name]?.props : {}),
      ...meta.props,
    };
    props = props.map((p) =>
      p.description || !fromMeta[p.name] ? p : { ...p, description: fromMeta[p.name] },
    );
    const info: ComponentInfo = {
      name: g.name,
      category: meta.category,
      summary: meta.summary,
      example: meta.example,
      props,
      source: g.file,
    };
    if (g.aliasOf) info.aliasOf = g.aliasOf;
    else if (g.name === "Fragment") info.aliasOf = "Click";
    if (meta.mapping) info.mapping = true;
    if (g.openProps || (meta.propsFrom && byName.get(meta.propsFrom.name)?.openProps))
      info.openProps = true;
    if (meta.live) info.live = true;
    return [info];
  });
}

function backgrounds(): BackgroundInfo[] {
  const out: BackgroundInfo[] = [];
  for (const [name, meta] of Object.entries(BACKGROUND_META)) {
    const g = GENERATED.backgrounds.find((b) => b.name === name);
    if (!g) continue;
    // One short, numeric or quoted prop makes the `{ component, … }` form concrete.
    const shown = g.props.find((p) => p.default !== undefined && p.default.length <= 12);
    const extra = shown ? `, ${shown.name}: ${shown.default}` : "";
    out.push({
      name,
      family: meta.family,
      summary: meta.summary,
      aliases: meta.aliases ?? [],
      props: g.props,
      example: extra ? `background: { component: ${name}${extra} }` : `background: ${name}`,
      source: g.file,
    });
  }
  for (const p of PLAIN_BACKGROUNDS)
    out.push({
      name: p.name,
      family: "plain",
      summary: p.summary,
      aliases: [],
      props: [],
      example: p.example,
    });
  return out;
}

function withSuggest(shape: ValueShape, suggest: string[]): ValueShape {
  return { ...shape, suggest };
}

function deckFrontmatter(): FrontmatterKey[] {
  const defaults = DEFAULT_CONFIG as unknown as Record<string, unknown>;
  const keys: FrontmatterKey[] = GENERATED.deckConfig.map((f) => {
    let type = f.type;
    if (f.name === "glossary")
      type = {
        text: "GlossaryOptions | string | false",
        variants: [...f.type.variants, { type: "string" }, { type: "boolean", enum: [false] }],
      };
    if (f.name === "narration")
      type = {
        text: "NarrationConfig | boolean",
        variants: [...f.type.variants, { type: "boolean" }],
      };
    if (f.name === "theme") type = withSuggest(type, SUGGEST.theme);
    if (f.name === "transition" || f.name === "backgroundTransition")
      type = withSuggest(type, GENERATED.transitions);
    if (f.name === "keyboard")
      type = {
        text: "boolean | Record<string, KeyAction | null>",
        variants: [{ type: "boolean" }, { type: "object" }],
      };
    return {
      name: f.name,
      type,
      description: f.description ?? DECK_KEY_DOCS[f.name] ?? "",
      default: defaults[f.name],
      scope: "deck" as const,
    };
  });
  return [...keys, ...EXTRA_DECK_KEYS];
}

function slideFrontmatter(): FrontmatterKey[] {
  return SLIDE_KEYS.map((k) => {
    let type: ValueShape = k.type;
    if (k.name === "layout") type = withSuggest(type, SUGGEST.layout);
    if (k.name === "transition" || k.name === "backgroundTransition")
      type = withSuggest(type, GENERATED.transitions);
    const key: FrontmatterKey = { name: k.name, type, description: k.description, scope: "slide" };
    if ("aliases" in k && k.aliases) key.aliases = k.aliases;
    if ("example" in k && k.example) key.example = k.example;
    if (k.name === "preload") key.default = true;
    return key;
  });
}

export const catalog: Catalog = {
  version: (pkg as { version: string }).version,
  layouts: GENERATED.layouts.map((name) => ({ name, ...LAYOUT_META[name]! })),
  components: components(),
  backgrounds: backgrounds(),
  themes: THEMES,
  transitions: GENERATED.transitions.map((name) => ({
    name,
    summary: TRANSITION_META[name] ?? "",
  })),
  transitionSpeeds: GENERATED.transitionSpeeds.map((name) => ({
    name,
    summary: TRANSITION_SPEED_META[name] ?? "",
  })),
  clickEffects: GENERATED.clickEffects.map((name) => ({
    name,
    summary: CLICK_EFFECT_META[name] ?? "",
  })),
  clickAt: CLICK_AT,
  codeMeta: CODE_META,
  deckFrontmatter: deckFrontmatter(),
  slideFrontmatter: slideFrontmatter(),
  keys: KEY_BINDINGS.map((k) => ({
    keys: k.keys,
    label: k.label,
    action: k.action,
    description: k.description,
  })),
  routes: ROUTES,
  queryParams: QUERY_PARAMS,
  live: LIVE,
  cli: CLI,
  exitCodes: EXIT_CODES,
};

export const CATALOG_SECTIONS: CatalogSection[] = [
  "components",
  "layouts",
  "backgrounds",
  "themes",
  "transitions",
  "transitionSpeeds",
  "clickEffects",
  "clickAt",
  "codeMeta",
  "deckFrontmatter",
  "slideFrontmatter",
  "keys",
  "routes",
  "queryParams",
  "live",
  "cli",
  "exitCodes",
];

/** Friendly names an agent or a person may type for a section. */
const SECTION_ALIASES: Record<string, CatalogSection> = {
  component: "components",
  layout: "layouts",
  background: "backgrounds",
  bg: "backgrounds",
  theme: "themes",
  transition: "transitions",
  speeds: "transitionSpeeds",
  clicks: "clickEffects",
  effects: "clickEffects",
  "click-effects": "clickEffects",
  at: "clickAt",
  code: "codeMeta",
  "code-meta": "codeMeta",
  deck: "deckFrontmatter",
  headmatter: "deckFrontmatter",
  config: "deckFrontmatter",
  slide: "slideFrontmatter",
  frontmatter: "slideFrontmatter",
  keyboard: "keys",
  shortcuts: "keys",
  route: "routes",
  query: "queryParams",
  params: "queryParams",
  room: "live",
  "live-room": "live",
  commands: "cli",
  exit: "exitCodes",
  "exit-codes": "exitCodes",
};

/** A section by its name or a friendly alias (case-insensitive); null when there is none. */
export function resolveSection(name: string): CatalogSection | null {
  const n = name.trim();
  const exact = CATALOG_SECTIONS.find((s) => s.toLowerCase() === n.toLowerCase());
  return exact ?? SECTION_ALIASES[n.toLowerCase()] ?? null;
}

export interface CatalogHit {
  section: CatalogSection;
  name: string;
  summary: string;
  score: number;
  item: unknown;
}

const nameOf = (item: unknown): string => {
  const o = item as Record<string, unknown>;
  return String(o.name ?? o.syntax ?? o.path ?? o.param ?? o.label ?? o.code ?? "");
};
const summaryOf = (item: unknown): string => {
  const o = item as Record<string, unknown>;
  return String(o.summary ?? o.description ?? o.meaning ?? "");
};

/**
 * Find catalog entries by words: names score highest, then summaries, props and examples. Every
 * word must appear somewhere in an entry for it to count.
 */
export function searchCatalog(query: string, limit = 20, source: Catalog = catalog): CatalogHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: CatalogHit[] = [];
  for (const section of CATALOG_SECTIONS) {
    for (const item of source[section] as unknown[]) {
      const name = nameOf(item).toLowerCase();
      const summary = summaryOf(item).toLowerCase();
      const rest = JSON.stringify(item).toLowerCase();
      let score = 0;
      let all = true;
      for (const w of words) {
        if (name === w) score += 10;
        else if (name.includes(w)) score += 5;
        else if (summary.includes(w)) score += 2;
        else if (rest.includes(w)) score += 1;
        else all = false;
      }
      if (all && score)
        hits.push({ section, name: nameOf(item), summary: summaryOf(item), score, item });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** One entry by section and name (or alias): `findEntry("components", "Poll")`. */
export function findEntry(
  section: CatalogSection,
  name: string,
  source: Catalog = catalog,
): unknown {
  const list = source[section] as unknown[];
  const n = name.toLowerCase();
  return (
    list.find((i) => nameOf(i).toLowerCase() === n) ??
    list.find((i) =>
      ((i as { aliases?: string[] }).aliases ?? []).some((a) => a.toLowerCase() === n),
    ) ??
    null
  );
}

/** Names a slide may use as JSX tags without importing them. */
export function builtinComponentNames(source: Catalog = catalog): Set<string> {
  return new Set(source.components.map((c) => c.name));
}

/** Every background name `background:` accepts as a component, aliases included. */
export function backgroundNames(source: Catalog = catalog): Set<string> {
  return new Set(
    source.backgrounds.filter((b) => b.family !== "plain").flatMap((b) => [b.name, ...b.aliases]),
  );
}
