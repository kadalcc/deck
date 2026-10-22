import YAML from "yaml";

import {
  HEAD_ONLY,
  type Canvas,
  type ThemeChoice,
  mapHeadmatter,
  mapSlideFrontmatter,
  planTransitions,
  transitionName,
} from "./frontmatter.ts";
import type { Value } from "./expr.ts";
import { convertMarkup, mdxComment } from "./markup.ts";
import { parseSlideRange } from "../compiler/split.ts";
import { parseSlidev, type SlidevSlide } from "./parse.ts";
import { createReport, type ImportReportItem, sortReport } from "./report.ts";
import { applyDeclarations, utilityCss } from "./uno.ts";
import { convertCss } from "./style.ts";
import { convertVueFile, type VueKind } from "./vue.ts";
import { compatModule, slidevStylesheet } from "./compat.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SLIDEV → KADAL DECK, AS A PURE FUNCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   const { mdx, files, report, info } = convertSlidev(slidesMd, { file: "slides.md", readFile, list });
 *
 * `text` is a Slidev deck (slides.md). `readFile(path)` (project-relative, `/`-separated; null when
 * missing) lets the converter follow `src:` includes and read the project's components, layouts,
 * layers and styles; `list(dir)` names a folder's files. Both are optional: without them the
 * converter does the one file it was given. Nothing from the Slidev project is ever run.
 *
 * Out comes `deck.mdx` (as `mdx`), the deck's other files (`files`: converted includes under
 * pages/, src/components/*.tsx, src/global-top.tsx, src/slidev.css with the utility classes the deck
 * uses, src/slidev.tsx with the few helpers it needs, src/components.tsx registering them), and
 * the `report`: one line for everything that did not carry over exactly. It never throws: a slide
 * it cannot read is kept as text with a report line.
 *
 * The CLI (`kadal-deck import slidev`, cli/import.ts) writes these into a deck folder made the
 * way `kadal-deck new` makes one; the hosted builder can call this in the browser.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SlidevImportOptions {
  /** The deck file's path in the project (for the report and relative `src:`). Default slides.md. */
  file?: string;
  /** Read a project file (`pages/intro.md`, `components/Counter.vue`); null when it is not there. */
  readFile?: (path: string) => string | null;
  /** The files of a project folder (`components`), names only; [] when it is not there. */
  list?: (dir: string) => string[];
}

export interface SlidevImportInfo {
  title: string | null;
  theme: ThemeChoice;
  canvas: Canvas;
  /** Packages to add to devDependencies (what `twoslash` blocks import, at the project's range). */
  devDependencies: Record<string, string>;
  /** Flags for `kadal-deck export` (exportFilename, export options). */
  exportArgs: string[];
  favicon: string | null;
  htmlLang: string | null;
  /** Iconify sets the deck draws from (`carbon`, `mdi`): `@iconify-json/<set>` dev dependencies. */
  iconSets: string[];
  /** Project files the deck reads as they are: `<<<` snippets, `public/`. */
  copy: string[];
  /** Stylesheets for src/styles.css to import, relative to src/. */
  styleImports: string[];
  /** Each converted slide's title (its `title:`, else its first heading), in deck order. */
  titles: string[];
  /** Slides converted (the main file's and its includes'), and those with no warning or error. */
  slides: number;
  cleanSlides: number;
}

export interface SlidevImport {
  mdx: string;
  files: Record<string, string>;
  report: ImportReportItem[];
  info: SlidevImportInfo;
}

