import type { Catalog, FrontmatterKey, TypeVariant, ValueShape } from "./types.ts";

type Schema = Record<string, unknown>;

function variantSchema(v: TypeVariant): Schema {
  const s: Schema = { type: v.type };
  if (v.enum) s.enum = v.enum;
  if (v.properties) {
    s.properties = Object.fromEntries(
      Object.entries(v.properties).map(([k, shape]) => [k, shapeSchema(shape)]),
    );
  }
  return s;
}

/** A JSON Schema for one value shape (an empty schema when it takes anything). */
export function shapeSchema(shape: ValueShape): Schema {
  const out: Schema =
    shape.variants.length === 0
      ? {}
      : shape.variants.length === 1
        ? variantSchema(shape.variants[0]!)
        : { anyOf: shape.variants.map(variantSchema) };
  if (shape.suggest?.length) out.examples = shape.suggest;
  return out;
}

function keySchema(k: FrontmatterKey): Schema {
  const s: Schema = { ...shapeSchema(k.type), description: k.description };
  if (k.default !== undefined && k.default !== null && typeof k.default !== "object")
    s.default = k.default;
  return s;
}

/**
 * JSON Schema (2020-12) for deck frontmatter. `$defs.slide` is any slide's frontmatter;
 * `$defs.headmatter` is the block at the top of deck.mdx, which configures the deck AND the first
 * slide. Unknown keys are allowed (a custom layout may read its own), so editors flag only types.
 */
export function frontmatterSchema(catalog: Catalog): Schema {
  const slide = Object.fromEntries(catalog.slideFrontmatter.map((k) => [k.name, keySchema(k)]));
  const deck = Object.fromEntries(catalog.deckFrontmatter.map((k) => [k.name, keySchema(k)]));
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    // Unversioned, so the committed schema is the same file before and after a version bump.
    $id: "https://unpkg.com/@kadal/deck/schema/frontmatter.json",
    title: "Kadal Deck frontmatter",
    description:
      "Frontmatter for deck.mdx. Validate the top block (headmatter) against #/$defs/headmatter and every other slide's block against #/$defs/slide.",
    $ref: "#/$defs/slide",
    $defs: {
      slide: { type: "object", properties: slide, additionalProperties: true },
      headmatter: {
        type: "object",
        properties: { ...slide, ...deck },
        additionalProperties: true,
      },
    },
  };
}
