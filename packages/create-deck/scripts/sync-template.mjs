// Copies examples/starter into template/, so the scaffold and the example can never drift.
// Workspace dependencies become version ranges; .gitignore is stored as _gitignore because npm
// strips .gitignore files from published packages.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  filter: (src) => !/[\\/](node_modules|dist|export|screenshots|\.kadal-deck)([\\/]|$)/.test(src.slice(starter.length)),
});
const pkgPath = join(template, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const field of ["dependencies", "devDependencies"])
  for (const [name, range] of Object.entries(pkg[field] ?? {}))
    if (String(range).startsWith("workspace:")) pkg[field][name] = `^${deckVersion}`;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
if (existsSync(join(template, ".gitignore"))) renameSync(join(template, ".gitignore"), join(template, "_gitignore"));
console.log(`template/ synced from examples/starter (@kadal/deck ^${deckVersion})`);

// The theme and addon scaffolds (`npm create @kadal/deck -- --theme <name>`): rendered from the
// engine's own scaffold module (@kadal/deck's theming/scaffold.ts, built first) with sentinel
// names that src/index.mjs replaces, so `kadal-deck new --theme` and this can never drift.
const scaffold = join(root, "..", "deck", "dist", "theming", "scaffold.js");
if (existsSync(scaffold)) {
  const { themeScaffold, addonScaffold } = await import(scaffold);
  const sentinel = {
    name: "kadal-name-sentinel",
    title: "Kadal Title Sentinel",
    deckRange: `^${deckVersion}`,
  };
  for (const [dir, make] of [
    ["template-theme", themeScaffold],
    ["template-addon", addonScaffold],
  ]) {
    const out = join(root, dir);
    rmSync(out, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(make(sentinel))) {
      const file = join(out, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
  console.log(`template-theme/ and template-addon/ rendered from @kadal/deck's scaffold`);
} else
  console.warn("template-theme/ skipped: build @kadal/deck first (its dist/theming/scaffold.js)");
