import { describe, expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import { createHighlighter } from "shiki";

import { DEFAULT_SHIKI } from "../theming/merge.ts";
import { codeThemeCss, codeThemes, shikiThemeNames, shikiThemeOption } from "./code-themes.ts";
import { deckGlossary, mdxPlugins } from "./pipeline.ts";

const theme = (name: string, shiki?: { light?: string; dark?: string }) => ({
  name,
  spec: name,
  meta: { name, colorScheme: "both", ...(shiki ? { shiki } : {}) },
});
const minimal = theme("minimal");
const ocean = theme("ocean", { light: "night-owl-light", dark: "night-owl" });
const classic = theme("classic", { light: "vitesse-light", dark: "vitesse-dark" });
const seriph = theme("seriph", { light: "vitesse-light", dark: "vitesse-dark" });
const neon = theme("neon", { light: "synthwave-84", dark: "synthwave-84" });

describe("code colours that follow the theme menu", () => {
  test("the default menu (all GitHub) needs nothing: no keys, no rules", () => {
    const t = codeThemes(undefined, minimal, [minimal, theme("rla"), theme("stack")]);
    expect(t).toEqual({ ...DEFAULT_SHIKI, extra: {}, menu: {} });
    expect(codeThemeCss(t)).toBe("");
    expect(shikiThemeOption(t)).toEqual(DEFAULT_SHIKI);
  });

  test("each further Shiki theme gets one key, shared by the themes that use it", () => {
    const t = codeThemes(undefined, minimal, [minimal, ocean, classic, seriph]);
    expect(t.extra).toEqual({
      k1: "night-owl-light",
      k2: "night-owl",
      k3: "vitesse-light",
      k4: "vitesse-dark",
    });
    expect(t.menu).toEqual({
      ocean: { light: "k1", dark: "k2" },
      classic: { light: "k3", dark: "k4" },
      seriph: { light: "k3", dark: "k4" },
    });
    expect(shikiThemeNames(t)).toHaveLength(6);
  });

  test("a menu theme that shares a side with the deck's reuses its variable", () => {
    // The deck on GitHub; a theme on the same light side by day and vesper by night.
    const t = codeThemes(undefined, minimal, [
      theme("swiss", { light: DEFAULT_SHIKI.light, dark: "vesper" }),
    ]);
    expect(t.extra).toEqual({ k1: "vesper" });
    expect(t.menu.swiss).toEqual({ light: "light", dark: "k1" });
    const css = codeThemeCss(t);
    expect(css).toContain(
      '.theme-swiss[data-color-scheme="light"] :is(.shiki, .shiki span), .deck-slide.theme-swiss[data-color-scheme="light"] :is(.shiki, .shiki span) { color: var(--shiki-light, inherit); }',
    );
    expect(css).toContain("color: var(--shiki-k1, var(--shiki-dark, inherit));");
  });

  test("a one-scheme theme reads the same key in both schemes", () => {
    const t = codeThemes(undefined, minimal, [neon]);
    expect(t.menu.neon).toEqual({ light: "k1", dark: "k1" });
    // …and as the deck's own theme, the menu's GitHub themes still get theirs.
    const own = codeThemes(undefined, neon, [neon, minimal]);
    expect(own).toMatchObject({ light: "synthwave-84", dark: "synthwave-84" });
    expect(own.menu.minimal).toEqual({ light: "k1", dark: "k2" });
  });

  test("a deck that pins its Shiki themes keeps them for every theme", () => {
    const t = codeThemes({ light: "min-light", dark: "min-dark" }, ocean, [ocean, classic]);
    expect(t).toEqual({ light: "min-light", dark: "min-dark", extra: {}, menu: {} });
  });

  test("a spec that differs from the class name, and names that are not class-safe", () => {
    const t = codeThemes(undefined, minimal, [
      { ...ocean, spec: "@kadal/theme-ocean" },
      { ...classic, name: "a b", spec: "./classic" },
    ]);
    expect(Object.keys(t.menu)).toEqual(["ocean"]);
  });

  test("code is highlighted with every key: each token carries all of them", async () => {
    const t = codeThemes(undefined, minimal, [minimal, ocean]);
    const highlighter = await createHighlighter({ themes: shikiThemeNames(t), langs: ["ts"] });
    const out = String(
      await compile("```ts\nconst a = 1\n```", {
        ...mdxPlugins({
          highlighter,
          themes: shikiThemeOption(t),
          glossary: deckGlossary({}, () => null),
          terms: null,
          math: (x) => x,
          warn: () => {},
        }),
      }),
    );
    expect(out).toMatch(
      /"--shiki-light": "#[0-9A-Fa-f]+",\s*"--shiki-dark": "#[0-9A-Fa-f]+",\s*"--shiki-k1": "#[0-9A-Fa-f]+",\s*"--shiki-k2": "#[0-9A-Fa-f]+"/,
    );
  });
});
