import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { UsageError, str } from "./args.ts";
import type { Io } from "./index.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck import slidev <slides.md | folder> [--out dir] [--force] [--install]`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A Slidev project in, a Kadal deck folder out — made the way `kadal-deck new` makes one (the
 * starter: vite.config.ts, src/main.tsx, Tailwind), then filled from the converter
 * (import/slidev.ts):
 *
 *   deck.mdx              slides.md, converted
 *   pages/*.mdx           the files `src:` includes, converted too
 *   src/components/*.tsx, src/layouts/*.tsx, src/global-top.tsx …   the project's .vue files
 *   src/slidev.css        the utility classes the slides use, at Kadal's scale (imported by styles.css)
 *   src/styles/*.css      the project's styles/, converted
 *   public/, snippets/    copied as they are
 *   package.json          + the theme's package, @iconify-json/<set> for each icon set, the export
 *                         script's flags (exportFilename, export:)
 *   deck.config.ts        without the starter's transition and colour scheme, which would
 *                         override the deck's own
 *   IMPORT-REPORT.md      every line the converter reported, slide by slide
 *
 * then runs `kadal-deck check` on the result and prints a short summary. Nothing in the Slidev
 * project is changed, installed or run. The output folder must be empty unless --force is given
 * (then files are written over, nothing is deleted).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const IMPORT_FLAGS = {
  out: { kind: "string" as const, short: "o" },
  force: { kind: "boolean" as const },
  install: { kind: "boolean" as const },
  pm: { kind: "string" as const },
};

/** Every file under `dir` (relative, `/`-separated), node_modules and dot-folders skipped. */
function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

