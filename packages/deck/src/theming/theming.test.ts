import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LAYOUTS } from "../react/layouts.tsx";
import { compileDeck } from "../runtime/compile.ts";
import { deckPackageSet, packagesCode, registryCode, scanPackages } from "../vite/packages.ts";
import {
  FIRST_PARTY_THEMES,
  implicitThemes,
  isPathSpec,
  normalizeModule,
  packageCandidates,
  readMeta,
  requestedPackages,
  shortName,
} from "./contract.ts";
import { ejectTheme } from "./eject.ts";
import { googleFamily, resolveFonts } from "./fonts.ts";
import {
  applySlideDefaults,
  fontsForTheme,
  kebab,
  mergeComponents,
  mergeLayers,
  mergeThemeConfig,
  packageConfigLayer,
  shikiThemes,
  slideDefaultLayers,
  themeConfigVars,
} from "./merge.ts";
import { createPackageRegistry, resolveRuntimePackages } from "./registry.ts";
import {
  PackageResolveError,
  bundledTheme,
  deckDefinesTheme,
  listInstalledPackages,
  resolveImplicitTheme,
  resolvePackage,
} from "./resolve.ts";
import {
  LAYOUT_CLASSES,
  THEME_TOKENS,
  addonScaffold,
  scaffoldName,
  themeScaffold,
} from "./scaffold.ts";
import { matchesShortcut } from "./react.tsx";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixtures = resolve(here, "../../test/fixtures");
const themeFixture = join(fixtures, "kadal-theme-fixture");
const addonFixture = join(fixtures, "kadal-addon-fixture");
const work = mkdtempSync(join(tmpdir(), "kadal-theming-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A deck folder in the temp dir, with packages copied into its node_modules. */
function deckDir(
  name: string,
  packages: Record<string, string> = {},
  mdx = "---\ntitle: T\n---\n\n# Hi\n",
) {
  const dir = join(work, name);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, "deck.mdx"), mdx);
  for (const [pkg, from] of Object.entries(packages)) {
    mkdirSync(join(dir, "node_modules", pkg, ".."), { recursive: true });
    cpSync(from, join(dir, "node_modules", pkg), { recursive: true });
  }
  return dir;
}

describe("the contract's names", () => {
  test("a bare name means @kadal/theme-x, kadal-theme-x, then x", () => {
    expect(packageCandidates("theme", "seriph")).toEqual([
      "@kadal/theme-seriph",
      "kadal-theme-seriph",
      "seriph",
    ]);
    expect(packageCandidates("addon", "qr")).toEqual(["@kadal/addon-qr", "kadal-addon-qr", "qr"]);
    expect(packageCandidates("theme", "@acme/deck-theme")).toEqual(["@acme/deck-theme"]);
    expect(packageCandidates("theme", "kadal-theme-x")).toEqual(["kadal-theme-x"]);
    expect(packageCandidates("theme", "./theme")).toEqual([]);
  });
  test("paths are Slidev's: ./, ../, /, or a slash without a scope", () => {
    for (const p of [".", "./theme", "../t", "/abs/t", "themes/mine", "C:\\t"])
      expect(isPathSpec(p)).toBe(true);
    for (const p of ["seriph", "@kadal/theme-seriph", "kadal-theme-x"])
      expect(isPathSpec(p)).toBe(false);
  });
  test("short names drop the scope and the prefix", () => {
    expect(shortName("theme", "@kadal/theme-seriph")).toBe("seriph");
    expect(shortName("theme", "kadal-theme-aurora")).toBe("aurora");
    expect(shortName("addon", "@acme/kadal-addon-qr")).toBe("qr");
  });
  test("metadata fills its gaps, and reads Slidev's colorSchema spelling", () => {
    const meta = readMeta(
      "theme",
      { name: "kadal-theme-x", kadal: { theme: { colorSchema: "dark" } } },
      "dir",
    );
    expect(meta).toMatchObject({ name: "x", colorScheme: "dark" });
    expect(readMeta("theme", null, "folder")).toMatchObject({
      name: "folder",
      colorScheme: "both",
    });
    expect(readMeta("addon", { kadal: { addon: { name: "qr", layouts: ["a", 1] } } }, "d")).toEqual(
      {
        name: "qr",
        layouts: ["a"],
      },
    );
  });
  test("a swatch is two colours, or nothing", () => {
    const meta = (swatch: unknown) =>
      readMeta("theme", { kadal: { theme: { name: "x", swatch } } }, "x") as { swatch?: unknown };
    expect(meta(["#123", " #456 "]).swatch).toEqual(["#123", "#456"]);
    expect(meta(["#123"]).swatch).toBeUndefined();
    expect(meta("#123").swatch).toBeUndefined();
  });
  test("the menu adds the first-party themes a deck did not name, in their order", () => {
    expect(FIRST_PARTY_THEMES).toHaveLength(17);
    expect(implicitThemes(["seriph", "minimal"])).toEqual(
      FIRST_PARTY_THEMES.filter((t) => t !== "seriph" && t !== "minimal"),
    );
    expect(implicitThemes(FIRST_PARTY_THEMES)).toEqual([]);
  });
  test("modules: a default export, or named exports", () => {
    const L = () => null;
    expect(normalizeModule({ default: { layouts: { a: L } } })).toEqual({ layouts: { a: L } });
    expect(normalizeModule({ layouts: { a: L }, setup: L })).toEqual({
      layouts: { a: L },
      setup: L,
    });
    expect(normalizeModule(null)).toBeNull();
  });
  test("the headmatter's requests: the theme first, then the menu's, then addons", () => {
    expect(requestedPackages({}, ["minimal", "rla"])).toEqual({
      theme: "minimal",
      themes: ["minimal", "rla"],
      addons: [],
    });
    expect(requestedPackages({ theme: "x", themes: ["rla", "x"], addons: "qr" }, [])).toEqual({
      theme: "x",
      themes: ["x", "rla"],
      addons: ["qr"],
    });
  });
});

