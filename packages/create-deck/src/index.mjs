#!/usr/bin/env node
// npm create @kadal/deck@latest [directory]
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const template = fileURLToPath(new URL("../template", import.meta.url));

async function ask(question, fallback) {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} (${fallback}) `)).trim();
  rl.close();
  return answer || fallback;
}

function packageName(dir) {
  const n = basename(dir).toLowerCase().replace(/[^a-z0-9-~._]+/g, "-").replace(/^[-._]+|-+$/g, "");
  return n || "my-deck";
}

function pm() {
  const ua = process.env.npm_config_user_agent ?? "";
  return ua.startsWith("pnpm") ? "pnpm" : ua.startsWith("yarn") ? "yarn" : ua.startsWith("bun") ? "bun" : "npm";
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: npm create @kadal/deck@latest [directory]");
  process.exit(0);
}
const dirArg = args[0] ?? (await ask("Where should the deck go?", "my-deck"));
const target = resolve(process.cwd(), dirArg);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`${relative(process.cwd(), target) || "."} is not empty. Choose another directory.`);
  process.exit(1);
}

cpSync(template, target, { recursive: true });
if (existsSync(join(target, "_gitignore"))) renameSync(join(target, "_gitignore"), join(target, ".gitignore"));
const pkgPath = join(target, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = packageName(target);
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const m = pm();
const run = m === "npm" ? "npm run" : m;
const x = m === "npm" ? "npx" : m === "bun" ? "bunx" : `${m} exec`;
const cd = relative(process.cwd(), target);
console.log(`
Your deck is in ${cd || "."}. Next:

  ${cd && cd !== "." ? `cd ${cd}\n  ` : ""}${m} install
  ${run} dev                         edit deck.mdx; the page reloads as you type
  ${x} kadal-deck login && ${x} kadal-deck publish   a URL with a live room

Docs: https://deck.kadal.cc/docs/
`);
