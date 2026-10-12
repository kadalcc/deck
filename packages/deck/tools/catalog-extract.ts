/**
 * Reads the engine's own source with the TypeScript checker and writes what the catalog must
 * never get wrong by hand: every built-in component and its props (types, defaults, docs),
 * every registered background and the props it reads, the layouts, click effects, transitions,
 * every DeckConfig field, and every frontmatter key the engine reads. `catalog/generated.ts` is
 * this file's output; `bun run catalog` regenerates it and the test fails when it is stale.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as ts from "typescript";

import type {
  GeneratedBackground,
  GeneratedComponent,
  GeneratedData,
  GeneratedField,
  PropInfo,
  TypeVariant,
  ValueShape,
} from "../src/catalog/types.ts";

const pkg = resolve(import.meta.dirname, "..");
const src = join(pkg, "src");
const rel = (file: string) => relative(pkg, file).split("\\").join("/");

function program(files: string[]): ts.Program {
  const cfgPath = join(pkg, "tsconfig.json");
  const cfg = ts.parseJsonConfigFileContent(
    ts.readConfigFile(cfgPath, ts.sys.readFile).config,
    ts.sys,
    pkg,
  );
  return ts.createProgram(files, { ...cfg.options, noEmit: true });
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function docOf(sym: ts.Symbol, checker: ts.TypeChecker): string | undefined {
  const text = clean(ts.displayPartsToString(sym.getDocumentationComment(checker)));
  return text || undefined;
}

/** The JSON forms a TypeScript type accepts. */
function shapeOf(type: ts.Type, checker: ts.TypeChecker, depth = 0): ValueShape {
  const members = type.isUnion() ? type.types : [type];
  const variants: TypeVariant[] = [];
  const strings: string[] = [];
  const numbers: number[] = [];
  const bools = new Set<boolean>();
  let anyString = false;
  let anyNumber = false;
  let opaque = false;
  for (const t of members) {
    const f = t.flags;
    if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Void) continue;
    if (f & ts.TypeFlags.Null) variants.push({ type: "null" });
    else if (t.isStringLiteral()) strings.push(t.value);
    else if (t.isNumberLiteral()) numbers.push(t.value);
    else if (f & ts.TypeFlags.BooleanLiteral) bools.add(checker.typeToString(t) === "true");
    else if (f & ts.TypeFlags.String || f & ts.TypeFlags.TemplateLiteral) anyString = true;
    else if (f & ts.TypeFlags.Number) anyNumber = true;
    else if (t.isIntersection() && t.types.some((m) => m.flags & ts.TypeFlags.String))
      anyString = true; // `string & {}`: an open string with suggestions
    else if (checker.isArrayType(t) || checker.isTupleType(t)) variants.push({ type: "array" });
    else if (f & ts.TypeFlags.Object && !t.getCallSignatures().length) {
      const name = checker.typeToString(t);
      // React's own object types (nodes, elements, CSS) are JSX values, not JSON.
      if (
        /^(ReactElement|ReactPortal|CSSProperties|Iterable|ReactNode|ElementType|Component)/.test(
          name,
        )
      ) {
        opaque = true;
        continue;
      }
      const props = t.getProperties();
      const index = checker.getIndexInfosOfType(t).length > 0;
      if (depth < 1 && props.length && props.length <= 16 && !index) {
        const properties: Record<string, ValueShape> = {};
        for (const p of props) {
          const decl = p.valueDeclaration ?? p.declarations?.[0];
          if (!decl) continue;
          properties[p.name] = shapeOf(
            checker.getTypeOfSymbolAtLocation(p, decl),
            checker,
            depth + 1,
          );
        }
        variants.push({ type: "object", properties });
      } else variants.push({ type: "object" });
    } else opaque = true;
  }
  if (bools.size === 2) variants.unshift({ type: "boolean" });
  else if (bools.size === 1) variants.unshift({ type: "boolean", enum: [...bools] });
  if (anyNumber) variants.unshift({ type: "number" });
  else if (numbers.length) variants.unshift({ type: "number", enum: numbers });
  if (anyString) variants.unshift({ type: "string" });
  else if (strings.length) variants.unshift({ type: "string", enum: strings });
  const text = checker
    .typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
    .replace(/\s*\|\s*undefined\b/g, "")
    .replace(/\bundefined\s*\|\s*/g, "");
  const shape: ValueShape = { text, variants: opaque ? [] : variants };
  if (anyString && strings.length) shape.suggest = strings;
  return shape;
}

/** Default values from a destructured first parameter: `{ effect = "fade-in" }`. */
function defaultsOf(decl: ts.Node | undefined): Map<string, string> {
  const out = new Map<string, string>();
  let fn: ts.SignatureDeclaration | undefined;
  if (!decl) return out;
  if (ts.isFunctionDeclaration(decl) || ts.isArrowFunction(decl) || ts.isFunctionExpression(decl))
    fn = decl;
  else if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const init = decl.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) fn = init;
  }
  const param = fn?.parameters[0];
  if (!param || !ts.isObjectBindingPattern(param.name)) return out;
  for (const el of param.name.elements) {
    if (!el.initializer) continue;
    const key = (el.propertyName ?? el.name).getText();
    out.set(key, clean(el.initializer.getText()));
  }
  return out;
}

