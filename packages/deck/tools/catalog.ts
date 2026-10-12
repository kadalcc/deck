#!/usr/bin/env bun
/**
 * Regenerates every file derived from the engine's source and the catalog:
 *
 *   src/catalog/generated.ts                          (tools/catalog-extract.ts)
 *   schema/frontmatter.json                           JSON Schema for deck + slide frontmatter
 *   REFERENCE.md                                      the whole catalog as Markdown
 *   ../../skills/kadal-deck/references/components.md  the agent skill's component reference
 *   ../../skills/kadal-deck/references/layouts-and-backgrounds.md
 *
 *   bun run catalog            write them
 *   bun run catalog --check    exit 1 when any is stale (the test suite runs this too)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { generatedSource } from "./catalog-extract.ts";

const pkg = resolve(import.meta.dirname, "..");
const repo = resolve(pkg, "..", "..");
const skill = join(repo, "skills", "kadal-deck", "references");

const banner = (what: string) =>
  `<!-- Generated from the engine's catalog by packages/deck/tools/catalog.ts (${what}). Do not edit: run \`bun run catalog\` in packages/deck. -->\n\n`;

/** Files derived from the catalog module as it is on disk now. */
export async function derivedOutputs(): Promise<Map<string, string>> {
  const { catalog, catalogMarkdown, frontmatterSchema } = await import("../src/catalog/index.ts");
  const out = new Map<string, string>();
  out.set(
    join(pkg, "schema", "frontmatter.json"),
    `${JSON.stringify(frontmatterSchema(catalog), null, 2)}\n`,
  );
  out.set(join(pkg, "REFERENCE.md"), banner("REFERENCE.md") + catalogMarkdown(catalog));
  out.set(
    join(skill, "components.md"),
    banner("components") +
      catalogMarkdown(
        catalog,
        ["components", "clickEffects", "clickAt", "codeMeta"],
        "Components, clicks and code",
      ),
  );
  out.set(
    join(skill, "layouts-and-backgrounds.md"),
    banner("layouts and backgrounds") +
      catalogMarkdown(
        catalog,
        [
          "layouts",
          "backgrounds",
          "themes",
          "transitions",
          "transitionSpeeds",
          "slideFrontmatter",
          "deckFrontmatter",
        ],
        "Layouts, backgrounds, themes and frontmatter",
      ),
  );
  return out;
}

export async function stale(): Promise<string[]> {
  const bad: string[] = [];
  const genPath = join(pkg, "src", "catalog", "generated.ts");
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  if (read(genPath) !== generatedSource()) return [genPath];
  for (const [path, content] of await derivedOutputs()) if (read(path) !== content) bad.push(path);
  return bad;
}

if (import.meta.main && process.argv.includes("--check")) {
  const bad = await stale();
  for (const p of bad) console.error(`stale: ${relative(repo, p)}`);
  if (bad.length) {
    console.error("Run `bun run catalog` in packages/deck.");
    process.exit(1);
  }
  console.log("catalog outputs are up to date");
} else if (import.meta.main && process.argv.includes("--derived")) {
  for (const [path, content] of await derivedOutputs()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`wrote ${relative(repo, path)}`);
  }
} else if (import.meta.main) {
  const genPath = join(pkg, "src", "catalog", "generated.ts");
  writeFileSync(genPath, generatedSource());
  console.log(`wrote ${relative(repo, genPath)}`);
  // A fresh process imports the catalog with the generated data just written.
  const proc = Bun.spawnSync([process.execPath, import.meta.filename, "--derived"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (proc.exitCode) process.exit(proc.exitCode);
}
