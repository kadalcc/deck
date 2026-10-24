import { createProcessor } from "@mdx-js/mdx";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { readExtensions } from "../authoring/lint.ts";
import { fencedRanges } from "../compiler/split.ts";
import { moduleKey } from "../runtime/kit-imports.ts";
import { EDITABLE_GLOBS } from "../sync/manifest.ts";
import type { DeckPackageSet } from "./packages.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EDITING KIT: a CLI deck the web builder can render (KADAL_DECK_KIT=1)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The web builder previews a deck by compiling its text in the browser (runtime/compile.ts) in
 * the prebuilt shell, which has the engine's components and nothing else. A deck made with the
 * CLI has more: its own components, styles, config, theme packages and the modules its MDX
 * imports. So a host build (`kadal-deck publish`) builds the deck a second time as its kit:
 *
 *   · the same entry (index.html → src/main.tsx, everything the deck's own Vite config does),
 *   · but `virtual:deck` is `kitManifest(…)` (runtime/shell.tsx) instead of compiled slides:
 *     `<Deck>` then runs the shell — the very code of packages/deck-shell — with the props
 *     main.tsx gave it, and the slides come from the editor's text over the preview protocol;
 *   · with a MODULE MAP of every module the deck's MDX imports, pre-bundled and registered under
 *     its import key (runtime/kit-imports.ts `moduleKey`), so those imports compile in the page;
 *   · with the deck's theme and addon packages registered with the runtime compiler.
 *
 * It lands in `<out>/__kadal/kit/` (relative base, no `public/` copy: the deck's assets are in the
 * main build) with `kit.json`, the catalog the builder and its agent read:
 *   { engine, kitVersion, components, layouts, modules, editable }
 * Kit files are ordinary built files — public like the deck's own JS, no secrets in them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const KIT_VERSION = 1;
export const KIT_DIR = "__kadal/kit";

export const kitMode = () => process.env.KADAL_DECK_KIT === "1";

export interface KitJson {
  engine: string;
  kitVersion: number;
  components: string[];
  layouts: string[];
  modules: string[];
  editable: string[];
}

/** One `import … from "spec"` in a slide, with the file it was written in. */
export interface SlideImport {
  spec: string;
  /** Absolute path of the file the slide is in. */
  file: string;
}

/** The specifiers a slide's MDX imports: MDX's own parser, a line scan when that fails. */
export function importsOf(mdx: string): string[] {
  if (!/^\s*import\s/m.test(mdx)) return [];
  try {
    const tree = createProcessor({ format: "mdx" }).parse(mdx) as {
      children: Array<{
        type: string;
        data?: { estree?: { body: Array<{ type: string; source?: { value: unknown } }> } };
      }>;
    };
    const out: string[] = [];
    for (const node of tree.children)
      if (node.type === "mdxjsEsm")
        for (const st of node.data?.estree?.body ?? [])
          if (st.type === "ImportDeclaration" && typeof st.source?.value === "string")
            out.push(st.source.value);
    return out;
  } catch {
    // Not valid MDX (a slide being edited): take the import lines outside code.
    const code = fencedRanges(mdx);
    const out: string[] = [];
    for (const m of mdx.matchAll(
      /^import\s[^\n]*?from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm,
    ))
      if (!code.some(([a, b]) => m.index! >= a && m.index! < b)) out.push(m[1] ?? m[2]!);
    return out;
  }
}

/** Deck-relative POSIX path of an absolute file. */
const deckPath = (deckDir: string, file: string) => relative(deckDir, file).split(sep).join("/");

/**
 * The kit's `virtual:deck`: registrations for the deck's packages, an import per module, and the
 * `kitManifest` call. `resolved` maps each import key to the id Vite resolved it to.
 */
export function kitModuleCode(o: {
  packages: DeckPackageSet;
  packagesCode: { imports: string; value: string };
  resolved: Map<string, string>;
  monaco: string | null;
  codeRunners: string | null;
  engine: string;
}): string {
  const spec = (f: string) => JSON.stringify(f.replace(/\\/g, "/"));
  const lines = [
    `import { kitManifest, registerAddon, registerTheme } from "@kadal/deck/runtime";`,
    o.packagesCode.imports,
  ];
  // The deck's themes and addons, for the runtime compiler to resolve the headmatter against.
  const seen = new Set<string>();
  for (const p of [...o.packages.themes, ...(o.packages.more ?? []), ...o.packages.addons]) {
    if (p.builtin || seen.has(`${p.kind}:${p.name}`)) continue;
    seen.add(`${p.kind}:${p.name}`);
    const parts = [p.css, p.module]
      .filter((f): f is string => !!f)
      .map((f) => `import(${spec(f)})`);
    const load = p.module
      ? `() => Promise.all([${parts.join(", ")}]).then((m) => m[m.length - 1])`
      : `() => ${parts[0] ?? "Promise.resolve()"}.then(() => null)`;
    lines.push(
      `${p.kind === "theme" ? "registerTheme" : "registerAddon"}({ name: ${JSON.stringify(p.name)}, package: ${JSON.stringify(p.package)}, aliases: ${JSON.stringify(p.spec && p.spec !== p.name ? [p.spec] : [])}, meta: ${JSON.stringify(p.meta)}, load: ${load} });`,
    );
  }
  const entries: string[] = [];
  [...o.resolved].forEach(([key, id], i) => {
    lines.push(`import * as __kadal_mod_${i} from ${spec(id)};`);
    entries.push(`${JSON.stringify(key)}: __kadal_mod_${i}`);
  });
  lines.push(`const __kadal_packages = ${o.packagesCode.value};`);
  lines.push(
    `export const kit = { kitVersion: ${KIT_VERSION}, engine: ${JSON.stringify(o.engine)} };`,
  );
  lines.push(`export default kitManifest({
  modules: { ${entries.join(", ")} },
  layers: __kadal_packages.layers,
  routes: __kadal_packages.routes,
  monaco: ${o.monaco ?? "null"},
  codeRunners: ${o.codeRunners ? `() => import(${spec(o.codeRunners)})` : "null"},
  kitVersion: ${KIT_VERSION},
  engine: ${JSON.stringify(o.engine)},
});`);
  return `${lines.join("\n")}\n`;
}

/** kit.json: what the builder and its agent may know of the deck's own code. */
export function kitJson(o: {
  deckDir: string;
  modules: string[];
  packages: DeckPackageSet;
  engine: string;
}): KitJson {
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : null);
  const componentsFile = join(o.deckDir, "src", "components.tsx");
  const ext = readExtensions(read(componentsFile), [], null);
  const pkComponents = o.packages.addons.flatMap((a) =>
    "components" in a.meta ? (a.meta.components ?? []) : [],
  );
  const pkLayouts = [o.packages.theme, ...o.packages.addons].flatMap((p) => p.meta.layouts ?? []);
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return {
    engine: o.engine,
    kitVersion: KIT_VERSION,
    components: uniq([...ext.components, ...pkComponents]),
    layouts: uniq([...ext.layouts, ...pkLayouts]),
    modules: uniq(o.modules),
    editable: [...EDITABLE_GLOBS],
  };
}

export function writeKitJson(outDir: string, kit: KitJson): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "kit.json"), `${JSON.stringify(kit, null, 2)}\n`);
}

/** The import keys of a deck's slides, and where each was written. */
export function slideImports(
  slides: Array<{ content: string; notes: string | null; source: { file: string } }>,
  deckDir: string,
): Map<string, SlideImport> {
  const out = new Map<string, SlideImport>();
  for (const s of slides)
    for (const text of [s.content, s.notes ?? ""])
      for (const spec of importsOf(text)) {
        const key = moduleKey(spec, deckPath(deckDir, s.source.file));
        if (!out.has(key)) out.set(key, { spec, file: s.source.file });
      }
  return out;
}
