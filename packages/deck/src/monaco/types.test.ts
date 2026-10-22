import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  localTypePackages,
  localTypes,
  monacoSources,
  typeRequests,
} from "../vite/monaco-types.ts";
import { declarationCandidates, entryCandidates } from "./dts-graph.ts";
import { bareImport, resolveBareImports } from "./run-js.ts";
import {
  type MonacoTypesOptions,
  createTypeAcquirer,
  importedPackages,
  monacoTypesOptions,
  packageList,
  packageOf,
  specifiersOf,
  typesPackageOf,
} from "./types.ts";
import { runImportResolver } from "./types-config.ts";

const opts = (o: Partial<MonacoTypesOptions> = {}): MonacoTypesOptions => ({
  source: "cdn",
  versions: {},
  packages: [],
  ignore: [],
  ...o,
});

describe("what code imports", () => {
  test("specifiers: imports, re-exports, dynamic imports, require, type references; not comments", () => {
    const code = [
      `import { z } from "zod"`,
      `import type { Plugin } from 'vite'`,
      `import "./side-effect.css"`,
      `export * from "@scope/pkg/sub"`,
      `const m = await import("lodash-es/debounce")`,
      `import fs = require("node:fs")`,
      `/// <reference types="vite/client" />`,
      `// import { no } from "commented"`,
      `/* import { nor } from "blocked" */`,
      `const url = "https://example.com/x.js"`,
    ].join("\n");
    expect(specifiersOf(code).sort()).toEqual(
      [
        "./side-effect.css",
        "@scope/pkg/sub",
        "lodash-es/debounce",
        "node:fs",
        "vite",
        "vite/client",
        "zod",
      ].sort(),
    );
    expect(importedPackages(code)).toEqual([
      "vite",
      "zod",
      "@scope/pkg",
      "lodash-es",
      "@types/node",
    ]);
  });

  test("package names: subpaths, scopes, Node's own modules, URLs and relatives", () => {
    expect(packageOf("lodash/fp")).toBe("lodash");
    expect(packageOf("@a/b/c")).toBe("@a/b");
    expect(packageOf("fs")).toBe("@types/node");
    expect(packageOf("node:path")).toBe("@types/node");
    expect(packageOf("./x")).toBeNull();
    expect(packageOf("https://esm.sh/zod")).toBeNull();
    expect(packageOf("#internal")).toBeNull();
    expect(typesPackageOf("@a/b")).toBe("@types/a__b");
    expect(typesPackageOf("lodash")).toBe("@types/lodash");
  });

  test("the deck's settings, and Slidev's spellings of them", () => {
    expect(monacoTypesOptions({})).toEqual(opts({ source: "auto" }));
    expect(
      monacoTypesOptions({
        monacoTypes: "cdn",
        monacoPackages: { zod: "^3.23", "lodash-es": 4 },
        monacoTypesIgnore: ["left-pad"],
      }),
    ).toEqual(
      opts({
        versions: { zod: "^3.23", "lodash-es": "4" },
        packages: ["zod", "lodash-es"],
        ignore: ["left-pad"],
      }),
    );
    expect(
      monacoTypesOptions({
        monacoTypesSource: "ata",
        monacoTypesAdditionalPackages: ["@vueuse/core@10", "vue"],
        monacoTypesIgnorePackages: ["x"],
      }),
    ).toEqual(
      opts({
        versions: { "@vueuse/core": "10" },
        packages: ["@vueuse/core", "vue"],
        ignore: ["x"],
      }),
    );
    expect(monacoTypesOptions({ monacoTypes: false }).source).toBe("none");
    expect(monacoTypesOptions({ monacoTypesSource: "local" }).source).toBe("local");
    expect(packageList(["a", "", 3, "@s/p@1.2"]).names).toEqual(["a", "@s/p"]);
  });
});