function componentsOf(prog: ts.Program): GeneratedComponent[] {
  const checker = prog.getTypeChecker();
  const entry = prog.getSourceFile(join(src, "components", "index.ts"))!;
  const mod = checker.getSymbolAtLocation(entry)!;
  const out: GeneratedComponent[] = [];
  for (const exp of checker.getExportsOfModule(mod)) {
    let sym = exp;
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym.valueDeclaration ?? sym.declarations?.[0];
    if (!decl) continue;
    const type = checker.getTypeOfSymbolAtLocation(sym, decl);
    const sig = type.getCallSignatures()[0];
    if (!sig) continue;
    const defaults = defaultsOf(decl);
    const props: PropInfo[] = [];
    const param = sig.parameters[0];
    let open = false;
    if (param) {
      const pt = checker.getTypeOfSymbolAtLocation(param, decl);
      // An index signature (`[key: string]: unknown`) passes any prop through.
      open = checker.getIndexInfosOfType(pt).length > 0;
      for (const p of pt.getProperties()) {
        const pd = p.valueDeclaration ?? p.declarations?.[0];
        if (pd && /node_modules/.test(pd.getSourceFile().fileName)) continue;
        const info: PropInfo = {
          name: p.name,
          type: shapeOf(checker.getTypeOfSymbolAtLocation(p, pd ?? decl), checker),
          required: !(p.flags & ts.SymbolFlags.Optional),
        };
        const d = defaults.get(p.name);
        if (d !== undefined) info.default = d;
        const doc = docOf(p, checker);
        if (doc) info.description = doc;
        props.push(info);
      }
    }
    const c: GeneratedComponent = {
      name: exp.name,
      file: rel(decl.getSourceFile().fileName),
      props,
    };
    if (open) c.openProps = true;
    if (sym.name !== exp.name && sym.name !== "default") c.aliasOf = sym.name;
    const doc = docOf(sym, checker);
    if (doc) c.description = doc;
    out.push(c);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The text of a call's argument list starting at `open` (the index of "("), brackets balanced. */
function argsAt(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return "";
}

/** The props a background reads, with the fallback it uses for each (`asNum(speed, 1)`). */
function backgroundProps(fn: ts.FunctionDeclaration): PropInfo[] {
  const param = fn.parameters[0];
  if (!param || !ts.isObjectBindingPattern(param.name)) return [];
  const body = fn.body?.getText() ?? "";
  const props: PropInfo[] = [];
  for (const el of param.name.elements) {
    const name = el.name.getText();
    if (name === "active") continue;
    let type: ValueShape = { text: "unknown", variants: [] };
    let def: string | undefined;
    const helper = new RegExp(`\\bas(Num|Str|List)\\(\\s*${name}\\s*,`).exec(body);
    if (helper) {
      const args = argsAt(body, helper.index + helper[0].indexOf("("));
      def = clean(args.slice(args.indexOf(",") + 1));
      type =
        helper[1] === "Num"
          ? { text: "number", variants: [{ type: "number" }] }
          : helper[1] === "Str"
            ? { text: "string", variants: [{ type: "string" }] }
            : { text: "string[] | string", variants: [{ type: "array" }, { type: "string" }] };
    } else {
      const str = new RegExp(`typeof ${name} === "string" \\? ${name} : ([^;]+);`).exec(body);
      if (str) {
        type = { text: "string", variants: [{ type: "string" }] };
        def = clean(str[1]!);
      } else if (
        new RegExp(`${name} !== false`).test(body) ||
        new RegExp(`${name} === true`).test(body)
      )
        type = { text: "boolean", variants: [{ type: "boolean" }] };
    }
    const info: PropInfo = { name, type, required: false };
    if (def !== undefined) info.default = def;
    props.push(info);
  }
  return props;
}

function backgroundsOf(prog: ts.Program): GeneratedBackground[] {
  const checker = prog.getTypeChecker();
  const out: GeneratedBackground[] = [];
  const dir = join(src, "backgrounds");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .sort()) {
    const sf = prog.getSourceFile(join(dir, f))!;
    const fns = new Map<string, ts.FunctionDeclaration>();
    sf.forEachChild((n) => {
      if (ts.isFunctionDeclaration(n) && n.name) fns.set(n.name.text, n);
    });
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "registerBackground"
      ) {
        const [name, comp] = n.arguments;
        if (name && comp && ts.isStringLiteral(name) && ts.isIdentifier(comp)) {
          const fn = fns.get(comp.text);
          const sym = fn?.name ? checker.getSymbolAtLocation(fn.name) : undefined;
          const bg: GeneratedBackground = {
            name: name.text,
            component: comp.text,
            file: rel(sf.fileName),
            props: fn ? backgroundProps(fn) : [],
          };
          const doc = sym ? docOf(sym, checker) : undefined;
          if (doc) bg.description = doc;
          out.push(bg);
        }
      }
      n.forEachChild(visit);
    };
    visit(sf);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function layoutsOf(prog: ts.Program): string[] {
  const sf = prog.getSourceFile(join(src, "react", "layouts.tsx"))!;
  const out: string[] = [];
  sf.forEachChild((n) => {
    if (!ts.isVariableStatement(n)) return;
    for (const d of n.declarationList.declarations) {
      if (d.name.getText() !== "LAYOUTS" || !d.initializer) continue;
      if (!ts.isObjectLiteralExpression(d.initializer)) continue;
      for (const p of d.initializer.properties) {
        const name = p.name;
        if (name) out.push(ts.isStringLiteral(name) ? name.text : name.getText());
      }
    }
  });
  return out;
}

/** The string literals of an exported type alias, in source order. */
function literalsOf(prog: ts.Program, file: string, alias: string): string[] {
  const sf = prog.getSourceFile(join(src, file))!;
  const out: string[] = [];
  sf.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === alias && ts.isUnionTypeNode(n.type)) {
      for (const t of n.type.types)
        if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) out.push(t.literal.text);
    }
  });
  return out;
}

