import { scopeCss } from "../compiler/slide-style.ts";
import { GENERATED } from "../catalog/generated.ts";
import { parseExpr, toJs, translateClass, translateExpr } from "./expr.ts";
import { convertMarkup } from "./markup.ts";
import type { Reporter } from "./report.ts";
import { convertCss } from "./style.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SLIDEV PROJECT'S .vue FILES, AS TSX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   components/Counter.vue      → src/components/Counter.tsx    (registered in src/components.tsx)
 *   layouts/my-layout.vue       → src/layouts/my-layout.tsx     (`layout:my-layout`)
 *   global-top.vue, global-bottom.vue, slide-top.vue, slide-bottom.vue, custom-nav-controls.vue
 *                              → src/<name>.tsx, Kadal's layer files (the Vite plugin finds them)
 *
 * The template goes through the same converter as a slide (markup.ts, in its "tsx" mode), so
 * directives, attributify, icons and Slidev's components convert the same way. The script is read,
 * never run, and only for the shapes a small component has:
 *
 *   defineProps({ count: { default: 0 } }), defineProps<{ … }>(), withDefaults(…, { … })
 *   const counter = ref(props.count)           → const [counter, setCounter] = useState(p.count)
 *   const doubled = computed(() => counter.value * 2)   → const doubled = counter * 2
 *   const items = ['a', 'b']                   → the same const
 *   @click="counter -= 1", counter++, x = 3   → onClick={() => setCounter((v) => v - 1)} …
 *
 * Anything else in the script (functions, watchers, imports from outside Vue, lifecycle hooks)
 * makes the file a STUB: the template's markup with what it can still resolve (props), no
 * behaviour, a `TODO` at the top and an error in the report. A layer reads Slidev's runtime from
 * its props: `$slidev.nav.currentPage` → `props.page`, `$slidev.nav.total` → `props.total`,
 * `$clicks` → `props.click`, `$frontmatter` → the slide's frontmatter. A layout gets Kadal's
 * layout contract (`frontmatter`, `children`) and its named slots through `slotsOf`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type VueKind = "component" | "layout" | "layer";

export interface VueFileOptions {
  /** The file name without `.vue` (`Counter`, `my-layout`, `global-top`). */
  name: string;
  kind: VueKind;
  scale: number;
  report: Reporter;
  /** The components the deck has (its converted ones and the theme's). */
  components: Set<string>;
  lineOffset: number;
}

export interface VueFileResult {
  tsx: string;
  /** The component's own CSS (its `<style>`, scoped to it), or null. */
  css: string | null;
  exportName: string;
  classes: Set<string>;
  icons: Set<string>;
  helpers: Set<string>;
  /** Classes the file's CSS defines. */
  customClasses: Set<string>;
  /** True when the script was beyond the importer and this is a stub. */
  stub: boolean;
}

const pascal = (s: string) => s.replace(/(^|[-_])(\w)/g, (_, __, c: string) => c.toUpperCase());

interface Block {
  attrs: string;
  content: string;
  start: number;
}

/** The SFC's top-level blocks. */
function blocks(source: string): { template: Block | null; scripts: Block[]; styles: Block[] } {
  const scripts: Block[] = [];
  const styles: Block[] = [];
  let template: Block | null = null;
  const re = /<(template|script|style)(\s[^>]*)?>/gi;
  let m: RegExpExecArray | null;
  let from = 0;
  while ((m = re.exec(source))) {
    if (m.index < from) continue;
    const tag = m[1]!.toLowerCase();
    const open = m.index + m[0].length;
    let close: number;
    if (tag === "template") {
      // nested <template>s inside: count them
      let depth = 1;
      const inner = /<(\/?)template(\s[^>]*)?>/gi;
      inner.lastIndex = open;
      let n: RegExpExecArray | null;
      close = source.length;
      while ((n = inner.exec(source))) {
        if (n[1]) depth--;
        else if (!n[0].endsWith("/>")) depth++;
        if (depth === 0) {
          close = n.index;
          break;
        }
      }
    } else {
      const end = new RegExp(`</${tag}\\s*>`, "i");
      const e = end.exec(source.slice(open));
      close = e ? open + e.index : source.length;
    }
    const block = { attrs: m[2] ?? "", content: source.slice(open, close), start: open };
    if (tag === "template" && !template) template = block;
    else if (tag === "script") scripts.push(block);
    else if (tag === "style") styles.push(block);
    from = source.indexOf(">", close) + 1 || source.length;
    re.lastIndex = from;
  }
  return { template, scripts, styles };
}

