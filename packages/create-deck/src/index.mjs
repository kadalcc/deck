#!/usr/bin/env node
// npm create @kadal/deck@latest [directory]
// npm create @kadal/deck@latest -- --theme <name> [directory]    a theme package
// npm create @kadal/deck@latest -- --addon <name> [directory]    an addon package
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
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

/** `--theme aurora`, `--theme=aurora`; the rest are positionals. */
function parse(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^--(theme|addon|title)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]] = m[2] ?? (argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : "");
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (!a.startsWith("-")) positionals.push(a);
  }
  return { flags, positionals };
}

const { flags, positionals } = parse(process.argv.slice(2));
if (flags.help) {
  console.log(`Usage: npm create @kadal/deck@latest [directory]
       npm create @kadal/deck@latest -- --theme <name> [directory]   a theme package
       npm create @kadal/deck@latest -- --addon <name> [directory]   an addon package`);
  process.exit(0);
}

const m = pm();
const run = m === "npm" ? "npm run" : m;

// ── a theme or an addon package ───────────────────────────────────────────────────────────────
const kind = flags.theme !== undefined ? "theme" : flags.addon !== undefined ? "addon" : null;
if (kind) {
  // The same names `kadal-deck new --theme` makes (theming/scaffold.ts's scaffoldName/Title).
  const name = String(flags[kind])
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^kadal-(theme|addon)-/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) {
    console.error(`--${kind} needs a name: npm create @kadal/deck -- --${kind} <name>`);
    process.exit(1);
  }
  const title =
    flags.title?.trim() ||
    name
      .split("-")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
  const component = title.replace(/[^A-Za-z0-9]/g, "") || "Addon";
  const source = fileURLToPath(new URL(`../template-${kind}`, import.meta.url));
  const target = resolve(process.cwd(), positionals[0] ?? `kadal-${kind}-${name}`);
  if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(
      `${relative(process.cwd(), target) || "."} is not empty. Choose another directory.`,
    );
    process.exit(1);
  }
  // The template was rendered with sentinel names (scripts/sync-template.mjs): fill in the real ones.
  const fill = (text) =>
    text
      .replaceAll("kadal-name-sentinel", name)
      .replaceAll("Kadal Title Sentinel", title)
      .replaceAll("KadalTitleSentinel", component);
  const copy = (from, to) => {
    for (const entry of readdirSync(from)) {
      const src = join(from, entry);
      const dest = join(to, entry === "_gitignore" ? ".gitignore" : entry);
      if (statSync(src).isDirectory()) copy(src, dest);
      else {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, fill(readFileSync(src, "utf8")));
      }
    }
  };
  copy(source, target);
  const cd = relative(process.cwd(), target);
  console.log(`
Your ${kind} is in ${cd || "."}. Next:

  ${cd && cd !== "." ? `cd ${cd}\n  ` : ""}${m} install
  ${run} dev                         the preview deck (preview/deck.mdx), live
  npm publish                        keep the kadal-${kind} keyword

Docs: https://deck.kadal.cc/docs/
`);
  process.exit(0);
}

// ── a deck ────────────────────────────────────────────────────────────────────────────────────
const dirArg = positionals[0] ?? (await ask("Where should the deck go?", "my-deck"));
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

const x = m === "npm" ? "npx" : m === "bun" ? "bunx" : `${m} exec`;
const cd = relative(process.cwd(), target);
console.log(`
Your deck is in ${cd || "."}. Next:

  ${cd && cd !== "." ? `cd ${cd}\n  ` : ""}${m} install
  ${run} dev                         edit deck.mdx; the page reloads as you type
  ${x} kadal-deck login && ${x} kadal-deck publish   a URL with a live room

Docs: https://deck.kadal.cc/docs/
`);
