import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeck } from "../authoring/source.ts";
import { updateHeadmatter } from "../authoring/edit.ts";
import { openProject, saveEdit } from "../cli/project.ts";
import { FALLBACK_THEME, type ThemeMeta, isPathSpec, specList } from "./contract.ts";
import { resolvePackage } from "./resolve.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck theme eject [--dir ./theme]`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Copies the deck's theme into the deck — its stylesheet, its layouts, its package.json with the
 * `kadal.theme` metadata — and points the headmatter at the copy (`theme: ./theme`) through the
 * authoring layer's edit, so every other byte of deck.mdx stays as it was. The copy keeps the
 * theme's name, so it is the same `.theme-<name>` and looks exactly as before; from then on it is
 * the deck's to change.
 *
 * A built-in theme (minimal, rla, stack) has no package to copy, so eject writes one in the same
 * shape: package.json, the theme's style.css, an index.tsx with an empty layouts map to fill.
 * Because the copy shares the built-in's class, the built-in's own stylesheet must stop loading:
 * eject removes main.tsx's `import "@kadal/deck/themes/<name>.css"` line, and says so.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface EjectOptions {
  /** The folder to write, relative to the deck. Default `theme`. */
  dir?: string;
  /** Eject this theme rather than the headmatter's. */
  theme?: string;
  /** Write into a folder that is not empty. */
  force?: boolean;
}

export interface EjectResult {
  /** The theme's name (its CSS class). */
  name: string;
  /** As the deck named it before. */
  from: string;
  /** The headmatter's new `theme:`, e.g. `./theme`. */
  to: string;
  dir: string;
  builtin: boolean;
  files: string[];
  /** main.tsx lines removed (a built-in theme's own stylesheet import). */
  removedImports: string[];
  /** Packages the ejected module imports that the deck must have installed. */
  dependencies: string[];
}

export class EjectError extends Error {
  override name = "EjectError";
}

const list = (dir: string, base = dir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );

/** The engine's copy of a built-in theme's stylesheet (dist/themes, or src/themes from source). */
function builtinCss(name: string): string {
  const file = fileURLToPath(new URL(`../themes/${name}.css`, import.meta.url));
  if (!existsSync(file))
    throw new EjectError(`The built-in theme's stylesheet is missing: ${file}`);
  return readFileSync(file, "utf8");
}

function builtinPackage(name: string, meta: ThemeMeta, version: string): Record<string, string> {
  const title = meta.title ?? name;
  return {
    "package.json": `${JSON.stringify(
      {
        name: `${name}-theme`,
        private: true,
        version: "0.0.0",
        description: `The ${title} theme, ejected from @kadal/deck ${version}.`,
        keywords: ["kadal-theme"],
        type: "module",
        exports: {
          ".": "./index.tsx",
          "./style.css": "./style.css",
          "./package.json": "./package.json",
        },
        kadal: {
          theme: { name, title, colorScheme: meta.colorScheme, layouts: [], components: [] },
        },
      },
      null,
      2,
    )}\n`,
    "style.css": `/* The ${title} theme, ejected from @kadal/deck ${version}: the deck's own copy now. Every rule
   is scoped under .theme-${name}; dark mode is .theme-${name}[data-color-scheme="dark"]. The
   tokens and layout classes are listed in @kadal/deck's THEMES.md. */
${builtinCss(name)}`,
    "index.tsx": `/**
 * The theme's module: layouts, components and layers merge in under the deck's own. Name a
 * built-in layout to replace it for this theme, e.g.
 *
 *   import type { LayoutProps } from "@kadal/deck";
 *   function Cover({ children }: LayoutProps) {
 *     return <div className="deck-layout deck-layout-cover">{children}</div>;
 *   }
 *   export default { layouts: { cover: Cover } };
 *
 * and list new layouts' names in package.json → kadal.theme.layouts, for \`kadal-deck check\`.
 */
export default { layouts: {}, components: {}, layers: {} };
`,
    "README.md": `# ${title} (ejected)

The ${title} theme from @kadal/deck ${version}, copied into this deck by \`kadal-deck theme eject\`.
The headmatter says \`theme: ./${"<dir>"}\`; change style.css and index.tsx freely.
`,
  };
}