interface ScriptModel {
  props: Map<string, string | null>;
  state: Map<string, string>;
  computed: Map<string, string>;
  consts: Map<string, string>;
  unsupported: string[];
}

/** Top-level statements of a script, split at `;`/newlines outside brackets and strings. */
function statements(code: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      i = nl < 0 ? code.length : nl - 1;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (depth === 0 && (ch === ";" || ch === "\n")) {
      const before = code.slice(start, i).trim();
      if (
        ch === "\n" &&
        (/[=+\-*/?:,&|(]$/.test(before) || /^\s*[.?:]/.test(code.slice(i + 1, i + 40)))
      )
        continue;
      if (before) out.push(before);
      start = i + 1;
    }
  }
  const last = code.slice(start).trim();
  if (last) out.push(last);
  return out
    .map((s) =>
      s
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim(),
    )
    .filter(Boolean);
}

/** `{ count: { default: 0 }, label: String }` / `['a', 'b']` → prop names and default sources. */
function propsFrom(arg: string, into: Map<string, string | null>): boolean {
  const a = arg.trim();
  if (a.startsWith("[")) {
    for (const m of a.matchAll(/['"]([\w-]+)['"]/g)) into.set(m[1]!, null);
    return true;
  }
  if (!a.startsWith("{")) return false;
  // keys at depth 1 and a `default:` inside each
  let depth = 0;
  let key: string | null = null;
  let valueStart = -1;
  const flush = (end: number) => {
    if (key === null) return;
    const value = a.slice(valueStart, end).trim();
    const def = /^\{[\s\S]*\bdefault\s*:\s*([\s\S]+?)\s*(?:,\s*\w+\s*:[\s\S]*)?\}$/.exec(value);
    into.set(key, def ? def[1]!.replace(/,\s*$/, "") : null);
    key = null;
  };
  for (let i = 0; i < a.length; i++) {
    const ch = a[i]!;
    if ("([{".includes(ch)) {
      depth++;
      if (depth === 1) {
        const m = /^\{?\s*['"]?([\w$-]+)['"]?\s*:/.exec(a.slice(i + 1));
        if (m) {
          key = m[1]!;
          valueStart = i + 1 + m[0].length;
        }
      }
      continue;
    }
    if (")]}".includes(ch)) {
      if (depth === 1) flush(i);
      depth--;
      continue;
    }
    if (depth === 1 && ch === ",") {
      flush(i);
      const m = /^\s*['"]?([\w$-]+)['"]?\s*:/.exec(a.slice(i + 1));
      if (m) {
        key = m[1]!;
        valueStart = i + 1 + m[0].length;
      } else {
        const short = /^\s*([\w$]+)\s*(?=,|$|\})/.exec(a.slice(i + 1));
        if (short) into.set(short[1]!, null);
      }
    }
  }
  return true;
}

function readScript(code: string): ScriptModel {
  const model: ScriptModel = {
    props: new Map(),
    state: new Map(),
    computed: new Map(),
    consts: new Map(),
    unsupported: [],
  };
  for (const st of statements(code)) {
    if (/^import\s[\s\S]*from\s+['"]vue['"]$/.test(st) || /^import\s+type\s/.test(st)) continue;
    if (/^(export\s+)?(interface|type)\s/.test(st)) continue;
    let m =
      /^(?:const\s+\w+\s*=\s*)?(?:withDefaults\(\s*)?defineProps(?:<\s*(\{[\s\S]*\})\s*>)?\(\s*([\s\S]*?)\s*\)\s*(?:,\s*(\{[\s\S]*\})\s*\))?$/.exec(
        st,
      );
    if (m) {
      if (m[1]) for (const k of m[1].matchAll(/([\w$]+)\??\s*:/g)) model.props.set(k[1]!, null);
      if (m[2]) propsFrom(m[2], model.props);
      if (m[3]) {
        const defaults = new Map<string, string | null>();
        propsFrom(
          `{${m[3].slice(1, -1).replace(/([\w$]+)\s*:\s*([^,]+)/g, "$1: { default: $2 }")}}`,
          defaults,
        );
        for (const [k, v] of defaults) model.props.set(k, v);
      }
      continue;
    }
    m = /^const\s+([\w$]+)\s*=\s*(?:ref|shallowRef)\(\s*([\s\S]*?)\s*\)$/.exec(st);
    if (m) {
      model.state.set(m[1]!, m[2] || "undefined");
      continue;
    }
    m = /^const\s+([\w$]+)\s*=\s*computed\(\s*\(\s*\)\s*=>\s*([\s\S]+?)\s*\)$/.exec(st);
    if (m) {
      model.computed.set(m[1]!, m[2]!);
      continue;
    }
    m = /^const\s+([\w$]+)(?:\s*:\s*[^=]+)?\s*=\s*([\s\S]+)$/.exec(st);
    if (m) {
      try {
        parseExpr(m[2]!);
        model.consts.set(m[1]!, m[2]!);
        continue;
      } catch {
        /* falls through: not a plain value */
      }
    }
    model.unsupported.push(st.split("\n")[0]!.slice(0, 80));
  }
  return model;
}

const KADAL_COMPONENTS = new Set(GENERATED.components.map((c) => c.name));

export function convertVueFile(source: string, o: VueFileOptions): VueFileResult {
  const exportName =
    o.kind === "layout"
      ? `Layout${pascal(o.name)}`
      : o.kind === "layer"
        ? pascal(o.name)
        : pascal(o.name);
  const { template, scripts, styles } = blocks(source);
  const classes = new Set<string>();
  const icons = new Set<string>();
  const helpers = new Set<string>();
  const customClasses = new Set<string>();
  const model = readScript(scripts.map((s) => s.content).join("\n"));
  if (
    scripts.some((s) => !/\bsetup\b/.test(s.attrs)) &&
    scripts.some((s) => /export\s+default/.test(s.content))
  )
    model.unsupported.push("export default { … } (the options API)");
  const stub = model.unsupported.length > 0;
  // A stub's template reads what its script defined: those lines fold into the stub's one line.
  const folded: string[] = [];
  const templateReport: Reporter = stub
    ? (item) => {
        if (item.severity === "info") o.report(item);
        else folded.push(item.what);
      }
    : o.report;

  const props = new Set(model.props.keys());
  const stateNames = new Set(model.state.keys());
  const scopeName = o.kind === "layout" ? "frontmatter" : "p";
  const resolve =
    (locals: Set<string>) =>
    (name: string): string | null => {
      if (locals.has(name)) return name;
      if (name === "props" || name === "$props") return scopeName;
      if (props.has(name)) return `${scopeName}.${name}`;
      if (stub) return null;
      if (stateNames.has(name) || model.computed.has(name) || model.consts.has(name)) return name;
      return null;
    };
  const special = (path: string): string | null | undefined => {
    if (o.kind === "layer") {
      if (/^(\$slidev\.nav\.currentPage|\$page|\$nav\.currentPage)$/.test(path))
        return "props.page";
      if (/^(\$slidev\.nav\.total|\$nav\.total)$/.test(path)) return "props.total";
      if (/^(\$clicks|\$slidev\.nav\.clicks|\$nav\.clicks)$/.test(path)) return "props.click";
      if (/^(\$slidev\.nav\.currentLayout|\$nav\.currentLayout)$/.test(path)) return "props.layout";
      if (/^(\$slidev\.nav\.isPresenter|\$nav\.isPresenter)$/.test(path))
        return '(props.view === "presenter")';
      if (path === "$frontmatter") return "(props.slide?.frontmatter ?? {})";
      const fm = /^\$frontmatter\.([\w$]+)$/.exec(path);
      if (fm) return `props.slide?.frontmatter?.${fm[1]}`;
    }
    if (o.kind === "layout") {
      if (path === "$frontmatter") return "frontmatter";
      const fm = /^\$frontmatter\.([\w$]+)$/.exec(path);
      if (fm) return `frontmatter.${fm[1]}`;
    }
    return undefined;
  };
  const dynamic = (expr: string, locals: Set<string>) =>
    translateExpr(expr, resolve(locals), special);
  const dynamicClass = (expr: string, locals: Set<string>) =>
    translateClass(expr, resolve(locals), special);
  const handler = (expr: string, locals: Set<string>): string | null => {
    if (stub) return null;
    const e = expr.trim().replace(/;$/, "");
    let m = /^(\+\+|--)?\s*([\w$]+)\s*(\+\+|--)?$/.exec(e);
    if (m && (m[1] || m[3]) && stateNames.has(m[2]!)) {
      const op = (m[1] ?? m[3]) === "++" ? "+" : "-";
      return `() => set${pascal(m[2]!)}((v) => v ${op} 1)`;
    }
    m = /^([\w$]+)(?:\.value)?\s*([+\-*/%]?=)\s*([\s\S]+)$/.exec(e);
    if (m && stateNames.has(m[1]!) && m[2] !== "==") {
      const rhs = translateExpr(m[3]!, resolve(locals), special);
      if (rhs === null) return null;
      const operand = /^[\w$.]+$/.test(rhs) ? rhs : `(${rhs})`;
      return m[2] === "="
        ? `() => set${pascal(m[1]!)}(${rhs})`
        : `() => set${pascal(m[1]!)}((v) => v ${m[2]![0]} ${operand})`;
    }
    return null;
  };

  let usesSlots = false;
  const slot = (name: string | null): string => {
    if (o.kind === "layer") return "";
    if (!name || name === "default")
      return o.kind === "layout"
        ? "{slots.default}"
        : `{${scopeName === "p" ? "p" : "props"}.children}`;
    usesSlots = true;
    return `{slots[${JSON.stringify(name)}]}`;
  };

  const scoped = styles.some((s) => /\bscoped\b/.test(s.attrs));
  const scopeClass = `slidev-c-${o.name.replace(/[^\w-]/g, "-")}`;
  const rootClass =
    o.kind === "component"
      ? [scoped ? JSON.stringify(scopeClass) : null, "p.className"].filter(Boolean).join(", ")
      : o.kind === "layout"
        ? JSON.stringify(`deck-layout deck-layout-${o.name}${scoped ? ` ${scopeClass}` : ""}`)
        : scoped
          ? JSON.stringify(scopeClass)
          : undefined;

  const templateText = dedent(template?.content ?? "");
  let jsx = "";
  try {
    jsx = convertMarkup(templateText, {
      report: templateReport,
      lineAt: (offset) => source.slice(0, (template?.start ?? 0) + offset).split("\n").length,
      scale: o.scale,
      scope: {},
      classes,
      icons,
      helpers,
      components: o.components,
      clickAnimation: [],
      dragNames: new Set(),
      notes: true,
      mode: "tsx",
      dynamic,
      dynamicClass,
      handler,
      slot,
      rootClass,
    });
  } catch (e) {
    o.report({
      severity: "error",
      what: `The template of ${o.name}.vue could not be converted: ${String(e)}`,
    });
    jsx = "";
  }

  if (stub)
    o.report({
      severity: "error",
      what: `${o.name}.vue has script logic the importer does not convert (${model.unsupported.slice(0, 3).join("; ")}); it is a stub that renders its markup${folded.length ? `, without the ${folded.length} binding${folded.length > 1 ? "s" : ""} and expression${folded.length > 1 ? "s" : ""} that read its script` : ""}.`,
      suggestion: `Finish it by hand in its .tsx (marked TODO).`,
    });

  // the component's CSS: Vue's `scoped` becomes a class on the root
  let css: string | null = null;
  if (styles.length) {
    const parts: string[] = [];
    for (const s of styles) {
      const { css: next, unknown } = convertCss(s.content, o.scale);
      if (unknown.length)
        o.report({
          severity: "warning",
          what: `@apply in ${o.name}.vue names classes the importer has no CSS for: ${unknown.join(", ")}.`,
        });
      for (const m of next.matchAll(/\.([A-Za-z_][\w-]*)/g)) customClasses.add(m[1]!);
      if (/\bscoped\b/.test(s.attrs)) {
        const sc = scopeCss(next, `.${scopeClass}`);
        parts.push([...sc.imports, ...sc.hoisted, ...sc.rules].join("\n"));
      } else parts.push(next);
    }
    css = `/* ${o.name}.vue's <style>, converted by kadal-deck import slidev${scoped ? ` (scoped to .${scopeClass})` : ""}. */\n${parts.join("\n")}\n`;
  }

  // imports: Kadal's components used in the JSX, the deck's own, the helpers
  const used = new Set([...jsx.matchAll(/<([A-Z][\w]*)/g)].map((m) => m[1]!));
  const kadal = [...used].filter((n) => KADAL_COMPONENTS.has(n) && !o.components.has(n)).sort();
  const own = [...used].filter((n) => o.components.has(n) && n !== exportName).sort();
  const compat = [...(used.has("SlidevOn") ? ["SlidevOn"] : []), ...(usesSlots ? ["slotsOf"] : [])];
  if (usesSlots) helpers.add("slotsOf");
  const reactImports = [
    ...(model.state.size && !stub ? ["useState"] : []),
    ...(used.has("Fragment") ? ["Fragment"] : []),
    "type ReactNode",
  ];
  const where = o.kind === "layer" ? "./" : "../";
  const importLines = [
    `import { ${reactImports.join(", ")} } from "react";`,
    ...(o.kind === "layout" ? [`import type { LayoutProps } from "@kadal/deck";`] : []),
    ...(o.kind === "layer" ? [`import type { LayerProps } from "@kadal/deck";`] : []),
    ...(kadal.filter((n) => n !== "Fragment").length
      ? [`import { ${kadal.filter((n) => n !== "Fragment").join(", ")} } from "@kadal/deck";`]
      : []),
    ...own.map(
      (n) =>
        `import { ${n} } from "${o.kind === "layer" ? "./components/" : o.kind === "layout" ? "../components/" : "./"}${n}.tsx";`,
    ),
    ...(compat.length ? [`import { ${compat.join(", ")} } from "${where}slidev.tsx";`] : []),
    ...(css
      ? [
          `import "./${o.kind === "layout" || o.kind === "component" ? exportName : pascal(o.name)}.css";`,
        ]
      : []),
  ];

  const propType = [...model.props].map(([k, def]) => `  ${k}?: ${typeOfDefault(def)};`).join("\n");
  const body: string[] = [];
  if (o.kind === "component") {
    const defaults = [...model.props].filter(([, d]) => d !== null).map(([k, d]) => `${k}: ${d}`);
    body.push(
      defaults.length ? `  const p = { ${defaults.join(", ")}, ...props };` : "  const p = props;",
    );
  }
  if (o.kind === "layout" && usesSlots) body.push("  const slots = slotsOf(children);");
  if (o.kind === "layout" && !usesSlots) body.push("  const slots = { default: children };");
  if (o.kind === "component" && usesSlots) body.push("  const slots = slotsOf(p.children);");
  if (!stub) {
    for (const [k, init] of model.state) {
      const js = translateExpr(init, resolve(new Set()), special) ?? "undefined";
      body.push(`  const [${k}, set${pascal(k)}] = useState(${js});`);
    }
    for (const [k, v] of model.consts)
      body.push(`  const ${k} = ${translateExpr(v, resolve(new Set()), special) ?? toJs(null)};`);
    for (const [k, v] of model.computed)
      body.push(`  const ${k} = ${translateExpr(v, resolve(new Set()), special) ?? "undefined"};`);
  }
  const text = `${body.join("\n")}\n${jsx}`;
  const uses = (name: string) => new RegExp(`\\b${name}\\b`).test(text);
  const signature =
    o.kind === "layout"
      ? `export default function ${exportName}({ ${uses("frontmatter") ? "frontmatter, " : ""}children }: LayoutProps)`
      : o.kind === "layer"
        ? `export default function ${exportName}(${uses("props") ? "props" : "_props"}: LayerProps)`
        : `export function ${exportName}(props: ${exportName}Props)`;
  const header = `/**
 * ${o.kind === "layer" ? `The ${o.name} layer` : o.kind === "layout" ? `The ${o.name} layout` : `<${exportName}>`}, converted from ${o.kind === "component" ? "components/" : o.kind === "layout" ? "layouts/" : ""}${o.name}.vue by \`kadal-deck import slidev\`.${
   stub
     ? `
 *
 * TODO: the Vue file's script did more than the importer converts (${model.unsupported.slice(0, 3).join("; ").replace(/\*\//g, "* /")}).
 * This is a stub with the template's markup; add the behaviour here.`
     : ""
 }
 */`;
  const typeDecl =
    o.kind === "component"
      ? `\nexport interface ${exportName}Props {\n${propType ? `${propType}\n` : ""}  className?: string;\n  children?: ReactNode;\n  [key: string]: unknown;\n}\n`
      : "";
  const tsx = `${header}
${importLines.join("\n")}
${typeDecl}
${signature} {
${body.join("\n")}${body.length ? "\n" : ""}  return (
    <>
${indent(jsx.trim(), 6)}
    </>
  );
}
`;
  return { tsx, css, exportName, classes, icons, helpers, customClasses, stub };
}

/** Template text with its common indentation removed (lines keep their count). */
function dedent(text: string): string {
  const lines = text.split("\n");
  const widths = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const min = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(Math.min(min, /^[ \t]*/.exec(l)![0].length))).join("\n");
}

function indent(text: string, n: number): string {
  const pad = " ".repeat(n);
  return text
    .split("\n")
    .map((l) => (l.trim() ? pad + l : ""))
    .join("\n");
}

function typeOfDefault(def: string | null): string {
  if (def === null) return "any";
  if (/^-?\d/.test(def)) return "number";
  if (/^['"`]/.test(def)) return "string";
  if (def === "true" || def === "false") return "boolean";
  if (def.startsWith("[")) return "any[]";
  return "any";
}