/** A fake jsDelivr: packages by name → { version, files: path → text }. */
function fakeCdn(pkgs: Record<string, { version: string; files: Record<string, string> }>) {
  const asked: string[] = [];
  let online = true;
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (!online) throw new TypeError("Failed to fetch");
    const ok = (body: unknown) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
    let m =
      /^https:\/\/data\.jsdelivr\.com\/v1\/packages\/npm\/(.+)\/resolved\?specifier=(.+)$/.exec(
        url,
      );
    if (m) return ok({ version: pkgs[m[1]!]?.version ?? null });
    m = /^https:\/\/data\.jsdelivr\.com\/v1\/packages\/npm\/(.+)@([^@?]+)\?structure=flat$/.exec(
      url,
    );
    if (m) {
      const p = pkgs[m[1]!];
      return p
        ? ok({ files: Object.entries(p.files).map(([name, t]) => ({ name, size: t.length })) })
        : new Response("", { status: 404 });
    }
    m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(.+?)@([^/]+)(\/.*)$/.exec(url);
    if (m) {
      const text = pkgs[m[1]!]?.files[m[3]!];
      return text === undefined ? new Response("", { status: 404 }) : ok(text);
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, asked, offline: () => (online = false) };
}

describe("type acquisition from the CDN", () => {
  test("a package's declarations and package.json land under /node_modules, and what they import follows", async () => {
    const cdn = fakeCdn({
      zod: {
        version: "3.23.8",
        files: {
          "/package.json": `{"name":"zod","types":"index.d.ts","dependencies":{"dep":"^1"}}`,
          "/index.d.ts": `export * from "./lib/types"; import type { D } from "dep";`,
          "/lib/types.d.ts": "export declare const z: number;",
          "/unreached.d.ts": "nothing imports this",
          "/index.js": "not fetched",
        },
      },
      dep: {
        version: "1.0.0",
        files: { "/package.json": "{}", "/index.d.ts": `import "zod"; export type D = 1;` },
      },
    });
    const added: string[] = [];
    const t = createTypeAcquirer({
      add: (f) => added.push(f.path),
      fetch: cdn.fetchFn,
      warn: () => {},
    });
    expect(await t.acquire(`import { z } from "zod"`, opts())).toEqual(["zod"]);
    await t.idle();
    expect(added.sort()).toEqual([
      "/node_modules/dep/index.d.ts",
      "/node_modules/dep/package.json",
      "/node_modules/zod/index.d.ts",
      "/node_modules/zod/lib/types.d.ts",
      "/node_modules/zod/package.json",
    ]);
    // The dependency's range came from zod's package.json; the cycle back to zod costs nothing.
    expect(cdn.asked).toContain(
      "https://data.jsdelivr.com/v1/packages/npm/dep/resolved?specifier=%5E1",
    );
    expect(cdn.asked.some((u) => u.endsWith("/index.js") || u.endsWith("/unreached.d.ts"))).toBe(
      false,
    );
    // Asked again (another editor, an edit): nothing is fetched twice.
    const before = cdn.asked.length;
    await t.acquire(`import { z } from "zod"`, opts());
    expect(cdn.asked.length).toBe(before);
  });

  test("exports: the entry for each subpath the code imports, and a later subpath walks on", async () => {
    const cdn = fakeCdn({
      zod: {
        version: "4.0.0",
        files: {
          "/package.json": JSON.stringify({
            exports: {
              ".": {
                import: { types: "./index.d.ts", default: "./index.js" },
                require: "./index.cjs",
              },
              "./mini": { types: "./mini/index.d.ts" },
              "./locales/*": "./locales/*.js",
            },
          }),
          "/index.d.ts": `export * from "./v4/classic.js";`,
          "/index.d.cts": "the require twin: not fetched",
          "/v4/classic.d.ts": "export declare const object: unknown;",
          "/mini/index.d.ts": "export declare const mini: 1;",
          "/locales/en.d.ts": "export {};",
          "/locales/fr.d.ts": "export {};",
        },
      },
    });
    const added: string[] = [];
    const t = createTypeAcquirer({
      add: (f) => added.push(f.path),
      fetch: cdn.fetchFn,
      warn: () => {},
    });
    await t.acquire(`import { z } from "zod"`, opts());
    await t.idle();
    expect(added.sort()).toEqual([
      "/node_modules/zod/index.d.ts",
      "/node_modules/zod/package.json",
      "/node_modules/zod/v4/classic.d.ts",
    ]);
    await t.acquire(`import { mini } from "zod/mini"; import en from "zod/locales/en"`, opts());
    await t.idle();
    expect(added).toContain("/node_modules/zod/mini/index.d.ts");
    expect(added).toContain("/node_modules/zod/locales/en.d.ts");
    expect(added).not.toContain("/node_modules/zod/locales/fr.d.ts");
  });

  test("no declarations of its own: @types/<pkg>; pinned versions; ignored packages", async () => {
    const cdn = fakeCdn({
      lodash: { version: "4.17.21", files: { "/package.json": "{}", "/lodash.js": "" } },
      "@types/lodash": {
        version: "4.17.0",
        files: { "/index.d.ts": "export declare function chunk(): void;" },
      },
      skipped: { version: "1.0.0", files: { "/index.d.ts": "" } },
    });
    const added: string[] = [];
    const t = createTypeAcquirer({
      add: (f) => added.push(f.path),
      fetch: cdn.fetchFn,
      warn: () => {},
    });
    await t.acquire(
      `import _ from "lodash"; import s from "skipped"`,
      opts({ versions: { lodash: "4.17.21" }, ignore: ["skipped"] }),
    );
    await t.idle();
    expect(added).toEqual(["/node_modules/@types/lodash/index.d.ts"]);
    expect(cdn.asked[0]).toBe(
      "https://data.jsdelivr.com/v1/packages/npm/lodash/resolved?specifier=4.17.21",
    );
    expect(cdn.asked.some((u) => u.includes("skipped"))).toBe(false);
  });

  test("offline: nothing added, a warning, no throw; `none` asks nothing", async () => {
    const cdn = fakeCdn({});
    cdn.offline();
    const warnings: string[] = [];
    const t = createTypeAcquirer({
      add: () => {},
      fetch: cdn.fetchFn,
      warn: (m) => warnings.push(m),
    });
    expect(await t.acquire(`import { z } from "zod"`, opts())).toEqual([]);
    expect(warnings.join()).toContain("zod");
    const none = createTypeAcquirer({ add: () => {}, fetch: cdn.fetchFn });
    const n = cdn.asked.length;
    expect(await none.acquire(`import { z } from "zod"`, opts({ source: "none" }))).toEqual([]);
    expect(cdn.asked.length).toBe(n);
  });

  test("the deck's own declarations come first, and `local` never touches the network", async () => {
    const cdn = fakeCdn({ zod: { version: "3.0.0", files: { "/index.d.ts": "" } } });
    const added: string[] = [];
    const t = createTypeAcquirer({
      add: (f) => added.push(f.path),
      fetch: cdn.fetchFn,
      local: (pkg) =>
        pkg === "zod"
          ? async () => [{ path: "/node_modules/zod/index.d.ts", text: "local" }]
          : null,
      warn: () => {},
    });
    await t.acquire(`import { z } from "zod"; import x from "other"`, opts({ source: "local" }));
    expect(added).toEqual(["/node_modules/zod/index.d.ts"]);
    expect(cdn.asked).toEqual([]);
  });
});