const posix = {
  dirname: (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""),
  join: (...parts: string[]) => {
    const out: string[] = [];
    for (const seg of parts.join("/").split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return out.join("/");
  },
};

const lineOf = (text: string, offset: number) => text.slice(0, offset).split("\n").length - 1;

export function convertSlidev(text: string, options: SlidevImportOptions = {}): SlidevImport {
  const file = options.file ?? "slides.md";
  const read = options.readFile ?? (() => null);
  const list = options.list ?? (() => []);
  const { items, reporter } = createReport({ file });
  const deckReport = reporter({ slide: null, line: null });

  const files: Record<string, string> = {};
  const classes = new Set<string>();
  const icons = new Set<string>();
  const helpers = new Set<string>();
  const copy = new Set<string>();
  const styleImports: string[] = [];
  const customClasses = new Set<string>();
  const typeImports = new Set<string>();

  let slides: SlidevSlide[];
  try {
    slides = parseSlidev(text);
  } catch (e) {
    deckReport({
      severity: "error",
      what: `The file could not be read as a Slidev deck: ${String(e)}`,
    });
    slides = [];
  }
  const head = slides[0]?.frontmatter ?? {};
  const settings = mapHeadmatter(head, deckReport);
  const { theme, canvas } = settings;

  // ── the project's Vue files: components, layouts, global layers ────────────────────────
  const components = new Set<string>(theme.components);
  const layouts = new Set<string>(theme.layouts);
  const registry: Array<{ name: string; path: string; kind: VueKind }> = [];
  const vueFiles: Array<{ dir: string; kind: VueKind }> = [
    { dir: "components", kind: "component" },
    { dir: "layouts", kind: "layout" },
  ];
  const sfcs: Array<{ path: string; name: string; kind: VueKind; source: string }> = [];
  for (const { dir, kind } of vueFiles)
    for (const f of list(dir)
      .filter((x) => x.endsWith(".vue"))
      .sort()) {
      const source = read(`${dir}/${f}`);
      if (source === null) continue;
      const name = f.replace(/\.vue$/, "");
      sfcs.push({ path: `${dir}/${f}`, name, kind, source });
      if (kind === "component")
        components.add(name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()));
      else layouts.add(name);
    }
  for (const layer of [
    "global-top",
    "global-bottom",
    "slide-top",
    "slide-bottom",
    "custom-nav-controls",
  ]) {
    const source = read(`${layer}.vue`);
    if (source !== null) sfcs.push({ path: `${layer}.vue`, name: layer, kind: "layer", source });
  }
  for (const sfc of sfcs) {
    const r = convertVueFile(sfc.source, {
      name: sfc.name,
      kind: sfc.kind,
      scale: canvas.scale,
      report: reporter({ slide: null, line: null, file: sfc.path }),
      components,
      lineOffset: 0,
    });
    for (const c of r.classes) classes.add(c);
    for (const i of r.icons) icons.add(i);
    for (const h of r.helpers) helpers.add(h);
    for (const c of r.customClasses) customClasses.add(c);
    const out =
      sfc.kind === "layer"
        ? `src/${sfc.name}.tsx`
        : sfc.kind === "layout"
          ? `src/layouts/${r.exportName}.tsx`
          : `src/components/${r.exportName}.tsx`;
    files[out] = r.tsx;
    if (r.css) {
      const cssPath = out.replace(/\.tsx$/, ".css");
      files[cssPath] = r.css;
    }
    if (sfc.kind !== "layer")
      registry.push({
        name: sfc.kind === "layout" ? sfc.name : r.exportName,
        path: `./${out.slice(4)}`,
        kind: sfc.kind,
      });
  }

  // ── styles/ and setup/ ───────────────────────────────────────────────────────────────
  for (const f of list("styles").sort()) {
    if (!/\.(css|postcss|pcss)$/.test(f)) {
      if (/\.(ts|js)$/.test(f)) continue;
      deckReport({
        severity: "warning",
        file: `styles/${f}`,
        what: `styles/${f} is not CSS; it is not carried over.`,
        suggestion: "Convert it to CSS.",
      });
      continue;
    }
    const css = read(`styles/${f}`);
    if (css === null) continue;
    const { css: next, unknown } = convertCss(css, canvas.scale);
    for (const m of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) customClasses.add(m[1]!);
    if (unknown.length)
      deckReport({
        severity: "warning",
        file: `styles/${f}`,
        what: `@apply names classes the importer has no CSS for: ${unknown.join(", ")}.`,
      });
    const out = `src/styles/${f.replace(/\.(postcss|pcss)$/, ".css")}`;
    files[out] = next;
    styleImports.push(`./${out.slice(4)}`);
  }
  for (const f of list("setup"))
    deckReport({
      severity: "warning",
      file: `setup/${f}`,
      what: `setup/${f} configures Slidev's app in code; it is not run or carried over.`,
      suggestion: /mermaid|katex|shiki|monaco|code-runners/.test(f)
        ? "Kadal reads the same settings from the headmatter (mermaid:, katex:) or setup/code-runners.ts; move them over by hand."
        : "Do the same in src/main.tsx or deck.config.ts.",
    });
  for (const f of list("public")) copy.add(`public/${f}`);
  // Slidev loads a style.css at the project's root by itself
  for (const f of ["style.css", "styles.css"]) {
    const css = read(f);
    if (css === null) continue;
    const { css: next, unknown } = convertCss(css, canvas.scale);
    for (const m of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) customClasses.add(m[1]!);
    if (unknown.length)
      deckReport({
        severity: "warning",
        file: f,
        what: `@apply names classes the importer has no CSS for: ${unknown.join(", ")}.`,
      });
    files[`src/styles/${f}`] = next;
    styleImports.push(`./styles/${f}`);
  }
  if (list("snippets").length) for (const f of list("snippets")) copy.add(`snippets/${f}`);

  // ── the slides ─────────────────────────────────────────────────────────────────────────
  const headScope: Record<string, Value> = {
    $slidev: { configs: head as Value, themeConfigs: ((head.themeConfig as Value) ?? {}) as Value },
  };
  /** A `<<<` line of `file` reads `p`: copy it beside deck.mdx (or say it is missing). */
  const snippetRead = (file: string, p: string) => {
    const target = p.startsWith("@/") ? p.slice(2) : posix.join(posix.dirname(file), p);
    if (read(target) !== null) copy.add(target);
    else
      deckReport({
        severity: "warning",
        file,
        what: `<<< ${p}: the file is not in the project.`,
        suggestion: "Copy it in beside deck.mdx.",
      });
  };
  let totalSlides = 0;
  const titles: string[] = [];
  let cleanSlides = 0;
  const included = new Set<string>();

  /** One file's slides, converted; `main` for the deck file (its first frontmatter is the headmatter). */
  /**
   * One file's slides, converted. `main` for the deck file (its first frontmatter is the
   * headmatter); `picked`, for an included file, the slides its `src: …#range` shows (1-based).
   * Slides are numbered as the converted deck plays them: a `src:` slide is not one itself (its
   * lines go to the first slide it brings in), and an included slide that is not picked has none.
   */
  const convertFile = (
    source: string,
    path: string,
    main: boolean,
    depth: number,
    picked: Set<number> | null = null,
  ): Converted => {
    const parsed = main ? slides : parseSlidev(source);
    const records: SlideRecord[] = [];
    const transitions: Array<string | null> = [];
    const hidden: boolean[] = [];
    parsed.forEach((slide, i) => {
      const includes = typeof slide.frontmatter.src === "string" && !slide.body.trim();
      const shown = !picked || picked.has(i + 1);
      const slideNo = includes || !shown ? (shown ? totalSlides + 1 : null) : ++totalSlides;
      if (!includes && shown)
        titles.push(
          typeof slide.frontmatter.title === "string"
            ? slide.frontmatter.title
            : (/^#{1,6}\s+(.+)$/m.exec(slide.body.replace(/^```[\s\S]*?^```/gm, ""))?.[1]?.trim() ??
                ""),
        );
      const before = items.length;
      const report = reporter({ slide: slideNo, line: slide.bodyLine, file: path });
      if (slide.yamlError)
        report({
          severity: "error",
          line: slide.frontmatterLine,
          what: `The frontmatter is not valid YAML: ${slide.yamlError}`,
          suggestion: "Fix the YAML; the slide was converted without it.",
        });
      const isHead = main && i === 0;
      const ownFm = isHead
        ? Object.fromEntries(
            Object.entries(slide.frontmatter).filter(
              ([k]) => !HEAD_ONLY.has(k) || k === "layout" || k === "class",
            ),
          )
        : slide.frontmatter;
      const defaults = (
        head.defaults && typeof head.defaults === "object" ? head.defaults : {}
      ) as Record<string, unknown>;
      const mapped = mapSlideFrontmatter(ownFm, {
        report,
        scale: canvas.scale,
        layouts,
        rewriteSrc: (src) => {
          const [p, range] = src.split("#");
          const rel = p!.trim();
          const target = posix.join(posix.dirname(path), rel);
          if (depth > 8 || included.has(target)) {
            report({
              severity: "error",
              what: `src: ${src} includes itself; the include is dropped.`,
            });
            return src;
          }
          const inc = read(target);
          if (inc === null) {
            report({
              severity: "error",
              what: `src: ${src} — the file ${target} is not in the project.`,
              suggestion: "Copy it in, or remove the slide.",
            });
            return src;
          }
          included.add(target);
          const outPath = target.replace(/\.md$/i, ".mdx");
          const count = parseSlidev(inc).length;
          const pick = range ? new Set(parseSlideRange(range, count).slides) : null;
          const conv = convertFile(inc, target, false, depth + 1, pick);
          files[outPath] = serialize(
            conv.records.map((r, k) => ({
              ...r,
              fm: withTransition(r.fm, includedTransition(conv.transitions[k] ?? null)),
            })),
          );
          const relOut = rel.replace(/\.md$/i, ".mdx");
          return range ? `${relOut}#${range}` : relOut;
        },
      });
      transitions.push(mapped.transition);
      hidden.push(slide.frontmatter.hide === true || slide.frontmatter.disabled === true);
      const fm: Record<string, unknown> = {
        ...(isHead ? settings.deck : {}),
        ...mapped.frontmatter,
      };
      const frontmatterScope = { ...defaults, ...slide.frontmatter } as Value;
      const ctx = {
        report,
        lineAt: (offset: number) => slide.bodyLine + lineOf(slide.body, offset),
        scale: canvas.scale,
        scope: { ...headScope, $frontmatter: frontmatterScope },
        classes,
        icons,
        helpers,
        components,
        typeImports,
        onSnippet: (p: string) => snippetRead(path, p),
        clickAnimation: mapped.clickAnimation ?? settings.clickAnimation,
        dragNames: mapped.dragNames,
      };
      // the slide's class: frontmatter is utility classes too
      for (const c of String(fm.class ?? "")
        .split(/\s+/)
        .filter(Boolean))
        classes.add(c);
      let body: string;
      try {
        body = convertMarkup(slide.body, ctx);
      } catch (e) {
        report({
          severity: "error",
          what: `The slide could not be converted (${e instanceof Error ? e.message : String(e)}); its source is kept as a comment.`,
        });
        body = mdxComment(`slidev:\n${slide.body}`);
      }
      if (mapped.layoutClass) {
        const r = applyDeclarations(mapped.layoutClass, canvas.scale);
        if (r.unknown.length)
          report({
            severity: "warning",
            what: `layoutClass ${r.unknown.join(" ")} has no CSS the importer knows; dropped.`,
          });
        if (r.css) body += `\n\n<style>\n.deck-layout { ${r.css} }\n</style>`;
      }
      let note = "";
      if (slide.note) {
        try {
          const n = convertMarkup(slide.note, {
            ...ctx,
            notes: true,
            lineAt: (offset: number) =>
              (slide.noteLine ?? slide.bodyLine) + lineOf(slide.note!, offset),
          });
          note = `\n\n<!--\n${n.replace(/-->/g, "--\\>")}\n-->`;
        } catch {
          note = `\n\n<!--\n${slide.note}\n-->`;
        }
      }
      records.push({ fm, content: `${body.trim()}${note}`.trim() });
      if (!includes && shown && !items.slice(before).some((r) => r.severity !== "info"))
        cleanSlides++;
    });
    return { records, transitions, hidden };
  };

  const main = convertFile(text, file, true, 0);

  // ── transitions: Slidev's per-slide "way out" → Kadal's definitions ────────────────────
  const plan = planTransitions(
    main.transitions.filter((_, i) => !main.hidden[i]),
    settings.transition,
    deckReport,
  );
  let k = 0;
  const records = main.records.map((r, i) => {
    const fm = { ...r.fm };
    delete fm.transition;
    const own = main.hidden[i] ? null : (plan.perSlide[k++] ?? null);
    if (i === 0) {
      if (plan.deck) fm.transition = plan.deck;
      if (Object.keys(plan.definitions).length) fm.transitions = plan.definitions;
    }
    if (own) fm.transition = own;
    return { ...r, fm };
  });
  if (plan.fadeOut) helpers.add("fadeOut");
  const mdx = serialize(records);

  // ── src/slidev.css, src/slidev.tsx, src/components.tsx ──────────────────────────────────
  const utilities = utilityCss(classes, { scale: canvas.scale });
  const unknown = utilities.unknown.filter(
    (c) =>
      !customClasses.has(c) &&
      !/^(slidev-|deck-|is-|has-|footnote|prose|not-prose|dark$|light$)/.test(c),
  );
  for (const c of collectStyleClasses(mdx)) customClasses.add(c);
  const reallyUnknown = unknown.filter((c) => !customClasses.has(c));
  if (reallyUnknown.length)
    deckReport({
      severity: "warning",
      what: `Classes with no CSS: ${reallyUnknown.join(", ")}. They are neither UnoCSS utilities the importer knows nor defined in the deck's styles.`,
      suggestion:
        "Define them in src/styles.css (under `kadal-deck build`, Tailwind may cover the standard ones).",
    });
  files["src/slidev.css"] = slidevStylesheet({
    scale: canvas.scale,
    utilities: utilities.css,
    helpers,
  });
  styleImports.unshift("./slidev.css");
  const compat = compatModule(helpers);
  if (compat) files["src/slidev.tsx"] = compat;
  files["src/components.tsx"] = componentsModule(registry, !!compat && helpers.has("SlidevOn"));

  // TwoSlash's imports: the packages the Slidev project had come along (for their types)
  const devDependencies: Record<string, string> = {};
  let slidevDeps: Record<string, string> = {};
  try {
    const pj = JSON.parse(read("package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    slidevDeps = { ...pj.devDependencies, ...pj.dependencies };
  } catch {
    /* no package.json, or not JSON */
  }
  for (const m of [...typeImports].sort()) {
    if (slidevDeps[m]) {
      devDependencies[m] = slidevDeps[m]!;
      deckReport({
        severity: "info",
        what: `${m} is added to devDependencies: a twoslash block imports it, and TwoSlash reads its types from node_modules.`,
      });
    } else
      deckReport({
        severity: "warning",
        what: `A twoslash block imports ${m}, which the project does not depend on; TwoSlash shows "Cannot find module" until it is installed.`,
        suggestion: `npm install -D ${m}`,
      });
  }
  const iconSets = [...new Set([...icons].map((i) => i.split(":")[0]!))].sort();
  return {
    mdx,
    files,
    report: sortReport(items),
    info: {
      title: typeof head.title === "string" ? head.title : null,
      theme,
      canvas,
      exportArgs: settings.exportArgs,
      devDependencies,
      favicon: settings.favicon,
      htmlLang: settings.htmlLang,
      iconSets,
      copy: [...copy].sort(),
      styleImports,
      titles,
      slides: totalSlides,
      cleanSlides,
    },
  };
}

/** Classes a deck's own `<style>` blocks define (so a class used in markup is not "unknown"). */
function collectStyleClasses(mdx: string): string[] {
  const out: string[] = [];
  for (const m of mdx.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    for (const c of m[1]!.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.push(c[1]!);
  return out;
}

interface SlideRecord {
  fm: Record<string, unknown>;
  content: string;
}
interface Converted {
  records: SlideRecord[];
  transitions: Array<string | null>;
  hidden: boolean[];
}

/** Slides back into one MDX file: `---` + frontmatter, or a bare `---` and a blank line. */
function serialize(records: SlideRecord[]): string {
  const out = records.map((r, i) => {
    const yaml = Object.keys(r.fm).length ? YAML.stringify(r.fm, { lineWidth: 0 }).trimEnd() : "";
    const sep = yaml ? `---\n${yaml}\n---` : i === 0 ? "" : "---";
    return `${sep}${sep ? "\n\n" : ""}${r.content}`.trimEnd();
  });
  return `${out.join("\n\n")}\n`;
}

/** Slides in an included file keep a transition of their own as the nearest Kadal one. */
function includedTransition(t: string | null): string | null {
  if (!t) return null;
  const same: Record<string, string> = {
    "slide-left": "slide",
    "slide-right": "slide",
    "slide-up": "slide",
    "slide-down": "slide",
    fade: "fade",
    "fade-out": "fade",
    none: "none",
    "view-transition": "view-transition",
  };
  return same[t.split("|")[0]!.trim()] ?? "fade";
}

function withTransition(fm: Record<string, unknown>, t: string | null): Record<string, unknown> {
  const out = { ...fm };
  delete out.transition;
  if (t) out.transition = t;
  return out;
}

function componentsModule(
  registry: Array<{ name: string; path: string; kind: VueKind }>,
  slidevOn: boolean,
): string {
  const imports: string[] = [];
  const entries: string[] = [];
  for (const r of registry) {
    const ident =
      r.kind === "layout"
        ? `Layout${r.name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`
        : r.name;
    imports.push(
      `import ${r.kind === "layout" ? ident : `{ ${ident} }`} from "${r.path.replace(/\.tsx$/, ".tsx")}";`,
    );
    entries.push(r.kind === "layout" ? `  "layout:${r.name}": ${ident},` : `  ${ident},`);
  }
  if (slidevOn) {
    imports.push(`import { SlidevOn } from "./slidev.tsx";`);
    entries.push("  SlidevOn,");
  }
  return `import type { ComponentType } from "react";
${imports.length ? `\n${imports.join("\n")}\n` : ""}
/**
 * Components your slides can use without importing: \`<MyChart />\` in deck.mdx resolves here.
 * Add a \`layout:name\` entry to register a custom layout for \`layout: name\` in frontmatter.
 * The ones below came from the Slidev project (kadal-deck import slidev).
 */
export const components: Record<string, ComponentType<Record<string, unknown>>> = {
${entries.map((e) => e.replace(/^  (\w+),$/, "  $1: $1 as ComponentType<Record<string, unknown>>,").replace(/^  ("layout:[^"]+"): (\w+),$/, "  $1: $2 as ComponentType<Record<string, unknown>>,")).join("\n")}
};
`;
}

export { transitionName };
