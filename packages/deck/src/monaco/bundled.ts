/**
 * Every Shiki grammar and theme, by name, as lazy imports: for a page that cannot know ahead which
 * languages its decks' editors will use (the shell). Shiki's bundles are maps of `import()`s, so
 * only what an editor asks for is fetched.
 */
/** The common fence aliases, so a `ts` block gets Monaco's `typescript` (and its language service). */
const CANONICAL: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  sh: "shellscript",
  bash: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  kt: "kotlin",
  rb: "ruby",
  cs: "csharp",
  "c++": "cpp",
  golang: "go",
};

export function bundledGrammar(lang: string): { id: string; load: () => Promise<unknown> } | null {
  const id = CANONICAL[lang.toLowerCase()] ?? lang.toLowerCase();
  return {
    id,
    load: async () => {
      const { bundledLanguages, bundledLanguagesAlias } = await import("shiki/langs");
      const map = { ...bundledLanguagesAlias, ...bundledLanguages } as Record<
        string,
        () => Promise<unknown>
      >;
      const load = map[id];
      if (!load) throw new Error(`no Shiki grammar for ${lang}`);
      return load();
    },
  };
}

/** Any Shiki theme by name, loaded when an editor first wears it (the theme menu's themes). */
export function bundledTheme(name: string) {
  return {
    name,
    load: async () => {
      const { bundledThemes: all } = await import("shiki/themes");
      const load = (all as Record<string, () => Promise<unknown>>)[name];
      if (!load) throw new Error(`no Shiki theme ${name}`);
      return load();
    },
  };
}

export function bundledThemes(light: string, dark: string) {
  return { light: bundledTheme(light), dark: bundledTheme(dark) };
}
