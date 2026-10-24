/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THEME LINT: a theme package against the contract (packages/deck/THEMES.md)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   bun tools/theme-lint.ts packages/theme-ocean [packages/theme-folio …]
 *   import { lintTheme } from "../../tools/theme-lint.ts"   (each first-party theme's test)
 *
 * Static, no browser: what can be read off package.json, style.css and the module's source.
 *
 *   package.json   the `kadal-theme` keyword, `./style.css` exported, `kadal.theme` with a name
 *                  that is the folder's, a colour scheme, fonts in `config.fonts`, both Shiki
 *                  themes, two swatch colours; a first-party package is public
 *   style.css      every `--deck-*` token set on `.theme-<name>`, the colour ones again under
 *                  `[data-color-scheme="dark"]` (a both-schemes theme); every `.deck-layout-*`
 *                  class styled; every selector starting with the theme's class (print rules
 *                  reach the print view through `.deck-print-page`); keyframes named after the
 *                  theme; no
 *                  `@import` (fonts go through `config.fonts`, which exports wait for)
 *   the module     every layout and component it exports is declared in the metadata, and the
 *                  other way round
 *   README.md      names every layout, component and themeConfig key
 *
 * What it cannot see — contrast, overflow, how it looks — tools/theme-shots.mjs checks in
 * Chromium.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { LAYOUT_CLASSES, THEME_TOKENS } from "../packages/deck/src/theming/scaffold.ts";

/** The tokens a dark block must set again: everything that is a colour. */
const COLOUR_TOKENS = [
  "--deck-bg",
  "--deck-fg",
  "--deck-muted",
  "--deck-accent",
  "--deck-accent-2",
  "--deck-surface",
  "--deck-border",
  "--deck-code-bg",
  "--deck-code-fg",
  "--deck-code-active",
];

interface Rule {
  selector: string;
  body: string;
  /** The at-rules around it, outermost first (`@media print`). */
  at: string[];
}

/** Rules out of a stylesheet, at-rules unwrapped. Enough CSS for a lint, not a parser. */
export function cssRules(css: string): { rules: Rule[]; atRules: string[] } {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const atRules: string[] = [];
  const walk = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      const semi = text.indexOf(";", i);
      if (semi !== -1 && (open === -1 || semi < open)) {
        const stmt = text.slice(i, semi).trim();
        if (stmt.startsWith("@")) atRules.push(stmt);
        i = semi + 1;
        continue;
      }
      if (open === -1) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@")) {
        atRules.push(head);
        if (/^@(media|supports|layer|container)\b/.test(head)) walk(body, [...at, head]);
      } else rules.push({ selector: head, body, at });
      i = j;
    }
  };
  walk(src, []);
  return { rules, atRules };
}

/** Selector list → selectors, splitting on top-level commas only (`:is(a, b)` stays whole). */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const declared = (body: string, token: string) =>
  new RegExp(`(^|[;\\s{])${token.replace(/[-]/g, "\\-")}\\s*:`).test(body);

