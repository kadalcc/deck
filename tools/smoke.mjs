#!/usr/bin/env node
/**
 * The packages as a stranger gets them: `npm pack` every package, scaffold a deck with the packed
 * @kadal/create-deck in a temp folder outside the repo, point its dependencies at the tarballs,
 * `npm install`, and `npx kadal-deck build`. Prints the folder so a browser check can follow.
 *
 *   node tools/smoke.mjs [--keep] [--out <dir>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const work = outFlag >= 0 ? resolve(args[outFlag + 1]) : mkdtempSync(join(tmpdir(), "kadal-deck-smoke-"));
const packs = join(work, "packs");
mkdirSync(packs, { recursive: true });

const sh = (cmd, argv, cwd) => {
  console.log(`$ ${cmd} ${argv.join(" ")}   (${cwd})`);
  return execFileSync(cmd, argv, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
};

// 1 · pack (prepack builds each package)
const tarballs = {};
for (const dir of readdirSync(join(root, "packages"))) {
  const pkgDir = join(root, "packages", dir);
  if (!existsSync(join(pkgDir, "package.json"))) continue;
  const name = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).name;
  const file = sh("npm", ["pack", "--silent", "--pack-destination", packs], pkgDir).trim().split("\n").pop();
  tarballs[name] = join(packs, file);
}
console.log(`packed ${Object.keys(tarballs).length} packages into ${packs}`);

// 2 · scaffold with the packed @kadal/create-deck
const createDir = join(work, "create");
mkdirSync(createDir, { recursive: true });
sh("tar", ["-xzf", tarballs["@kadal/create-deck"], "-C", createDir], work);
const app = join(work, "my-talk");
rmSync(app, { recursive: true, force: true });
sh("node", [join(createDir, "package", "src", "index.mjs"), app], work);

// 3 · install the tarballs, not the registry
const pkgPath = join(app, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const field of ["dependencies", "devDependencies"])
  for (const name of Object.keys(pkg[field] ?? {})) if (tarballs[name]) pkg[field][name] = `file:${tarballs[name]}`;
pkg.overrides = Object.fromEntries(Object.entries(tarballs).map(([n, f]) => [n, `file:${f}`]));
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], app);

// 4 · the CLI, as a user runs it
sh("npx", ["kadal-deck", "--version"], app);
sh("npx", ["kadal-deck", "build"], app);
if (!existsSync(join(app, "dist", "index.html"))) throw new Error("kadal-deck build produced no dist/index.html");
console.log(`\nsmoke ok: ${app}`);
if (!args.includes("--keep") && outFlag < 0) rmSync(work, { recursive: true, force: true });