describe("resolving on disk", () => {
  test("a built-in theme ships its CSS in the engine", () => {
    const r = resolvePackage("theme", "rla", work);
    expect(r).toMatchObject({
      builtin: true,
      css: "@kadal/deck/themes/rla.css",
      module: null,
      name: "rla",
    });
    expect(resolvePackage("theme", "none", work).css).toBeNull();
  });
  test("a folder beside the deck, by relative path", () => {
    const dir = deckDir("by-path");
    const r = resolvePackage("theme", relative(dir, themeFixture), dir);
    expect(r.name).toBe("fixture");
    expect(r.css).toBe(join(themeFixture, "style.css"));
    expect(r.module).toBe(join(themeFixture, "index.tsx"));
    expect(r.meta).toMatchObject({ layouts: ["banner"], shiki: { light: "min-light" } });
    expect(r.watch).toEqual([join(themeFixture, "package.json")]);
  });
  test("an installed package by its short name, scoped first", () => {
    const dir = deckDir("by-name", {
      "kadal-theme-fixture": themeFixture,
      "@kadal/theme-scoped": themeFixture,
      "kadal-addon-fixture": addonFixture,
    });
    // @kadal/theme-scoped is a copy whose package.json still says name "fixture".
    expect(resolvePackage("theme", "scoped", dir).package).toBe("kadal-theme-fixture");
    expect(resolvePackage("theme", "scoped", dir).root).toContain(join("@kadal", "theme-scoped"));
    expect(resolvePackage("theme", "fixture", dir).root).toContain("kadal-theme-fixture");
    expect(resolvePackage("addon", "fixture", dir).meta).toMatchObject({ components: ["Stamp"] });
    expect(
      listInstalledPackages(dir)
        .map((p) => `${p.kind}:${p.spec}`)
        .sort(),
    ).toEqual([
      "addon:kadal-addon-fixture",
      "theme:@kadal/theme-scoped",
      "theme:kadal-theme-fixture",
    ]);
  });
  test("not found: every name tried, and the install command for this deck's package manager", () => {
    const dir = deckDir("missing");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    let err: unknown;
    try {
      resolvePackage("theme", "sakura", dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PackageResolveError);
    const msg = (err as Error).message;
    expect(msg).toContain("@kadal/theme-sakura (not installed)");
    expect(msg).toContain("kadal-theme-sakura (not installed)");
    expect(msg).toContain("built-in theme: minimal");
    expect(msg).toContain("pnpm add @kadal/theme-sakura");
    expect(() => resolvePackage("theme", "./nope", dir)).toThrow(/is not a folder/);
  });
  test("a first-party theme the deck did not install: the copy inside @kadal/deck", () => {
    const dir = deckDir("bundled");
    for (const spec of ["seriph", "@kadal/theme-seriph"]) {
      const r = resolvePackage("theme", spec, dir);
      expect(r).toMatchObject({ name: "seriph", package: "@kadal/theme-seriph", builtin: false });
      expect(r.root).toBe(bundledTheme("seriph")!);
      expect(r.css).toBe(join(r.root!, "style.css"));
      expect(r.module).toBe(join(r.root!, "index.tsx"));
    }
    // An installed package of that name still wins over the copy.
    const installed = deckDir("bundled-installed", { "@kadal/theme-seriph": themeFixture });
    expect(resolvePackage("theme", "seriph", installed).root).toContain(
      join("@kadal", "theme-seriph"),
    );
    // Only the first-party names have a copy.
    expect(bundledTheme("sakura")).toBeNull();
    expect(bundledTheme("minimal")).toBeNull();
  });
  test("the menu's implicit themes: the deck's own install, else the copy, never a stranger", () => {
    const dir = deckDir("implicit", { "kadal-theme-ocean": themeFixture });
    expect(resolveImplicitTheme("ocean", dir)?.root).toBe(bundledTheme("ocean")!);
    expect(resolveImplicitTheme("rla", dir)).toMatchObject({ builtin: true, name: "rla" });
    expect(resolveImplicitTheme("sakura", dir)).toBeNull();
  });
  test("a theme the deck's own CSS defines is still a theme (plain CSS, no package)", () => {
    const dir = deckDir("own-css");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "styles.css"), ".theme-mine { --deck-bg: red; }\n");
    expect(deckDefinesTheme("mine", dir)).toBe(true);
    expect(deckDefinesTheme("min", dir)).toBe(false);
    expect(resolvePackage("theme", "mine", dir)).toMatchObject({
      name: "mine",
      css: null,
      builtin: false,
    });
  });
  test("a theme folder without a stylesheet is refused", () => {
    const dir = deckDir("no-css");
    mkdirSync(join(dir, "theme"));
    writeFileSync(join(dir, "theme", "package.json"), '{"name":"t"}');
    expect(() => resolvePackage("theme", "./theme", dir)).toThrow(/has no stylesheet/);
  });
});