describe("local types, from the deck's node_modules", () => {
  const here = join(import.meta.dir, "..", "..");

  test("a package's declarations and those of the packages they import, found as Node finds them", async () => {
    const files = (await localTypes("unist-util-visit", here))!;
    const paths = files.map((f) => f.path);
    expect(paths).toContain("/node_modules/unist-util-visit/package.json");
    expect(paths).toContain("/node_modules/unist-util-visit/index.d.ts");
    // unist-util-visit's declarations import unist-util-visit-parents and @types/unist.
    expect(paths.some((p) => p.startsWith("/node_modules/unist-util-visit-parents/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/node_modules/@types/unist/"))).toBe(true);
    expect(paths.every((p) => p.endsWith("package.json") || /\.d\.[mc]?ts$/.test(p))).toBe(true);
    expect(await localTypes("no-such-package-anywhere", here)).toBeNull();
    // Only what the entries reach: zod's 250-odd declarations are far more than its root needs.
    const zod = (await localTypes("zod", here))!.filter((f) =>
      f.path.startsWith("/node_modules/zod/"),
    );
    expect(zod.length).toBeGreaterThan(3);
    // …and one tree of its twins: zod's `types` condition names index.d.cts, so TypeScript
    // reads the .d.cts files and never their .d.ts copies.
    expect(zod.some((f) => f.path.endsWith(".d.cts"))).toBe(true);
    expect(zod.some((f) => /[^c]\.d\.ts$/.test(f.path) && f.path.includes("/v4/"))).toBe(false);
    expect(zod.some((f) => f.path.includes("/v3/"))).toBe(false);
  });

  test("the editors' imports that are installed", () => {
    const sources = monacoSources([
      "```ts {monaco}\nimport { z } from 'zod'\nimport x from 'not-installed-pkg'\n```\n\n```ts\nimport v from 'vite'\n```",
    ]);
    expect(sources).toEqual(["import { z } from 'zod'\nimport x from 'not-installed-pkg'"]);
    expect(localTypePackages(sources, ["yaml"], here)).toEqual(["yaml", "zod"]);
    expect(localTypePackages(sources, [], here, ["zod"])).toEqual([]);
  });
});

