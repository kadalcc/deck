/**
 * The catalog's types: a machine-readable description of everything a deck can say. Pure data —
 * no React, no Node — so a language server, an MCP server or a Worker can import it.
 */

/** A JSON value type, as JSON Schema names them. */
export type ValueType = "string" | "number" | "boolean" | "array" | "object" | "null";

/** One accepted form of a value. `enum` narrows it to listed values. */
export interface TypeVariant {
  type: ValueType;
  enum?: Array<string | number | boolean>;
  /** For `object`: its known fields. */
  properties?: Record<string, ValueShape>;
}

/** What a prop or option accepts: the TypeScript spelling plus the JSON forms it maps to. */
export interface ValueShape {
  /** The TypeScript type as written in the engine (for people). */
  text: string;
  /** The JSON forms it accepts; empty means "anything" (JSX, functions, React nodes). */
  variants: TypeVariant[];
  /** Known good values for an open string (theme names, effect classes); not exhaustive. */
  suggest?: string[];
}

export interface PropInfo {
  name: string;
  type: ValueShape;
  required: boolean;
  /** The default as source text (`"fade-in"`, `3`), when the engine has one. */
  default?: string;
  description?: string;
}

/** What the generator reads out of the engine's source (catalog/generated.ts). */
export interface GeneratedComponent {
  name: string;
  file: string;
  /** Set when this export is another name for a component (`Math` is `Tex`). */
  aliasOf?: string;
  description?: string;
  props: PropInfo[];
}

export interface GeneratedBackground {
  name: string;
  /** The component function's name in the engine. */
  component: string;
  file: string;
  description?: string;
  props: PropInfo[];
}

export interface GeneratedField {
  name: string;
  type: ValueShape;
  description?: string;
}

export interface GeneratedData {
  components: GeneratedComponent[];
  backgrounds: GeneratedBackground[];
  layouts: string[];
  clickEffects: string[];
  transitions: string[];
  transitionSpeeds: string[];
  /** Every field of `DeckConfig` (core/model.ts). */
  deckConfig: GeneratedField[];
  /** Every frontmatter key the engine reads somewhere (`fm.x`, `frontmatter.x`). */
  frontmatterReads: string[];
}

export type ComponentCategory =
  | "steps"
  | "layout"
  | "content"
  | "code"
  | "diagrams"
  | "media"
  | "motion"
  | "terms"
  | "bling"
  | "live"
  | "background"
  | "markdown";

export interface ComponentInfo {
  name: string;
  category: ComponentCategory;
  summary: string;
  /** A short MDX example that compiles. */
  example: string;
  /** Another spelling of a component (`Fragment` for `Click`, `Math` for `Tex`). */
  aliasOf?: string;
  /** True for the Markdown element mappings (`ul`, `img`…): never written as a tag by hand. */
  mapping?: boolean;
  /** Needs a live room (publish the deck, or point `live.api` at a host). */
  live?: boolean;
  props: PropInfo[];
  /** Engine file, for contributors. */
  source: string;
}

export interface LayoutInfo {
  name: string;
  summary: string;
  /** Frontmatter keys the layout reads besides `layout`. */
  keys: string[];
  /** Named slots (`::right::`). */
  slots: string[];
  example: string;
}

export type BackgroundFamily = "ambient" | "quiet" | "map" | "sign" | "plain";

export interface BackgroundInfo {
  name: string;
  family: BackgroundFamily;
  summary: string;
  /** Other registered names for the same background. */
  aliases: string[];
  props: PropInfo[];
  example: string;
  /** Engine file, for contributors (absent for the frontmatter-only forms). */
  source?: string;
}

export interface ThemeInfo {
  name: string;
  summary: string;
  /** The stylesheet a deck's main.tsx imports for it. */
  css: string;
  /** How it looks out of the box. */
  scheme: "light" | "dark";
}

export interface NamedInfo {
  name: string;
  summary: string;
}

export interface FrontmatterKey {
  name: string;
  type: ValueShape;
  description: string;
  default?: unknown;
  /** Where it may appear: deck = headmatter only; slide = any slide (and the first via headmatter). */
  scope: "deck" | "slide";
  /** Other spellings that mean the same thing (reveal.js / Slidev names). */
  aliases?: string[];
  example?: string;
}

export interface CodeMetaOption {
  syntax: string;
  summary: string;
  example: string;
}

export interface KeyInfo {
  keys: string[];
  label: string;
  action: string;
  description: string;
}

export interface RouteInfo {
  path: string;
  summary: string;
}

export interface QueryParamInfo {
  param: string;
  summary: string;
}

export interface LiveFeature {
  name: string;
  summary: string;
  components: string[];
}

export interface CliCommand {
  name: string;
  usage: string;
  summary: string;
  json: boolean;
}

export interface Catalog {
  /** The engine version this catalog describes. */
  version: string;
  layouts: LayoutInfo[];
  components: ComponentInfo[];
  backgrounds: BackgroundInfo[];
  themes: ThemeInfo[];
  transitions: NamedInfo[];
  transitionSpeeds: NamedInfo[];
  clickEffects: NamedInfo[];
  clickAt: NamedInfo[];
  codeMeta: CodeMetaOption[];
  deckFrontmatter: FrontmatterKey[];
  slideFrontmatter: FrontmatterKey[];
  keys: KeyInfo[];
  routes: RouteInfo[];
  queryParams: QueryParamInfo[];
  live: LiveFeature[];
  cli: CliCommand[];
  exitCodes: Array<{ code: number; meaning: string }>;
}

export type CatalogSection = Exclude<keyof Catalog, "version">;