describe("the manifest's packages (Vite)", () => {
  test("eager CSS for every theme, eager modules for the theme and addons, lazy for the rest", () => {
    const dir = deckDir("manifest", {
      "kadal-theme-fixture": themeFixture,
      "kadal-addon-fixture": addonFixture,
    });
    writeFileSync(join(dir, "global-top.tsx"), "export default () => null;\n");
    const set = deckPackageSet({ theme: "rla", themes: ["fixture"], addons: ["fixture"] }, dir);
    expect(set.themes.map((t) => t.name)).toEqual(["rla", "fixture"]);
    expect(set.layers).toEqual({ "global-top": join(dir, "global-top.tsx") });
    const code = packagesCode(set);
    expect(code.imports).toContain('import "@kadal/deck/themes/rla.css";');
    expect(code.imports).toContain("kadal-theme-fixture/style.css");
    expect(code.imports).toContain("kadal-addon-fixture/style.css");
    expect(code.imports).toMatch(
      /import \* as __kadal_pkg_\d from ".*kadal-addon-fixture\/index.tsx"/,
    );
    // The fixture theme is not the active one: its module is a lazy chunk.
    expect(code.imports).not.toContain("kadal-theme-fixture/index.tsx");
    expect(code.value).toContain('() => import("');
    expect(code.value).toContain('"global-top":');
  });
  test("every first-party theme the deck did not name joins the menu, CSS and all lazy", () => {
    const dir = deckDir("menu-all", { "kadal-theme-fixture": themeFixture });
    const set = deckPackageSet({ theme: "fixture", themes: ["ocean", "rla"] }, dir);
    expect(set.themes.map((t) => t.name)).toEqual(["fixture", "ocean", "rla"]);
    expect(set.more!.map((t) => t.name)).toEqual(
      FIRST_PARTY_THEMES.filter((t) => t !== "ocean" && t !== "rla"),
    );
    const code = packagesCode(set);
    // Named: eager CSS. Not named: nothing eager, the stylesheet inside the lazy load.
    expect(code.imports).toContain(`import "${join(bundledTheme("ocean")!, "style.css")}";`);
    expect(code.imports).not.toContain(join(bundledTheme("folio")!, "style.css"));
    expect(code.imports).not.toContain("@kadal/deck/themes/stack.css");
    expect(code.value).toContain(
      `load: () => Promise.all([import("${join(bundledTheme("folio")!, "style.css")}"), import("${join(bundledTheme("folio")!, "index.tsx")}")]).then((m) => m[m.length - 1]), implicit: true`,
    );
    expect(code.value).toContain(
      'load: () => import("@kadal/deck/themes/stack.css").then(() => null), implicit: true',
    );
    // Every theme of the menu, the deck's own order first.
    const names = [...code.value.matchAll(/kind: "theme", name: "([\w-]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(["fixture", "ocean", "rla", ...set.more!.map((t) => t.name)]);
  });
  test("the shell's registry module registers every package behind a lazy import", () => {
    const found = scanPackages({ dirs: [fixtures] });
    expect(found.map((f) => `${f.kind}:${f.root.split("/").pop()}`)).toEqual([
      "addon:kadal-addon-fixture",
      "theme:kadal-theme-fixture",
    ]);
    const code = registryCode(found);
    expect(code).toContain('registerTheme({ name: "fixture", package: "kadal-theme-fixture"');
    expect(code).toContain("registerAddon(");
    expect(code).toMatch(
      /load: \(\) => Promise\.all\(\[import\(".*style\.css"\), import\(".*index\.tsx"\)\]\)/,
    );
  });
});

describe("merging", () => {
  const A = () => null;
  const B = () => null;
  const C = () => null;
  test("components: the deck over the addons over the theme; layouts become layout:<name>", () => {
    const merged = mergeComponents({ Box: C }, [{ components: { Box: B, Note: B } }], {
      components: { Box: A, Note: A, Badge: A },
      layouts: { hero: A },
    });
    expect(merged).toEqual({ Box: C, Note: B, Badge: A, "layout:hero": A });
  });
  test("layers stack, the theme lowest; the deck's false empties one", () => {
    const layers = mergeLayers(
      [{ "global-top": C }],
      [{ layers: { "global-top": B, "slide-top": B } }],
      { layers: { "global-top": A, "global-bottom": A } },
    );
    expect(layers["global-top"]).toEqual([A, B, C]);
    expect(layers["slide-top"]).toEqual([B]);
    expect(layers["global-bottom"]).toEqual([A]);
    expect(
      mergeLayers([{ "global-bottom": false }], [], { layers: { "global-bottom": A } })[
        "global-bottom"
      ],
    ).toEqual([]);
  });
  test("themeConfig → --theme-<kebab> custom properties", () => {
    expect(kebab("primaryColor")).toBe("primary-color");
    expect(kebab("size2")).toBe("size-2");
    expect(
      themeConfigVars({
        primary: "#5d8392",
        fontSize: 32,
        cover: { image: "url(/x.png)", dim: true },
        stops: ["red", "blue"],
        evil: "red; } body { display: none",
        nothing: null,
      }),
    ).toEqual({
      "--theme-primary": "#5d8392",
      "--theme-font-size": "32",
      "--theme-cover-image": "url(/x.png)",
      "--theme-cover-dim": "1",
      "--theme-stops": "red, blue",
    });
  });
  test("the deck's themeConfig over the theme's, one level deep", () => {
    const meta = {
      name: "t",
      colorScheme: "both" as const,
      themeConfig: { a: 1, nested: { x: 1, y: 1 } },
    };
    expect(mergeThemeConfig(meta, { b: 2, nested: { y: 2 } })).toEqual({
      a: 1,
      b: 2,
      nested: { x: 1, y: 2 },
    });
  });
  test("slide defaults: theme < addons < headmatter defaults < the slide", () => {
    const slides = [
      { frontmatter: { layout: "cover" } },
      { frontmatter: {} },
      { frontmatter: { class: "own" } },
    ];
    const theme = {
      meta: {
        name: "t",
        colorScheme: "both" as const,
        defaults: { class: "t", transition: "fade" },
      },
    };
    const addon = { meta: { name: "a", defaults: { transition: "zoom", hideInToc: true } } };
    applySlideDefaults(
      slides,
      slideDefaultLayers({ defaults: { transition: "none" } }, theme, [addon]),
    );
    expect(slides).toEqual([
      { frontmatter: { layout: "cover", class: "t", transition: "none", hideInToc: true } },
      { frontmatter: { class: "t", transition: "none", hideInToc: true } },
      { frontmatter: { class: "own", transition: "none", hideInToc: true } },
    ]);
  });
  test("the theme's config sits under the headmatter; a one-scheme theme sets the default scheme", () => {
    const pk = packageConfigLayer({
      theme: {
        kind: "theme",
        name: "night",
        spec: "./theme",
        package: null,
        builtin: false,
        meta: { name: "night", colorScheme: "dark", config: { transition: "fade" } },
        module: null,
        load: null,
      },
      themes: [],
      addons: [],
      layers: {},
      warnings: [],
    });
    expect(pk.below).toEqual({ transition: "fade", colorScheme: "dark" });
    expect(pk.names).toEqual({ theme: "night", themes: [], addons: [] });
    expect(packageConfigLayer(undefined)).toEqual({ below: {}, names: {} });
  });
  test("Shiki: explicit options, then the theme's, then GitHub's", () => {
    const theme = {
      meta: { name: "t", colorScheme: "both" as const, shiki: { light: "min-light" } },
    };
    expect(shikiThemes(undefined, theme)).toEqual({
      light: "min-light",
      dark: "github-dark-high-contrast",
    });
    expect(shikiThemes({ light: "nord" }, theme)).toEqual({
      light: "nord",
      dark: "github-dark-high-contrast",
    });
  });
});

describe("fonts", () => {
  test("the list form loads each family as written", () => {
    const f = resolveFonts(["Inter:wght@400;600", "JetBrains Mono"]);
    expect(f.sheets.map((s) => s.href)).toEqual([
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap",
    ]);
    expect(f.vars).toEqual({});
  });
  test("the object form: families, weights, italics, and the theme's tokens", () => {
    const f = resolveFonts({ sans: "Roboto", mono: "Fira Code", weights: "400,700", italic: true });
    expect(f.sheets[0]!.href).toBe(
      "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,700;1,400;1,700&display=swap",
    );
    expect(f.sheets[0]!.retry).toBe("https://fonts.googleapis.com/css2?family=Roboto&display=swap");
    expect(f.vars["--deck-body-font"]).toStartWith('"Roboto", ui-sans-serif');
    expect(f.vars["--deck-heading-font"]).toBe(f.vars["--deck-body-font"]!);
    expect(f.vars["--deck-mono-font"]).toStartWith('"Fira Code", ui-monospace');
    expect(f.families).toEqual(["Roboto", "Fira Code"]);
  });
  test("local fonts, provider none, bunny, no fallbacks, a heading face", () => {
    const local = resolveFonts({ sans: "Helvetica Neue, Roboto", local: "Helvetica Neue" });
    expect(local.sheets.map((s) => s.family)).toEqual(["Roboto"]);
    expect(local.vars["--deck-body-font"]).toStartWith('"Helvetica Neue", "Roboto"');
    expect(resolveFonts({ sans: "Roboto", provider: "none" }).sheets).toEqual([]);
    expect(
      resolveFonts({ serif: "Source Serif 4", provider: "bunny", weights: [400] }).sheets[0]!.href,
    ).toBe("https://fonts.bunny.net/css?family=source-serif-4:400&display=swap");
    const nf = resolveFonts({
      mono: "Fira Code, monospace",
      fallbacks: false,
      heading: "Fraunces",
    });
    expect(nf.vars).toEqual({
      "--deck-mono-font": '"Fira Code", monospace',
      "--font-mono": '"Fira Code", monospace',
      "--deck-heading-font": '"Fraunces"',
    });
    expect(nf.families).toEqual(["Fraunces", "Fira Code"]);
    expect(googleFamily("Inter", [300, 400], false)).toBe("Inter:wght@300;400");
  });
  test("a theme picked from the menu brings its own fonts; the deck's own choice stays", () => {
    const ref = (name: string, fonts?: Record<string, unknown>) => ({
      kind: "theme" as const,
      name,
      spec: name,
      package: `@kadal/theme-${name}`,
      builtin: false,
      meta: { name, colorScheme: "both" as const, ...(fonts ? { config: { fonts } } : {}) },
      module: null,
      load: null,
    });
    const paper = ref("paper", { sans: "Newsreader" });
    const grid = ref("grid", { sans: "Inter Tight", mono: "JetBrains Mono" });
    const plain = ref("plain");
    const packages = {
      theme: paper,
      themes: [paper, grid, plain],
      addons: [],
      layers: {},
      warnings: [],
    };
    // the deck's own theme: whatever the config says
    expect(fontsForTheme(packages, "paper", { sans: "Newsreader" })).toEqual({
      sans: "Newsreader",
    });
    // the deck's theme's fonts go with it
    expect(fontsForTheme(packages, "grid", { sans: "Newsreader" })).toEqual(
      grid.meta.config!.fonts,
    );
    expect(fontsForTheme(packages, "plain", { sans: "Newsreader" })).toEqual([]);
    expect(fontsForTheme(packages, "minimal", [])).toEqual([]);
    // the headmatter's own keys stay over the picked theme's
    expect(fontsForTheme(packages, "grid", { sans: "Newsreader", mono: "Fira Code" })).toEqual({
      sans: "Inter Tight",
      mono: "Fira Code",
    });
    // a list the deck wrote is the deck's
    expect(fontsForTheme(packages, "grid", ["Roboto"])).toEqual(["Roboto"]);
    expect(fontsForTheme(null, "grid", ["Roboto"])).toEqual(["Roboto"]);
  });
});

describe("the runtime registry (the shell)", () => {
  const registry = createPackageRegistry();
  let loaded = 0;
  registry.register({
    kind: "theme",
    name: "seriph",
    package: "@kadal/theme-seriph",
    meta: {
      name: "seriph",
      colorScheme: "both",
      defaults: { class: "from-theme" },
      shiki: { light: "min-light", dark: "min-dark" },
    },
    load: async () => {
      loaded++;
      return { default: { layouts: { quote: () => null } } };
    },
  });
  registry.register({
    kind: "theme",
    name: "ocean",
    package: "@kadal/theme-ocean",
    meta: {
      name: "ocean",
      colorScheme: "both",
      swatch: ["#1d63a8", "#13908e"],
      shiki: { light: "night-owl-light", dark: "night-owl" },
    },
    load: async () => {
      loaded++;
      return null;
    },
  });
  registry.register({
    kind: "addon",
    name: "qr",
    package: "@kadal/addon-qr",
    meta: { name: "qr" },
    load: async () => ({ components: { Qr: () => null } }),
  });
  test("finds by name and by every package spelling", () => {
    expect(registry.find("theme", "seriph")?.name).toBe("seriph");
    expect(registry.find("theme", "@kadal/theme-seriph")?.name).toBe("seriph");
    expect(registry.find("theme", "kadal-theme-seriph")).toBeNull();
    expect(registry.find("addon", "qr")?.package).toBe("@kadal/addon-qr");
  });
  test("an unknown theme falls back to minimal, and says so", async () => {
    const r = await resolveRuntimePackages({ theme: "nope" }, registry);
    expect(r.packages.theme).toMatchObject({ name: "minimal", builtin: true, spec: "nope" });
    expect(r.warnings[0]).toContain(
      'The theme "nope" is not one this player has, so it shows "minimal"',
    );
    expect(r.warnings[0]).toContain("seriph");
    const path = await resolveRuntimePackages({ theme: "./theme", addons: ["missing"] }, registry);
    expect(path.warnings[0]).toContain("is a folder");
    expect(path.warnings[1]).toContain('The addon "missing"');
  });
  test("the active theme and the addons load; the menu's other themes wait", async () => {
    const r = await resolveRuntimePackages({ theme: "seriph", addons: ["qr"] }, registry);
    expect(r.warnings).toEqual([]);
    expect(Object.keys(r.packages.theme!.module!.layouts!)).toEqual(["quote"]);
    expect(Object.keys(r.packages.addons[0]!.module!.components!)).toEqual(["Qr"]);
    expect(r.packages.themes.map((t) => t.name)).toEqual([
      "seriph",
      "minimal",
      "rla",
      "stack",
      "ocean",
    ]);
    expect(r.packages.themes.map((t) => !!t.implicit)).toEqual([false, false, false, false, true]);
    const lazy = await resolveRuntimePackages({ theme: "rla", themes: ["seriph"] }, registry);
    expect(lazy.packages.themes[1]).toMatchObject({ name: "seriph", module: null });
    expect(typeof lazy.packages.themes[1]!.load).toBe("function");
    // Named first, then the first-party ones this page has, in their order.
    expect(lazy.packages.themes.map((t) => t.name)).toEqual([
      "rla",
      "seriph",
      "minimal",
      "stack",
      "ocean",
    ]);
    expect(lazy.packages.themes.at(-1)).toMatchObject({ implicit: true, module: null });
    expect(loaded).toBe(1);
  });
  test("a theme the menu adds on its own keeps the deck's code colours", async () => {
    const out = await compileDeck("---\ntheme: minimal\n---\n\n```ts\nconst a = 1\n```\n", {
      packages: registry,
    });
    expect(out.manifest.packages?.themes.map((t) => t.name)).toContain("ocean");
    expect(out.manifest.codeThemes?.menu.ocean).toBeUndefined();
    const named = await compileDeck(
      "---\ntheme: minimal\nthemes: [ocean]\n---\n\n```ts\nconst a = 1\n```\n",
      { packages: registry },
    );
    expect(named.manifest.codeThemes?.menu.ocean).toBeDefined();
  });
  test("compileDeck resolves against it: defaults, Shiki and the fallback warning", async () => {
    const ok = await compileDeck(
      "---\ntheme: seriph\n---\n\n# A\n\n---\n\n```ts\nconst a = 1\n```\n",
      {
        packages: registry,
      },
    );
    expect(ok.ok).toBe(true);
    expect(ok.manifest.packages?.theme?.name).toBe("seriph");
    expect(ok.manifest.slides.map((s) => s.frontmatter.class)).toEqual([
      "from-theme",
      "from-theme",
    ]);
    const bad = await compileDeck("---\ntheme: nope\n---\n\n# A\n", { packages: registry });
    expect(bad.ok).toBe(true);
    expect(bad.diagnostics).toEqual([
      expect.objectContaining({ severity: "warning", message: expect.stringContaining('"nope"') }),
    ]);
    expect(bad.manifest.packages?.theme?.name).toBe("minimal");
    expect(bad.manifest.packages?.warnings).toHaveLength(1);
    const off = await compileDeck("---\ntheme: nope\n---\n\n# A\n", { packages: false });
    expect(off.manifest.packages).toBeUndefined();
  });
});

describe("scaffolds", () => {
  const opts = { name: "aurora", title: "Aurora", deckRange: "^0.4.0" };
  test("the layout list is the engine's", () => {
    expect([...LAYOUT_CLASSES].sort()).toEqual(
      Object.keys(LAYOUTS)
        .filter((l) => l !== "none")
        .sort(),
    );
  });
  test("every token is one base.css (or theming.css) defines", () => {
    const css = ["base.css", "theming.css"]
      .map((f) => readFileSync(resolve(here, "../themes", f), "utf8"))
      .join("\n");
    for (const [token] of THEME_TOKENS) expect(css).toContain(`${token}:`);
  });
  test("a theme: the contract's package.json, every token and layout class, light and dark", () => {
    const files = themeScaffold(opts);
    const pkg = JSON.parse(files["package.json"]!);
    expect(pkg.name).toBe("kadal-theme-aurora");
    expect(pkg.keywords).toContain("kadal-theme");
    expect(pkg.exports["./style.css"]).toBe("./style.css");
    expect(pkg.kadal.theme).toMatchObject({
      name: "aurora",
      colorScheme: "both",
      layouts: ["hero"],
    });
    const css = files["style.css"]!;
    for (const [token] of THEME_TOKENS) expect(css).toContain(`${token}:`);
    for (const l of LAYOUT_CLASSES) expect(css).toContain(`.theme-aurora .deck-layout-${l}`);
    expect(css).toContain('.theme-aurora[data-color-scheme="dark"]');
    expect(files["preview/deck.mdx"]).toContain("theme: ../");
    expect(Object.keys(files).sort()).toEqual(
      [
        "README.md",
        "_gitignore",
        "index.tsx",
        "layouts.tsx",
        "package.json",
        "preview/deck.mdx",
        "preview/env.d.ts",
        "preview/index.html",
        "preview/src/main.tsx",
        "preview/vite.config.ts",
        "style.css",
        "tsconfig.json",
      ].sort(),
    );
  });
  test("an addon: components, a layer, setup", () => {
    const files = addonScaffold({ ...opts, name: "stamp", title: "Stamp" });
    expect(JSON.parse(files["package.json"]!).kadal.addon).toMatchObject({
      name: "stamp",
      components: ["StampNote"],
    });
    expect(files["index.tsx"]).toContain("setup,");
    expect(files["index.tsx"]).toContain('"global-top": Progress');
    expect(files["preview/deck.mdx"]).toContain("addons:\n  - ../");
  });
  test("names", () => {
    expect(scaffoldName("@me/kadal-theme-My Theme!")).toBe("my-theme");
  });
});

describe("eject", () => {
  test("a built-in theme becomes a package-shaped folder; the headmatter and main.tsx follow", () => {
    const dir = deckDir(
      "eject-builtin",
      {},
      "---\ntitle: T # keep me\ntheme: rla\nthemes: [rla, minimal]\n---\n\n# Hi\n",
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "main.tsx"),
      'import "@kadal/deck/styles.css";\nimport "@kadal/deck/themes/rla.css";\nimport "@kadal/deck/themes/minimal.css";\n',
    );
    const r = ejectTheme(dir);
    expect(r).toMatchObject({ name: "rla", from: "rla", to: "./theme", builtin: true });
    expect(r.files).toEqual(["README.md", "index.tsx", "package.json", "style.css"]);
    expect(readFileSync(join(dir, "deck.mdx"), "utf8")).toBe(
      "---\ntitle: T # keep me\ntheme: ./theme\nthemes:\n  - ./theme\n  - minimal\n---\n\n# Hi\n",
    );
    expect(readFileSync(join(dir, "src", "main.tsx"), "utf8")).not.toContain("themes/rla.css");
    expect(readFileSync(join(dir, "src", "main.tsx"), "utf8")).toContain("themes/minimal.css");
    expect(readFileSync(join(dir, "theme", "style.css"), "utf8")).toContain(".theme-rla {");
    // The copy resolves as the same theme.
    expect(resolvePackage("theme", "./theme", dir)).toMatchObject({ name: "rla", builtin: false });
    expect(() => ejectTheme(dir)).toThrow(/already a folder/);
  });
  test("a package theme is copied (without node_modules), marked private", () => {
    const dir = deckDir(
      "eject-pkg",
      { "kadal-theme-fixture": themeFixture },
      "---\ntheme: fixture\n---\n\n# Hi\n",
    );
    mkdirSync(join(dir, "node_modules", "kadal-theme-fixture", "node_modules", "junk"), {
      recursive: true,
    });
    const r = ejectTheme(dir, { dir: "my-theme" });
    expect(r.to).toBe("./my-theme");
    expect(r.files).toEqual(["index.tsx", "package.json", "style.css"]);
    expect(JSON.parse(readFileSync(join(dir, "my-theme", "package.json"), "utf8"))).toMatchObject({
      private: true,
      kadal: { theme: { name: "fixture" } },
    });
    expect(readFileSync(join(dir, "deck.mdx"), "utf8")).toContain("theme: ./my-theme");
    expect(() => ejectTheme(dir, { theme: "fixture", dir: "my-theme" })).toThrow(/not empty/);
  });
});

describe("shortcuts", () => {
  const key = (k: string, m: Partial<KeyboardEvent> = {}) =>
    ({
      key: k,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...m,
    }) as KeyboardEvent;
  test("matches keys and modifiers", () => {
    expect(matchesShortcut("shift+j", key("J", { shiftKey: true }))).toBe(true);
    expect(matchesShortcut("shift+j", key("j"))).toBe(false);
    expect(matchesShortcut("g", key("g"))).toBe(true);
    expect(matchesShortcut("g", key("g", { ctrlKey: true }))).toBe(false);
    expect(matchesShortcut("?", key("?", { shiftKey: true }))).toBe(true);
    expect(matchesShortcut("space", key(" "))).toBe(true);
  });
});

describe("the CLI", () => {
  async function cli(argv: string[], cwd = work) {
    const { main } = await import("../cli/index.ts");
    const out: string[] = [];
    const log = console.log;
    const error = console.error;
    console.log = (...a: unknown[]) => out.push(a.join(" "));
    console.error = (...a: unknown[]) => out.push(a.join(" "));
    try {
      return { code: await main(argv, cwd), out: out.join("\n") };
    } finally {
      console.log = log;
      console.error = error;
    }
  }
  test("new --theme writes a package; new --addon too", async () => {
    const r = await cli(["new", "--theme", "Night Owl", "--json"]);
    expect(r.code).toBe(0);
    const res = JSON.parse(r.out);
    expect(res).toMatchObject({
      ok: true,
      kind: "theme",
      name: "night-owl",
      package: "kadal-theme-night-owl",
    });
    expect(
      JSON.parse(readFileSync(join(work, "kadal-theme-night-owl", "package.json"), "utf8")).kadal
        .theme.name,
    ).toBe("night-owl");
    const a = await cli(["new", "--addon", "qr", "addons/qr", "--json"]);
    expect(JSON.parse(a.out)).toMatchObject({
      ok: true,
      kind: "addon",
      dir: join(work, "addons", "qr"),
    });
    expect((await cli(["new", "--theme", "night-owl"])).code).toBe(2);
  });
  test("theme eject, and its errors", async () => {
    const dir = deckDir("cli-eject", {}, "---\ntheme: minimal\n---\n\n# Hi\n");
    const r = await cli(["theme", "eject", "-C", dir, "--dir", "looks", "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, name: "minimal", to: "./looks" });
    expect((await cli(["theme", "eject", "-C", dir, "--json"])).code).toBe(1);
    expect((await cli(["theme", "nope", "-C", dir])).code).toBe(2);
  });
  test("info themes lists what the deck can see", async () => {
    const dir = deckDir("cli-info", { "kadal-theme-fixture": themeFixture });
    const r = await cli(["info", "themes", "-C", dir, "--json"]);
    const res = JSON.parse(r.out);
    expect(res.entries.map((t: { name: string }) => t.name)).toEqual(["minimal", "rla", "stack"]);
    expect(res.installed).toEqual([
      expect.objectContaining({
        kind: "theme",
        name: "fixture",
        package: "kadal-theme-fixture",
        layouts: ["banner"],
      }),
    ]);
  });
  test("check knows a package's layouts and reports one that is missing", async () => {
    const ok = deckDir(
      "cli-check",
      { "kadal-theme-fixture": themeFixture, "kadal-addon-fixture": addonFixture },
      "---\ntheme: fixture\naddons: [fixture]\nthemeConfig:\n  primary: red\n---\n\n# Hi\n\n---\nlayout: banner\n---\n\n<Stamp>x</Stamp> <FixtureBadge>y</FixtureBadge>\n",
    );
    const r = await cli(["check", "-C", ok, "--json"]);
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, errors: 0, warnings: 0 });
    const bad = deckDir("cli-check-bad", {}, "---\ntheme: sakura\naddons: [qr]\n---\n\n# Hi\n");
    const b = JSON.parse((await cli(["check", "-C", bad, "--no-compile", "--json"])).out);
    expect(b.diagnostics.map((d: { code: string }) => d.code)).toEqual([
      "theme-missing",
      "addon-missing",
    ]);
  });
});
