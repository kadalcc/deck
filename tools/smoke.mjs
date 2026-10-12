#!/usr/bin/env node
/**
 * The packages as a stranger gets them: `npm pack` every package, scaffold a deck with the packed
 * @kadal/create-deck in a temp folder outside the repo, point its dependencies at the tarballs,
 * `npm install`, `npx kadal-deck build`, then `check`, `info` and the MCP server over stdio. Prints
 * the folder so a browser check can follow.
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

// 5 · the agent surface, as an agent gets it: lint with --json, the reference, and the MCP
// server over stdio (its SDK must arrive as a real dependency of @kadal/deck).
const check = JSON.parse(sh("npx", ["kadal-deck", "check", "--json"], app));
if (!check.ok) throw new Error(`kadal-deck check found problems in the starter: ${JSON.stringify(check.diagnostics)}`);
const info = JSON.parse(sh("npx", ["kadal-deck", "info", "components", "Poll", "--json"], app));
if (info.entry?.name !== "Poll") throw new Error("kadal-deck info did not find <Poll>");
for (const f of ["skill/SKILL.md", "schema/frontmatter.json", "template/deck.mdx", "REFERENCE.md"])
  if (!existsSync(join(app, "node_modules", "@kadal", "deck", f))) throw new Error(`@kadal/deck ships without ${f}`);
writeFileSync(
  join(app, "mcp-smoke.mjs"),
  `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["kadal-deck", "mcp"], stderr: "ignore" }));
const { tools } = await client.listTools();
const outline = await client.callTool({ name: "deck_outline", arguments: {} });
const added = await client.callTool({ name: "slide_add", arguments: { content: "## From the smoke test" } });
const check = await client.callTool({ name: "deck_check", arguments: {} });
console.log(JSON.stringify({ tools: tools.length, slides: outline.structuredContent.slides.length, added: added.structuredContent.slides, ok: check.structuredContent.ok }));
await client.close();
`,
);
const mcp = JSON.parse(sh("node", ["mcp-smoke.mjs"], app).trim().split("\n").pop());
if (mcp.tools < 17 || mcp.added !== mcp.slides + 1 || !mcp.ok) throw new Error(`kadal-deck mcp misbehaved: ${JSON.stringify(mcp)}`);
console.log(`mcp ok: ${mcp.tools} tools, ${mcp.slides} → ${mcp.added} slides`);
rmSync(join(app, "mcp-smoke.mjs"));
console.log(`\nsmoke ok: ${app}`);
if (!args.includes("--keep") && outFlag < 0) rmSync(work, { recursive: true, force: true });
