// Copies examples/starter into template/ for `kadal-deck new` (and the MCP server's deck_create),
// the way @kadal/create-deck does for itself, so the scaffold and the example can never drift.
// Workspace dependencies become version ranges; .gitignore is stored as _gitignore because npm
// strips .gitignore files from published packages.
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const starter = join(root, "..", "..", "examples", "starter");
const template = join(root, "template");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

rmSync(template, { recursive: true, force: true });
cpSync(starter, template, {
  recursive: true,
  filter: (src) => !/[\\/](node_modules|dist|export|screenshots|\.kadal-deck)([\\/]|$)/.test(src.slice(starter.length)),
});
const pkgPath = join(template, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const field of ["dependencies", "devDependencies"])
  for (const [name, range] of Object.entries(pkg[field] ?? {}))
    if (String(range).startsWith("workspace:")) pkg[field][name] = `^${version}`;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
if (existsSync(join(template, ".gitignore"))) renameSync(join(template, ".gitignore"), join(template, "_gitignore"));
console.log(`template/ synced from examples/starter (@kadal/deck ^${version})`);

// The agent skill ships too: the MCP server serves its Markdown as resources, and an agent can
// read it from node_modules/@kadal/deck/skill.
const skillSrc = join(root, "..", "..", "skills", "kadal-deck");
const skill = join(root, "skill");
rmSync(skill, { recursive: true, force: true });
if (existsSync(skillSrc)) {
  cpSync(skillSrc, skill, { recursive: true });
  console.log("skill/ synced from skills/kadal-deck");
}