/** Bare imports in a module's source (to tell the deck what it now needs installed). */
function bareImports(dir: string): string[] {
  const out = new Set<string>();
  for (const f of list(dir).filter((f) => /\.(m?[jt]sx?)$/.test(f))) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(
      /\bfrom\s+["']([^"'./][^"']*)["']|\bimport\s*\(\s*["']([^"'./][^"']*)["']\s*\)/g,
    )) {
      const spec = m[1] ?? m[2]!;
      const name = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0]!;
      if (!["react", "react-dom", "@kadal/deck"].includes(name)) out.add(name);
    }
  }
  return [...out].sort();
}

export function ejectTheme(deckDir: string, options: EjectOptions = {}): EjectResult {
  const project = openProject(deckDir);
  const deck = readDeck(project.files, { root: project.dir });
  const spec =
    options.theme ??
    (typeof deck.headmatter.theme === "string" && deck.headmatter.theme.trim()
      ? deck.headmatter.theme.trim()
      : FALLBACK_THEME);
  if (spec === "none")
    throw new EjectError(`The deck's theme is "none": there is nothing to eject.`);
  if (!options.theme && isPathSpec(spec))
    throw new EjectError(`The theme is already a folder of the deck's (${spec}): edit it there.`);

  const resolved = resolvePackage("theme", spec, project.dir);
  if (!resolved.builtin && !resolved.root)
    throw new EjectError(
      `The theme "${spec}" is the deck's own CSS (.theme-${spec} in its stylesheets): it is already the deck's to edit.`,
    );

  const dirRel = (options.dir ?? "theme").replace(/[\\/]+$/, "") || "theme";
  const target = resolve(project.dir, dirRel);
  if (existsSync(target) && readdirSync(target).length && !options.force)
    throw new EjectError(
      `${target} is not empty. Choose another --dir, or pass --force to write into it.`,
    );
  if (resolved.root && (target === resolved.root || target.startsWith(resolved.root + sep)))
    throw new EjectError(`${target} is inside the theme package itself.`);
  mkdirSync(target, { recursive: true });

  const version = (
    JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      version: string;
    }
  ).version;
  if (resolved.builtin) {
    for (const [file, text] of Object.entries(
      builtinPackage(resolved.name, resolved.meta as ThemeMeta, version),
    ))
      writeFileSync(
        join(target, file),
        file === "README.md" ? text.replace("<dir>", dirRel) : text,
      );
  } else {
    cpSync(resolved.root!, target, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src.slice(resolved.root!.length)),
    });
    // The copy is the deck's: never published by accident, still carrying its metadata.
    const pkgFile = join(target, "package.json");
    if (existsSync(pkgFile)) {
      const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as Record<string, unknown>;
      pkg.private = true;
      const kadal = (pkg.kadal ?? {}) as Record<string, Record<string, unknown>>;
      kadal.theme = { ...kadal.theme, name: resolved.name };
      pkg.kadal = kadal;
      writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }

  // The headmatter now names the folder; a `themes:` list that named the theme does too.
  const to = `./${dirRel.replace(/\\/g, "/").replace(/^\.\//, "")}`;
  const patch: Record<string, unknown> = { theme: to };
  const listed = specList(deck.headmatter.themes);
  if (deck.headmatter.themes !== undefined && listed.includes(spec))
    patch.themes = listed.map((t) => (t === spec ? to : t));
  saveEdit(updateHeadmatter(project.files, patch), project);

  // A built-in's own stylesheet would style the same class from under the copy: unplug it.
  const removedImports: string[] = [];
  if (resolved.builtin) {
    const main = join(project.dir, "src", "main.tsx");
    if (existsSync(main)) {
      const text = readFileSync(main, "utf8");
      const line = new RegExp(
        `^import\\s+["']@kadal/deck/themes/${resolved.name}\\.css["'];?[ \\t]*\\r?\\n`,
        "m",
      );
      const m = line.exec(text);
      if (m) {
        removedImports.push(m[0].trim());
        writeFileSync(main, text.replace(line, ""));
      }
    }
  }

  return {
    name: resolved.name,
    from: spec,
    to,
    dir: target,
    builtin: resolved.builtin,
    files: list(target).sort(),
    removedImports,
    dependencies: resolved.builtin ? [] : bareImports(target),
  };
}
