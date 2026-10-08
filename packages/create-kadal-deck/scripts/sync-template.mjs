// Copies examples/starter into template/, so the scaffold and the example can never drift.
// Workspace dependencies become version ranges; .gitignore is stored as _gitignore because npm
// strips .gitignore files from published packages.
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const starter = join(root, "..", "..", "examples", "starter");
const template = join(root, "template");
const deckVersion = JSON.parse(readFileSync(join(root, "..", "deck", "package.json"), "utf8")).version;

rmSync(template, { recursive: true, force: true });
cpSync(starter, template, {
  recursive: true,
  filter: (src) => !/[\\/](node_modules|dist|export|\.kadal-deck)([\\/]|$)/.test(src.slice(starter.length)),
});
const pkgPath = join(template, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const field of ["dependencies", "devDependencies"])
  for (const [name, range] of Object.entries(pkg[field] ?? {}))
    if (String(range).startsWith("workspace:")) pkg[field][name] = `^${deckVersion}`;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
if (existsSync(join(template, ".gitignore"))) renameSync(join(template, ".gitignore"), join(template, "_gitignore"));
console.log(`template/ synced from examples/starter (@kadal/deck ^${deckVersion})`);
