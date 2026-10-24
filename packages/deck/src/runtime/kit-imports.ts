import { visit } from "unist-util-visit";

import { dirOf, joinPath } from "../authoring/source.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTS IN THE BROWSER: a deck's own modules, from its kit's module map
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The runtime compiler has no bundler, so `import Chart from "./components/Chart.tsx"` cannot be
 * resolved in the page. A deck's editing kit (`kadal-deck publish`, KADAL_DECK_TARGET=host) brings
 * every module the deck's MDX imported at its last CLI build, pre-bundled and registered under
 * its key (MODULE KEYS below). This remark pass rewrites each import of a slide into a read from
 * that map — `const { default: Chart } = arguments[0].__kadalModules["./components/Chart.tsx"]`,
 * the run options of MDX's function-body output — so the slide compiles exactly as it did in the
 * build. An import the map does not have fails the slide with a sentence saying what to do.
 *
 * MODULE KEYS: a relative specifier is resolved against the folder of the file the slide is in
 * and written from the deck's root with a leading "./" (`../components/x.tsx` in
 * `pages/a.mdx` → `./components/x.tsx`); a bare or absolute one is kept as written. The Vite
 * plugin builds the map with the same function (vite/index.ts, kit mode).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ModuleMap = Record<string, unknown>;

/** The map key for `spec` imported from the deck-relative file `from`. */
export function moduleKey(spec: string, from: string): string {
  if (!/^\.\.?\//.test(spec)) return spec;
  const joined = joinPath(dirOf(from), spec);
  return joined.startsWith("../") ? joined : `./${joined}`;
}

/** The sentence a slide shows for an import its kit does not have. */
export function missingModuleMessage(spec: string): string {
  return `\`${spec}\` isn't part of this deck's last CLI build. Add it in your project and run \`kadal-deck publish\`.`;
}

export class MissingModuleError extends Error {
  constructor(readonly spec: string) {
    super(missingModuleMessage(spec));
    this.name = "MissingModuleError";
  }
}

type Node = { type: string; [k: string]: unknown };
const id = (name: string): Node => ({ type: "Identifier", name });
const lit = (value: string): Node => ({ type: "Literal", value, raw: JSON.stringify(value) });
const member = (object: Node, property: Node, computed = false): Node => ({
  type: "MemberExpression",
  object,
  property,
  computed,
  optional: false,
});
const constant = (name: string, init: Node): Node => ({
  type: "VariableDeclaration",
  kind: "const",
  declarations: [{ type: "VariableDeclarator", id: id(name), init }],
});

/** The remark plugin: imports become reads from `arguments[0].__kadalModules`. */
export function remarkKitImports(options: { modules: ModuleMap; from: string }) {
  let n = 0;
  return () => (tree: unknown) => {
    visit(tree as never, "mdxjsEsm", (node: { data?: { estree?: { body: Node[] } } }) => {
      const program = node.data?.estree;
      if (!program) return;
      const body: Node[] = [];
      for (const stmt of program.body) {
        if (stmt.type !== "ImportDeclaration") {
          body.push(stmt);
          continue;
        }
        const spec = String((stmt.source as { value: unknown }).value);
        const key = moduleKey(spec, options.from);
        if (!Object.hasOwn(options.modules, key)) throw new MissingModuleError(spec);
        const local = `__kadal_m${n++}`;
        body.push(
          constant(
            local,
            member(
              member(member(id("arguments"), lit("0") as Node, true), id("__kadalModules")),
              lit(key),
              true,
            ),
          ),
        );
        for (const s of (stmt.specifiers as Node[]) ?? []) {
          const name = (s.local as { name: string }).name;
          if (s.type === "ImportDefaultSpecifier")
            body.push(constant(name, member(id(local), id("default"))));
          else if (s.type === "ImportNamespaceSpecifier") body.push(constant(name, id(local)));
          else {
            const imported = s.imported as { type: string; name?: string; value?: string };
            const key2 = imported.type === "Identifier" ? imported.name! : String(imported.value);
            body.push(constant(name, member(id(local), lit(key2), true)));
          }
        }
      }
      program.body = body;
    });
  };
}
