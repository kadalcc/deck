import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { checkValue } from "../authoring/validate.ts";
import { DEFAULT_CONFIG } from "../core/model.ts";
import { KEY_BINDINGS } from "../core/keyboard.ts";
import { COMPONENT_META } from "./components.ts";
import { GENERATED } from "./generated.ts";
import {
  backgroundNames,
  builtinComponentNames,
  catalog,
  catalogMarkdown,
  findEntry,
  frontmatterSchema,
  resolveSection,
  searchCatalog,
} from "./index.ts";
import { BACKGROUND_META, LAYOUT_META } from "./reference.ts";

/**
 * The catalog may never drift from the engine: every registry is compared with it both ways, the
 * generated files must be current, and every example in it must compile as MDX using only names
 * that exist.
 */

describe("catalog ↔ registries", () => {
  test("every component a slide can use is catalogued, and nothing else", async () => {
    const builtins = await import("../components/index.ts");
    const exported = Object.keys(builtins).filter(
      (k) => typeof (builtins as Record<string, unknown>)[k] === "function",
    );
    expect([...builtinComponentNames()].sort()).toEqual(exported.sort());
    expect(Object.keys(COMPONENT_META).sort()).toEqual(exported.sort());
  });

  test("every layout is catalogued, and nothing else", async () => {
    const { LAYOUTS } = await import("../react/layouts.tsx");
    expect(catalog.layouts.map((l) => l.name).sort()).toEqual(Object.keys(LAYOUTS).sort());
    expect(Object.keys(LAYOUT_META).sort()).toEqual(Object.keys(LAYOUTS).sort());
  });

  test("every registered background is catalogued (aliases included), and each name resolves", async () => {
    await import("../backgrounds/index.tsx");
    const { backgroundComponent } = await import("../react/Backgrounds.tsx");
    const registered = GENERATED.backgrounds.map((b) => b.name).sort();
    expect([...backgroundNames()].sort()).toEqual(registered);
    for (const name of backgroundNames()) expect(backgroundComponent(name)).not.toBeNull();
    // An alias shares its component with the catalogued name.
    for (const [name, meta] of Object.entries(BACKGROUND_META))
      for (const alias of meta.aliases ?? [])
        expect(backgroundComponent(alias)).toBe(backgroundComponent(name));
  });

  test("deck frontmatter covers every DeckConfig field, with the engine's defaults", () => {
    const keys = catalog.deckFrontmatter.filter((k) => k.name in DEFAULT_CONFIG).map((k) => k.name);
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
    for (const k of catalog.deckFrontmatter) {
      expect(k.description.length).toBeGreaterThan(0);
      if (k.default !== undefined && k.default !== null)
        expect(checkValue(k.type, k.default), `${k.name} default`).toBeNull();
    }
  });

  test("every frontmatter key the engine reads is catalogued", () => {
    const known = new Set(
      [...catalog.slideFrontmatter, ...catalog.deckFrontmatter].map((k) => k.name),
    );
    expect(GENERATED.frontmatterReads.filter((k) => !known.has(k))).toEqual([]);
  });

  test("themes are the defaults' themes, and each has its stylesheet", () => {
    expect(catalog.themes.map((t) => t.name)).toEqual(DEFAULT_CONFIG.themes);
    for (const t of catalog.themes)
      expect(existsSync(join(import.meta.dir, "..", "themes", `${t.name}.css`))).toBe(true);
  });

  test("keys mirror KEY_BINDINGS", () => {
    expect(catalog.keys.map((k) => k.action)).toEqual(KEY_BINDINGS.map((k) => k.action));
  });

  test("every section entry has a summary", () => {
    for (const c of catalog.components) expect(c.summary, c.name).toBeTruthy();
    for (const l of catalog.layouts) expect(l.summary, l.name).toBeTruthy();
    for (const b of catalog.backgrounds) expect(b.summary, b.name).toBeTruthy();
    for (const t of catalog.transitions) expect(t.summary, t.name).toBeTruthy();
    for (const e of catalog.clickEffects) expect(e.summary, e.name).toBeTruthy();
  });
});

describe("generated files", () => {
  test("generated.ts, the schema, REFERENCE.md and the skill references are current (bun run catalog)", async () => {
    const { stale } = await import("../../tools/catalog.ts");
    expect(await stale()).toEqual([]);
  }, 60_000);
});

describe("examples", () => {
  test("every component and layout example compiles and names only known components", async () => {
    const { createProcessor } = await import("@mdx-js/mdx");
    const { default: remarkGfm } = await import("remark-gfm");
    const { default: remarkMath } = await import("remark-math");
    const { splitDeck } = await import("../compiler/split.ts");
    const names = builtinComponentNames();
    const examples = [
      ...catalog.components.map((c) => [`<${c.name}>`, c.example] as const),
      ...catalog.layouts.map((l) => [`layout ${l.name}`, l.example] as const),
      ...catalog.codeMeta.map((c) => [c.syntax, c.example] as const),
    ];
    for (const [label, example] of examples) {
      const { slides } = splitDeck(example, { file: label });
      for (const s of slides) {
        const tags: string[] = [];
        const collect = () => (tree: { children?: unknown[] }) => {
          const walk = (n: { type?: string; name?: string | null; children?: unknown[] }) => {
            if ((n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") && n.name)
              tags.push(n.name);
            (n.children as (typeof n)[] | undefined)?.forEach(walk);
          };
          walk(tree);
        };
        const p = createProcessor({
          format: "mdx",
          remarkPlugins: [remarkGfm, remarkMath, collect],
        });
        await expect(p.process(s.content), label).resolves.toBeTruthy();
        for (const t of tags.filter((t) => /^[A-Z]/.test(t)))
          expect(names.has(t), `${label} uses <${t}>`).toBe(true);
      }
    }
  }, 30_000);
});

describe("lookups", () => {
  test("sections resolve by name and alias", () => {
    expect(resolveSection("components")).toBe("components");
    expect(resolveSection("slide")).toBe("slideFrontmatter");
    expect(resolveSection("Clicks")).toBe("clickEffects");
    expect(resolveSection("nope")).toBeNull();
  });

  test("entries resolve by name or alias", () => {
    expect((findEntry("components", "poll") as { name: string }).name).toBe("Poll");
    expect((findEntry("backgrounds", "voronoi") as { name: string }).name).toBe("thiessen");
  });

  test("search ranks names above prose", () => {
    const hits = searchCatalog("poll");
    expect(hits[0]!.name).toBe("Poll");
    expect(searchCatalog("zzzz-nothing")).toEqual([]);
  });

  test("the schema and the Markdown carry every key and component", () => {
    const schema = frontmatterSchema(catalog) as {
      $defs: { slide: { properties: object }; headmatter: { properties: object } };
    };
    for (const k of catalog.slideFrontmatter)
      expect(schema.$defs.slide.properties).toHaveProperty(k.name);
    for (const k of catalog.deckFrontmatter)
      expect(schema.$defs.headmatter.properties).toHaveProperty(k.name);
    const md = catalogMarkdown(catalog);
    for (const c of catalog.components.filter((c) => !c.mapping || /^[A-Z]/.test(c.name)))
      expect(md).toContain(`<${c.name}>`);
  });
});

describe("releases", () => {
  test("generated files do not depend on the version, so a version bump never makes them stale", () => {
    const bumped = { ...catalog, version: "99.0.0" };
    expect(frontmatterSchema(bumped)).toEqual(frontmatterSchema(catalog));
    expect(catalogMarkdown(bumped)).toBe(catalogMarkdown(catalog));
  });
});