export function lintTheme(dir: string): string[] {
  const root = resolve(dir);
  const problems: string[] = [];
  const read = (f: string) =>
    existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : null;
  const pkgText = read("package.json");
  if (!pkgText) return [`${root}: no package.json`];
  const pkg = JSON.parse(pkgText) as Record<string, any>;
  const meta = pkg.kadal?.theme as Record<string, any> | undefined;
  if (!meta) return ["package.json: no kadal.theme"];
  const name = String(meta.name ?? "");
  const folder = basename(root).replace(/^theme-/, "");
  if (name !== folder) problems.push(`kadal.theme.name "${name}" is not the folder's "${folder}"`);
  if (!pkg.keywords?.includes("kadal-theme")) problems.push("package.json: no kadal-theme keyword");
  if (pkg.exports?.["./style.css"] !== "./style.css")
    problems.push("package.json: ./style.css is not exported");
  if (String(pkg.name).startsWith("@kadal/")) {
    if (pkg.name !== `@kadal/theme-${name}`)
      problems.push(`package name should be @kadal/theme-${name}`);
    if (pkg.publishConfig?.access !== "public")
      problems.push("package.json: publishConfig.access is not public");
  }
  if (!["both", "light", "dark"].includes(meta.colorScheme))
    problems.push("kadal.theme.colorScheme is missing");
  if (!meta.config?.fonts || typeof meta.config.fonts !== "object")
    problems.push("kadal.theme.config.fonts is missing: load the theme's families through it");
  if (!meta.shiki?.light || !meta.shiki?.dark)
    problems.push("kadal.theme.shiki needs light and dark");
  if (
    !Array.isArray(meta.swatch) ||
    meta.swatch.length !== 2 ||
    !meta.swatch.every((c: unknown) => typeof c === "string" && c.trim())
  )
    problems.push("kadal.theme.swatch needs two colours (the menu's swatch before the CSS loads)");
  for (const f of pkg.files ?? [])
    if (!existsSync(join(root, f))) problems.push(`files: ${f} does not exist`);

  // ── the stylesheet ──
  const css = read("style.css");
  if (!css) return [...problems, "no style.css"];
  const cls = `.theme-${name}`;
  const { rules, atRules } = cssRules(css);
  for (const a of atRules) {
    if (a.startsWith("@import")) problems.push(`style.css: ${a} — load fonts through config.fonts`);
    const kf = /^@keyframes\s+([\w-]+)/.exec(a);
    if (kf && !kf[1]!.startsWith(`${name}-`))
      problems.push(`style.css: @keyframes ${kf[1]} is not prefixed ${name}-`);
  }
  const top = rules.filter((r) => !r.at.length);
  const base = top.filter((r) => splitSelectors(r.selector).includes(cls));
  const dark = top.filter((r) =>
    splitSelectors(r.selector).includes(`${cls}[data-color-scheme="dark"]`),
  );
  const set = (rs: Rule[], t: string) => rs.some((r) => declared(r.body, t));
  for (const [token] of THEME_TOKENS)
    if (!set(base, token)) problems.push(`style.css: ${cls} does not set ${token}`);
  if (meta.colorScheme === "both")
    for (const token of COLOUR_TOKENS)
      if (!set(dark, token))
        problems.push(`style.css: ${cls}[data-color-scheme="dark"] does not set ${token}`);
  const all = rules.flatMap((r) => splitSelectors(r.selector));
  for (const l of LAYOUT_CLASSES)
    if (!all.some((s) => new RegExp(`\\.deck-layout-${l}(?![\\w-])`).test(s)))
      problems.push(`style.css: .deck-layout-${l} is not styled`);
  for (const r of rules) {
    if (r.at.some((a) => a.startsWith("@keyframes"))) continue;
    for (const s of splitSelectors(r.selector)) {
      if (/^(from|to|\d+%)$/.test(s)) continue;
      // the theme's class first, whole: `.theme-ocean`, never `.theme-oceanic` or `:root …`
      if (!new RegExp(`^\\.theme-${name}(?![\\w-])`).test(s))
        problems.push(`style.css: "${s}" is not scoped under ${cls}`);
    }
  }

  // ── the module ──
  const mod = read("index.tsx");
  const layouts: string[] = meta.layouts ?? [];
  const components: string[] = meta.components ?? [];
  if (mod) {
    // `layouts: { hero: Hero, "pull-quote": PullQuote, Badge }` → its keys
    const block = (key: string) => {
      const m = new RegExp(`\\b${key}\\s*:\\s*\\{([^}]*)\\}`).exec(mod);
      if (!m) return [];
      return m[1]!
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) =>
          part
            .split(":")[0]!
            .trim()
            .replace(/^["']|["']$/g, ""),
        );
    };
    const exportedLayouts = block("layouts");
    const exportedComponents = block("components");
    for (const l of layouts)
      if (!exportedLayouts.includes(l))
        problems.push(`index.tsx: layout "${l}" is declared but not exported`);
    for (const l of exportedLayouts)
      if (!layouts.includes(l))
        problems.push(`index.tsx: layout "${l}" is exported but not in kadal.theme.layouts`);
    for (const c of components)
      if (!exportedComponents.includes(c))
        problems.push(`index.tsx: component "${c}" is declared but not exported`);
    for (const c of exportedComponents)
      if (!components.includes(c))
        problems.push(`index.tsx: component "${c}" is exported but not in kadal.theme.components`);
  } else if (layouts.length || components.length)
    problems.push("layouts or components declared, but no index.tsx");

  // ── the README ──
  const readme = read("README.md");
  if (!readme) problems.push("no README.md");
  else {
    for (const l of layouts)
      if (!readme.includes(`\`${l}\``))
        problems.push(`README.md: the layout \`${l}\` is not documented`);
    for (const c of components)
      if (!readme.includes(c)) problems.push(`README.md: the component ${c} is not documented`);
    for (const k of Object.keys(meta.themeConfig ?? {}))
      if (!readme.includes(`\`${k}\``))
        problems.push(`README.md: the themeConfig key \`${k}\` is not documented`);
  }
  if (!existsSync(join(root, "preview/deck.mdx")))
    problems.push("no preview deck (preview/deck.mdx)");
  return problems;
}

if (import.meta.main) {
  const dirs = process.argv.slice(2);
  let bad = 0;
  for (const d of dirs) {
    const p = lintTheme(d);
    bad += p.length;
    console.log(p.length ? `FAIL ${d}\n  ${p.join("\n  ")}` : `ok   ${d}`);
  }
  process.exit(bad ? 1 : 0);
}
