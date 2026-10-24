import { describe, expect, test } from "bun:test";

import { moduleKey } from "../runtime/kit-imports.ts";
import { importsOf, kitModuleCode, slideImports } from "./kit.ts";

describe("the editing kit", () => {
  test("imports are read with MDX's parser, code blocks ignored", () => {
    expect(
      importsOf(
        'import A from "./a.tsx"\nimport { b,\n  c } from "pkg"\n\n# x\n\n```ts\nimport z from "zod"\n```\n',
      ),
    ).toEqual(["./a.tsx", "pkg"]);
    // Broken MDX still gives its import lines.
    expect(importsOf('import A from "./a.tsx"\n\n<div>\n')).toEqual(["./a.tsx"]);
    expect(importsOf("# no imports")).toEqual([]);
  });

  test("keys are deck-relative for relative specifiers, as written for the rest", () => {
    expect(moduleKey("./components/x.tsx", "deck.mdx")).toBe("./components/x.tsx");
    expect(moduleKey("../components/x.tsx", "pages/a.mdx")).toBe("./components/x.tsx");
    expect(moduleKey("lodash/fp", "pages/a.mdx")).toBe("lodash/fp");
    const keys = slideImports(
      [
        { content: 'import X from "./x.tsx"', notes: null, source: { file: "/d/deck.mdx" } },
        { content: 'import X from "../x.tsx"', notes: null, source: { file: "/d/pages/p.mdx" } },
      ],
      "/d",
    );
    expect([...keys.keys()]).toEqual(["./x.tsx"]);
  });

  test("the kit's virtual:deck registers modules and the deck's packages", () => {
    const code = kitModuleCode({
      packages: {
        theme: { kind: "theme", name: "minimal", builtin: true } as never,
        themes: [
          { kind: "theme", name: "minimal", builtin: true } as never,
          {
            kind: "theme",
            name: "mine",
            spec: "./theme",
            package: null,
            builtin: false,
            css: "/d/theme/theme.css",
            module: null,
            meta: { name: "mine" },
          } as never,
        ],
        addons: [],
        layers: {},
        watch: [],
      },
      packagesCode: { imports: "", value: "{ layers: {}, routes: null }" },
      resolved: new Map([["./x.tsx", "/d/x.tsx"]]),
      monaco: null,
      codeRunners: null,
      engine: "0.5.0",
    });
    expect(code).toContain('import * as __kadal_mod_0 from "/d/x.tsx";');
    expect(code).toContain('"./x.tsx": __kadal_mod_0');
    expect(code).toContain('registerTheme({ name: "mine", package: null, aliases: ["./theme"]');
    expect(code).not.toContain('name: "minimal"');
    expect(code).toContain("kitManifest(");
  });
});