function deckConfigOf(prog: ts.Program): GeneratedField[] {
  const checker = prog.getTypeChecker();
  const sf = prog.getSourceFile(join(src, "core", "model.ts"))!;
  let iface: ts.InterfaceDeclaration | undefined;
  sf.forEachChild((n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === "DeckConfig") iface = n;
  });
  const type = checker.getTypeAtLocation(iface!);
  return type.getProperties().map((p) => {
    const decl = p.valueDeclaration ?? p.declarations![0]!;
    const field: GeneratedField = {
      name: p.name,
      type: shapeOf(checker.getTypeOfSymbolAtLocation(p, decl), checker),
    };
    const doc = docOf(p, checker);
    if (doc) field.description = doc;
    return field;
  });
}

/** Every `fm.key` / `frontmatter.key` / `fm["key"]` the engine reads. */
function frontmatterReadsOf(prog: ts.Program, files: string[]): string[] {
  const checker = prog.getTypeChecker();
  const keys = new Set<string>();
  const name = /(^|\.)(fm|frontmatter)$/;
  // A frontmatter record is open (`Record<string, unknown>`); a local `fm` that is some other
  // object (the splitter's fence result) is not one.
  const owner = {
    test: (e: ts.Expression) =>
      name.test(e.getText()) &&
      checker.getIndexInfosOfType(checker.getTypeAtLocation(e)).length > 0,
  };
  for (const file of files) {
    const sf = prog.getSourceFile(file);
    if (!sf) continue;
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && owner.test(n.expression)) keys.add(n.name.text);
      if (
        ts.isElementAccessExpression(n) &&
        owner.test(n.expression) &&
        ts.isStringLiteral(n.argumentExpression)
      )
        keys.add(n.argumentExpression.text);
      n.forEachChild(visit);
    };
    visit(sf);
  }
  return [...keys].sort();
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );

export function extract(): GeneratedData {
  // The engine itself; the tools that read decks (authoring, cli, mcp) and the catalog are not
  // where options are defined.
  const tooling = ["catalog", "authoring", "cli", "mcp"].map((d) => join(src, d));
  const files = walk(src).filter((f) => !tooling.some((d) => f.startsWith(d)));
  const prog = program(files);
  return {
    components: componentsOf(prog),
    backgrounds: backgroundsOf(prog),
    layouts: layoutsOf(prog),
    clickEffects: literalsOf(prog, "components/Click.tsx", "ClickEffect"),
    transitions: literalsOf(prog, "core/model.ts", "Transition"),
    transitionSpeeds: literalsOf(prog, "core/model.ts", "TransitionSpeed"),
    deckConfig: deckConfigOf(prog),
    frontmatterReads: frontmatterReadsOf(prog, files),
  };
}

export function generatedSource(data: GeneratedData = extract()): string {
  return `// Generated by tools/catalog.ts from the engine's source. Do not edit: run \`bun run catalog\`.
import type { GeneratedData } from "./types.ts";

export const GENERATED: GeneratedData = {
${Object.entries(data)
  .map(
    ([key, list]) =>
      `  ${key}: [\n${(list as unknown[]).map((item) => `    ${JSON.stringify(item)},`).join("\n")}\n  ],`,
  )
  .join("\n")}
};
`;
}

if (import.meta.main) {
  // Inspect without writing: bun tools/catalog-extract.ts | less
  process.stdout.write(generatedSource());
  void readFileSync;
}
