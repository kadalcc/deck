import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { type IconData, type IconifySet, iconFromSet, iconPackage, parseIconName } from "./data.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ICON SETS FROM THE DECK'S node_modules  (Node only: the Vite plugin, `kadal-deck check`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A set is looked for, from the deck's folder up, as `@iconify-json/<set>/icons.json` (one small
 * package per set — what Slidev's docs tell people to install) and then in `@iconify/json`'s
 * `json/<set>.json` (every set in one big package). Engine-installed copies count too, so a
 * workspace that hoisted them works. Each set file is parsed once per process and kept.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const sets = new Map<string, IconifySet | null>();

/** The set file for `prefix`, or null when neither package is installed where `root` can see. */
export function loadIconSet(prefix: string, root: string): IconifySet | null {
  const key = `${root}\0${prefix}`;
  if (sets.has(key)) return sets.get(key)!;
  let found: IconifySet | null = null;
  const requires = [createRequire(join(root, "package.json")), createRequire(import.meta.url)];
  outer: for (const req of requires)
    for (const spec of [`${iconPackage(prefix)}/icons.json`, `@iconify/json/json/${prefix}.json`]) {
      let file: string;
      try {
        file = req.resolve(spec);
      } catch {
        continue;
      }
      if (!existsSync(file)) continue;
      try {
        found = JSON.parse(readFileSync(file, "utf8")) as IconifySet;
        break outer;
      } catch {
        /* a broken file is as good as none */
      }
    }
  sets.set(key, found);
  return found;
}

export interface IconBuild {
  /** Found: `set:icon` → drawing, ready to register in the slide's module. */
  icons: Record<string, IconData>;
  /** Not found, each with why — the set is not installed, or has no such icon. */
  missing: Array<{ name: string; reason: string }>;
}

/** Resolve the `set:icon` names a slide uses against the sets installed for the deck at `root`. */
export function resolveIcons(names: Iterable<string>, root: string): IconBuild {
  const out: IconBuild = { icons: {}, missing: [] };
  for (const full of new Set(names)) {
    const parsed = parseIconName(full);
    if (!parsed) continue;
    const set = loadIconSet(parsed.prefix, root);
    if (!set) {
      out.missing.push({
        name: full,
        reason: `${iconPackage(parsed.prefix)} is not installed (bun add -d ${iconPackage(parsed.prefix)} to bundle it); the icon is fetched from the Iconify API when its slide is shown`,
      });
      continue;
    }
    const icon = iconFromSet(set, parsed.name);
    if (icon) out.icons[full] = icon;
    else
      out.missing.push({
        name: full,
        reason: `the set "${parsed.prefix}" has no icon "${parsed.name}"`,
      });
  }
  return out;
}

/**
 * The line a compiled slide module starts with to register its icons — none when it has none.
 * The import is the engine's own entry, which every slide module already loads through its MDX
 * provider, so it costs no extra request.
 */
export function iconRegistration(icons: Record<string, IconData>): string {
  if (!Object.keys(icons).length) return "";
  return `import { registerIcons as __kadalRegisterIcons } from "@kadal/deck";\n__kadalRegisterIcons(${JSON.stringify(icons)});\n`;
}