describe("declaration entries", () => {
  test("module paths become the declarations TypeScript would try", () => {
    expect(declarationCandidates("/a/b.js")).toEqual(["/a/b.d.ts", "/a/b.d.cts", "/a/b.d.mts"]);
    expect(declarationCandidates("./x/../y.cjs")).toEqual(["/y.d.cts", "/y.d.ts"]);
    expect(declarationCandidates("/lib")).toContain("/lib/index.d.ts");
    expect(declarationCandidates("/t.d.mts")).toEqual(["/t.d.mts"]);
  });

  test("package.json: exports (types first, wildcards), else types / main / index", () => {
    const pkg = {
      exports: {
        ".": { import: { types: "./dist/index.d.mts" }, default: "./dist/index.js" },
        "./sub/*": "./dist/sub/*.js",
      },
    };
    expect(entryCandidates(pkg, "")[0]).toBe("/dist/index.d.mts");
    expect(entryCandidates(pkg, "")).toContain("/dist/index.d.ts");
    expect(entryCandidates(pkg, "sub/a")[0]).toBe("/dist/sub/a.d.ts");
    expect(entryCandidates({ types: "lib/main.d.ts" }, "")[0]).toBe("/lib/main.d.ts");
    expect(entryCandidates({}, "")).toContain("/index.d.ts");
    expect(entryCandidates({ exports: "./only.js" }, "")[0]).toBe("/only.d.ts");
  });

  test("what the editors ask of each package", () => {
    const asks = typeRequests([`import { z } from "zod"; import m from "zod/mini"`], ["yaml"]);
    expect([...asks]).toEqual([
      ["yaml", [""]],
      ["zod", ["", "mini"]],
    ]);
  });
});

describe("{monaco-run} imports", () => {
  test("bare specifiers become CDN URLs, pinned where the deck pins them", () => {
    const esm = runImportResolver(undefined, { zod: "3.23.8" })!;
    expect(esm("zod")).toBe("https://esm.sh/zod@3.23.8");
    expect(esm("lodash-es/debounce")).toBe("https://esm.sh/lodash-es/debounce");
    expect(esm("fs")).toBeNull();
    const jsd = runImportResolver("https://cdn.jsdelivr.net/npm/{name}@{version}{path}/+esm", {})!;
    expect(jsd("@scope/pkg/sub")).toBe("https://cdn.jsdelivr.net/npm/@scope/pkg@latest/sub/+esm");
    expect(runImportResolver(false, {})).toBeNull();
    expect(runImportResolver("javascript:alert(1)", {})).toBeNull();
  });

  test("the rewrite touches imports only, and reports what it cannot resolve", () => {
    const code = [
      `import { z } from "zod";`,
      `import "./local.js";`,
      `export { a } from 'pkg/sub';`,
      `const m = await import("dyn");`,
      `const s = "import x from 'not-an-import'";`,
      `import u from "https://example.com/u.js";`,
    ].join("\n");
    const r = resolveBareImports(code, runImportResolver(undefined, {})!);
    expect(r.unresolved).toBeNull();
    expect(r.code).toContain(`from "https://esm.sh/zod"`);
    expect(r.code).toContain(`from 'https://esm.sh/pkg/sub'`);
    expect(r.code).toContain(`import("https://esm.sh/dyn")`);
    expect(r.code).toContain(`import "./local.js"`);
    expect(r.code).toContain(`"https://example.com/u.js"`);
    expect(bareImport(r.code)).toBeNull();
    expect(
      resolveBareImports(`import fs from "node:fs"`, runImportResolver(undefined, {})!).unresolved,
    ).toBe("node:fs");
  });
});
