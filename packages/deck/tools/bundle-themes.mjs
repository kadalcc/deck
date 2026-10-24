// Copies every first-party theme package (packages/theme-*) into dist/themes/<name>/, so a deck
// that installed nothing but @kadal/deck still offers all sixteen themes in its theme menu
// (theming/resolve.ts `bundledTheme`). Each copy is what npm publishes of the package — its
// stylesheet, module and assets — under a package.json cut down to what the resolver reads; the
// README, LICENSE and changelog stay with the package (the licence is this package's own).
// An installed @kadal/theme-<name> still wins over the copy. Runs after tsdown (which empties
// dist/), from `build` and `prepack`.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = join(root, "..");
const out = join(root, "dist", "themes");
const KEEP_OUT = new Set(["README.md", "LICENSE", "CHANGELOG.md"]);
const FIELDS = ["name", "version", "description", "keywords", "license", "type", "sideEffects", "exports", "kadal"];

const names = [];
for (const dir of readdirSync(packages).filter((d) => d.startsWith("theme-")).sort()) {
  const src = join(packages, dir);
  const file = join(src, "package.json");
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const name = pkg.kadal?.theme?.name;
  if (!name || pkg.private) continue;
  const dest = join(out, name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of pkg.files ?? ["style.css"]) {
    if (KEEP_OUT.has(f)) continue;
    if (!existsSync(join(src, f))) throw new Error(`${pkg.name}: "files" names ${f}, which does not exist`);
    cpSync(join(src, f), join(dest, f), { recursive: true });
  }
  const copy = Object.fromEntries(FIELDS.filter((k) => pkg[k] !== undefined).map((k) => [k, pkg[k]]));
  copy.private = true;
  writeFileSync(join(dest, "package.json"), `${JSON.stringify(copy, null, 2)}\n`);
  names.push(name);
}
console.log(`dist/themes/: ${names.length} first-party themes bundled (${names.join(", ")})`);