export async function importCommand(
  positionals: string[],
  flags: Record<string, unknown>,
  cwd: string,
  { json, say, emit }: Io,
): Promise<number> {
  const [kind, source] = positionals;
  if (kind !== "slidev")
    throw new UsageError(
      kind
        ? `Kadal Deck imports Slidev decks (kadal-deck import slidev <slides.md>), not "${kind}".`
        : "What should it import? kadal-deck import slidev <slides.md | folder>",
    );
  if (!source)
    throw new UsageError("Which Slidev deck? kadal-deck import slidev <slides.md | folder>");
  const src = resolve(cwd, source);
  if (!existsSync(src)) throw new UsageError(`${src} does not exist.`);
  let root: string;
  let entry: string;
  if (statSync(src).isDirectory()) {
    root = src;
    const candidates = [
      "slides.md",
      ...readdirSync(src).filter((f) => f.endsWith(".md") && f !== "README.md"),
    ];
    const found = candidates.find((f) => existsSync(join(src, f)));
    if (!found) throw new UsageError(`${src} has no slides.md (or other .md deck) in it.`);
    entry = found;
  } else {
    root = dirname(src);
    entry = basename(src);
  }
  const out = resolve(cwd, str(flags.out) ?? `${root.replace(/[\\/]+$/, "")}-kadal`);
  if (out === root || out.startsWith(`${root}/node_modules`))
    throw new UsageError(
      "The deck cannot be written into the Slidev project itself; pass --out <dir>.",
    );
  const nonEmpty = existsSync(out) && readdirSync(out).length > 0;
  if (nonEmpty && flags.force !== true)
    throw new UsageError(
      `${out} is not empty. Pass --force to write into it, or --out <another dir>.`,
    );

  const { convertSlidev, formatImportReport } = await import("../import/index.ts");
  const read = (p: string) => {
    const full = resolve(root, p);
    if (!full.startsWith(root)) return null;
    try {
      return readFileSync(full, "utf8");
    } catch {
      return null;
    }
  };
  const list = (d: string) => {
    const full = resolve(root, d);
    if (!full.startsWith(root) || !existsSync(full) || !statSync(full).isDirectory()) return [];
    return d === "public" || d === "snippets" ? walk(full) : readdirSync(full);
  };
  const result = convertSlidev(readFileSync(join(root, entry), "utf8"), {
    file: entry,
    readFile: read,
    list,
  });

  // 1. the starter, the way `kadal-deck new` makes it (into a scratch folder first with --force,
  //    so an existing folder's own files are only ever written over, never removed)
  const { newDeck } = await import("./new.ts");
  const title = result.info.title ?? basename(root);
  let target = out;
  if (nonEmpty) target = mkdtempSync(join(dirname(out), `.${basename(out)}-import-`));
  await newDeck(target, {
    title,
    install: false,
    stdio: json ? "stderr" : "inherit",
  });
  if (target !== out) {
    mkdirSync(out, { recursive: true });
    cpSync(target, out, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }

  // 2. the converted deck
  const write = (rel: string, text: string) => {
    const p = join(out, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  write("deck.mdx", result.mdx);
  for (const [rel, text] of Object.entries(result.files)) write(rel, text);
  for (const rel of result.info.copy) {
    const from = join(root, rel);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    cpSync(from, join(out, rel));
  }

  // package.json: the theme, the icon sets, the export flags; the Slidev project's other packages
  const own = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  const pkgPath = join(out, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  pkg.dependencies ??= {};
  pkg.devDependencies ??= {};
  if (result.info.theme.package) pkg.dependencies[result.info.theme.package] = `^${own.version}`;
  for (const set of result.info.iconSets) pkg.devDependencies[`@iconify-json/${set}`] = "latest";
  for (const [name, range] of Object.entries(result.info.devDependencies))
    pkg.devDependencies[name] ??= range;
  if (result.info.exportArgs.length)
    pkg.scripts = {
      ...pkg.scripts,
      export: `kadal-deck export ${result.info.exportArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
    };
  writeFileSync(pkgPath, `${JSON.stringify(sortDeps(pkg), null, 2)}\n`);
  const slidevPkg = read("package.json");
  const extraDeps: string[] = [];
  if (slidevPkg) {
    try {
      const sp = JSON.parse(slidevPkg) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const d of Object.keys({ ...sp.dependencies, ...sp.devDependencies }))
        if (
          !/^(@slidev\/|slidev-|vue$|@vue\/|@iconify-json\/|playwright-chromium$|@unocss\/|unocss$|typescript$)/.test(
            d,
          )
        )
          extraDeps.push(d);
    } catch {
      /* not JSON: nothing to read */
    }
  }

  // deck.config.ts: the starter's transition and colour scheme would override the deck's
  write(
    "deck.config.ts",
    `import type { DeckConfigInput } from "@kadal/deck";

/**
 * Engine settings. Anything here overrides the headmatter in deck.mdx, which overrides the
 * defaults — so this deck, imported from Slidev, keeps its settings in the headmatter and only
 * the live room here.
 *
 * \`live.api: null\` keeps the deck offline on your machine. When you publish it, the host turns
 * the live room on for you (polls, questions, followers).
 */
export const config: DeckConfigInput = {
  live: { api: import.meta.env?.VITE_KADAL_DECK_LIVE ? "/api" : null, room: null },
};
`,
  );

  // src/styles.css: the converted stylesheets, after Tailwind's import
  const stylesPath = join(out, "src", "styles.css");
  if (existsSync(stylesPath)) {
    let css = readFileSync(stylesPath, "utf8");
    const imports = result.info.styleImports.map((p) => `@import "${p}";`).join("\n");
    const sources = Object.keys(result.files).some((f) => f.startsWith("pages/"))
      ? `\n@source "../pages";`
      : "";
    css = css.includes('@import "tailwindcss";')
      ? css
          .replace('@import "tailwindcss";', `@import "tailwindcss";\n${imports}`)
          .replace(/(@source "\.\.\/deck\.mdx";)/, `$1${sources}`)
      : `${imports}\n${css}`;
    writeFileSync(stylesPath, css);
  }

  // index.html: the favicon and the language
  const htmlPath = join(out, "index.html");
  if (existsSync(htmlPath) && (result.info.favicon || result.info.htmlLang)) {
    let html = readFileSync(htmlPath, "utf8");
    if (result.info.htmlLang)
      html = html.replace(/<html lang="[^"]*">/, `<html lang="${result.info.htmlLang}">`);
    if (result.info.favicon)
      html = html.replace(
        "</head>",
        `    <link rel="icon" href="${result.info.favicon}" />\n  </head>`,
      );
    writeFileSync(htmlPath, html);
  }

  if (extraDeps.length)
    result.report.push({
      severity: "info",
      file: "package.json",
      slide: null,
      line: null,
      what: `The Slidev project also depends on ${extraDeps.join(", ")}; they are not added (a Vue package will not run in Kadal).`,
      suggestion: "Add the ones the deck still needs to package.json.",
    });
  write(
    "IMPORT-REPORT.md",
    formatImportReport(result, {
      source: relative(cwd, join(root, entry)) || entry,
      titles: result.info.titles,
    }),
  );

  // 3. the same checks as `kadal-deck check`
  const { openProject, checkProject, rel } = await import("./project.ts");
  const project = openProject(out);
  const check = await checkProject(project, { compile: true });
  // Before `npm install` the theme package cannot resolve: that is the next step, not a problem.
  const installed = existsSync(join(out, "node_modules"));
  const pending = installed
    ? []
    : check.diagnostics.filter((d) => (d.code ?? "").endsWith("-missing"));
  const diagnostics = check.diagnostics.filter((d) => !pending.includes(d));
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const shown = (p: string) => {
    const r = relative(cwd, p);
    return r && !r.startsWith("../..") ? r : p;
  };
  const count = (s: string) => result.report.filter((r) => r.severity === s).length;
  const pct = result.info.slides
    ? Math.round((result.info.cleanSlides / result.info.slides) * 100)
    : 100;

  if (json)
    emit({
      ok: errors.length === 0,
      out,
      source: join(root, entry),
      slides: result.info.slides,
      cleanSlides: result.info.cleanSlides,
      theme: result.info.theme,
      report: result.report,
      check: {
        ok: errors.length === 0,
        diagnostics: diagnostics.map((d) => ({ ...d, file: rel(project, d.file) })),
        afterInstall: pending.map((d) => ({ ...d, file: rel(project, d.file) })),
      },
    });
  else {
    say(`\nImported ${shown(join(root, entry))} into ${shown(out)}.`);
    say(
      `  ${result.info.slides} slides, ${result.info.cleanSlides} (${pct}%) with nothing to report.`,
    );
    say(
      `  theme: ${result.info.theme.slidev} → ${result.info.theme.kadal}${result.info.theme.package ? ` (${result.info.theme.package})` : ""}`,
    );
    say(
      `  report: ${count("error")} errors, ${count("warning")} warnings, ${count("info")} notes — IMPORT-REPORT.md`,
    );
    for (const r of result.report.filter((x) => x.severity !== "info").slice(0, 8))
      say(
        `    ${r.severity === "error" ? "✗" : "!"} ${r.slide ? `slide ${r.slide}: ` : ""}${r.what}`,
      );
    say(
      `  check: ${errors.length} errors, ${warnings.length} warnings${errors.length || warnings.length ? " (kadal-deck check in the folder lists them)" : ""}${pending.length ? `; ${pending.length} package${pending.length > 1 ? "s" : ""} to install` : ""}`,
    );
    for (const d of [...errors, ...warnings].slice(0, 6))
      say(
        `    ${d.severity === "error" ? "✗" : "!"} ${rel(project, d.file)}${d.line ? `:${d.line}` : ""} ${d.message}`,
      );
    say(`\nNext:\n\n  cd ${shown(out)}\n  npm install\n  npm run dev\n`);
  }

  if (flags.install === true) {
    const { detectPackageManager } = await import("./new.ts");
    const pm =
      (str(flags.pm) as "npm" | "pnpm" | "yarn" | "bun" | undefined) ?? detectPackageManager();
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(pm, ["install"], {
      cwd: out,
      stdio: json ? ["ignore", process.stderr, process.stderr] : "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) throw new Error(`${pm} install failed (exit ${r.status})`);
  }
  return errors.length ? 1 : 0;
}

function sortDeps<
  T extends { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
>(pkg: T): T {
  const sort = (o?: Record<string, string>) =>
    o ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))) : o;
  return {
    ...pkg,
    dependencies: sort(pkg.dependencies),
    devDependencies: sort(pkg.devDependencies),
  };
}
