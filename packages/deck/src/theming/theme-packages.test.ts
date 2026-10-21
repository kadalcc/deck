import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { THEME_PACKAGES } from "../catalog/reference.ts";
import { registryCode, scanPackages } from "../vite/packages.ts";
import { normalizeModule, readMeta } from "./contract.ts";
import { LAYOUT_CLASSES, THEME_TOKENS } from "./scaffold.ts";

/**
 * The first-party theme packages (packages/theme-*) against the contract in THEMES.md and the
 * catalog's THEME_PACKAGES list: the metadata, every token in every scheme the theme draws, every
 * layout class, nothing global, the assets its stylesheet points at, and a module that adds
 * exactly the layouts and components its package.json names.
 */

const repo = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const packagesDir = join(repo, "packages");

/** The stylesheet without comments, so a word in prose never passes for a rule. */
function cssOf(name: string): string {
  return readFileSync(join(packagesDir, `theme-${name}`, "style.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

/** Every selector of every rule (comma lists split), outside @-rule preludes. */
function selectors(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const prelude = m[1]!.trim();
    if (!prelude || prelude.startsWith("@")) continue;
    // split on commas that are not inside :is(…) / :not(…)
    let depth = 0;
    let cur = "";
    for (const ch of prelude) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

/** The declarations of the first rule whose selector is exactly this. */
function block(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) return "";
  return css.slice(i, css.indexOf("}", i));
}

describe("first-party theme packages", () => {
  test("every packages/theme-* is in the catalog, and only those", () => {
    const found = scanPackages({ dirs: [packagesDir], match: /^theme-/ })
      .filter((f) => f.kind === "theme")
      .map((f) => readMeta("theme", f.pkg, "").name);
    expect(found.sort()).toEqual(THEME_PACKAGES.map((t) => t.name).sort());
  });

  for (const t of THEME_PACKAGES) {
    describe(t.package, () => {
      const root = join(packagesDir, `theme-${t.name}`);
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
        string,
        any
      >;
      const meta = readMeta("theme", pkg, t.name) as ReturnType<typeof readMeta> & {
        colorScheme: string;
        shiki?: { light?: string; dark?: string };
      };

      test("package.json follows the contract and matches the catalog", () => {
        expect(pkg.name).toBe(t.package);
        expect(pkg.keywords).toContain("kadal-theme");
        expect(pkg.type).toBe("module");
        expect(pkg.exports["./style.css"]).toBe("./style.css");
        expect(pkg.exports["."]).toBe("./index.tsx");
        expect(pkg.publishConfig?.access).toBe("public");
        expect(meta.name).toBe(t.name);
        expect(meta.colorScheme).toBe(t.scheme);
        expect([...(meta.layouts ?? [])].sort()).toEqual([...t.layouts].sort());
        expect([...(meta.components ?? [])].sort()).toEqual([...t.components].sort());
        expect(meta.shiki?.light).toBeTruthy();
        expect(meta.shiki?.dark).toBeTruthy();
        for (const f of pkg.files as string[]) expect(existsSync(join(root, f))).toBe(true);
      });

      test("a port names its Slidev original and carries its MIT notice", () => {
        if (!t.slidev) return;
        const licence = readFileSync(join(root, "LICENSE"), "utf8");
        expect(pkg.license).toBe("MIT");
        expect(licence).toContain("Copyright (c) 2021 Slidev.js Team");
        expect(readFileSync(join(root, "README.md"), "utf8")).toContain("Slidev.js Team");
      });

      test("the stylesheet sets every token, in each scheme it draws", () => {
        const css = cssOf(t.name);
        const base = block(css, `.theme-${t.name}`);
        expect(base).not.toBe("");
        for (const [token] of THEME_TOKENS) expect(base).toContain(`${token}:`);
        if (t.scheme === "both") {
          const dark = block(css, `.theme-${t.name}[data-color-scheme="dark"]`);
          for (const token of ["--deck-bg", "--deck-fg", "--deck-muted", "--deck-code-bg"])
            expect(dark).toContain(`${token}:`);
        }
      });

      test("the stylesheet styles every layout class and nothing outside the theme", () => {
        const css = cssOf(t.name);
        for (const l of LAYOUT_CLASSES)
          expect(
            new RegExp(`\\.deck-layout-${l}(?![\\w-])|\\.layout-${l}(?![\\w-])`).test(css),
          ).toBe(true);
        for (const s of selectors(css)) expect(s.startsWith(`.theme-${t.name}`)).toBe(true);
      });

      test("every url() in the stylesheet is a file in the package", () => {
        const css = cssOf(t.name);
        for (const m of css.matchAll(/url\("?(\.[^")]+)"?\)/g)) {
          const file = join(root, m[1]!);
          expect(existsSync(file)).toBe(true);
          expect((pkg.files as string[]).some((f) => m[1]!.slice(2).startsWith(f))).toBe(true);
        }
      });

      test("the module adds exactly the layouts and components package.json names", async () => {
        const mod = normalizeModule(await import(join(root, "index.tsx")));
        expect(Object.keys(mod?.layouts ?? {}).sort()).toEqual([...t.layouts].sort());
        expect(Object.keys(mod?.components ?? {}).sort()).toEqual([...t.components].sort());
      });

      test("the shell's registry bundles it, stylesheet and module", () => {
        const code = registryCode(
          scanPackages({ packages: [root] }).filter((f) => f.kind === "theme"),
        );
        expect(code).toContain(`registerTheme({ name: ${JSON.stringify(t.name)}`);
        expect(code).toContain(join(root, "style.css").replace(/\\/g, "/"));
        expect(code).toContain(join(root, "index.tsx").replace(/\\/g, "/"));
      });

      test("the preview deck uses the package from its folder", () => {
        const deck = readFileSync(join(root, "preview", "deck.mdx"), "utf8");
        expect(deck).toMatch(/^---\n[\s\S]*?\ntheme: \.\.\/\n/);
      });
    });
  }
});
