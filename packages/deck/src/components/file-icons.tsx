import type { ReactNode } from "react";

/**
 * File-type marks for code titles and code-group tabs: `[npm]`, `[package.json]`, `[tide.ts]`
 * each get a small badge in the colours people know them by, the way an editor's file tree
 * shows them. Slidev matches titles to VS Code's icon set (an Iconify package the deck must
 * install); these are drawn here — a rounded square and two or three letters — so they cost
 * nothing to install, scale with the slide, and print.
 *
 * Matching, most specific first: the exact name (`package.json`, `npm`, `Dockerfile`), the start
 * of the name (`vite.config.ts` → vite, `tsconfig.app.json` → tsconfig), the extension, then the
 * fence language. Nothing matched → no badge; the title bar keeps its dot.
 */

interface Mark {
  label: string;
  bg: string;
  fg: string;
}

const m = (label: string, bg: string, fg = "#fff"): Mark => ({ label, bg, fg });

const TS = m("TS", "#3178c6");
const JS = m("JS", "#f7df1e", "#1b1b1b");
const SH = m(">_", "#2e3440", "#a3be8c");
const JSON_ = m("{}", "#cbcb41", "#1b1b1b");
const MD = m("MD", "#519aba");
const PY = m("PY", "#3776ab", "#ffd43b");
const YAML = m("YML", "#cb171e");
const CSS = m("CSS", "#663399");
const HTML = m("<>", "#e34c26");
const NODE = m("JS", "#5fa04e");
const GIT = m("GIT", "#f05032");
const ENV = m("ENV", "#ecd53f", "#1b1b1b");

const EXACT: Record<string, Mark> = {
  npm: m("npm", "#cb3837"),
  npx: m("npx", "#cb3837"),
  yarn: m("Y", "#2c8ebb"),
  pnpm: m("pn", "#f69220", "#1b1b1b"),
  bun: m("bun", "#fbf0df", "#1b1b1b"),
  bunx: m("bun", "#fbf0df", "#1b1b1b"),
  deno: m("D", "#111", "#fff"),
  vue: m("V", "#41b883"),
  svelte: m("S", "#ff3e00"),
  angular: m("A", "#dd0031"),
  react: m("R", "#20232a", "#61dafb"),
  solid: m("S", "#2c4f7c"),
  preact: m("P", "#673ab8"),
  qwik: m("Q", "#18b6f6"),
  astro: m("A", "#17191e", "#ff5d01"),
  next: m("N", "#000"),
  nuxt: m("N", "#00dc82", "#0b2d1e"),
  rollup: m("R", "#ec4a3f"),
  webpack: m("W", "#8dd6f9", "#1c78c0"),
  esbuild: m("E", "#ffcf00", "#1b1b1b"),
  "package.json": NODE,
  "package-lock.json": m("npm", "#cb3837"),
  "bun.lock": m("bun", "#fbf0df", "#1b1b1b"),
  ".npmrc": m("npm", "#cb3837"),
  ".editorconfig": m("EC", "#e0efef", "#1b1b1b"),
  ".gitignore": GIT,
  ".gitattributes": GIT,
  ".env": ENV,
  ".env.example": ENV,
  ".vscode": m("VS", "#007acc"),
  dockerfile: m("DK", "#2496ed"),
  makefile: m("MK", "#6d8086"),
  "deck.mdx": m("K", "#0ea5e9"),
  terminal: SH,
  shell: SH,
  console: SH,
  bash: SH,
  zsh: SH,
  powershell: m("PS", "#012456"),
  cargo: m("RS", "#dea584", "#1b1b1b"),
  pip: PY,
  uv: m("uv", "#de5fe9"),
  go: m("GO", "#00add8"),
};

const PREFIX: Array<[string, Mark]> = [
  ["tsconfig", TS],
  ["jsconfig", JS],
  ["vite.config", m("V", "#646cff", "#ffd62e")],
  ["vitest.config", m("VT", "#6e9f18")],
  ["tailwind.config", m("TW", "#38bdf8", "#0b1120")],
  ["uno.config", m("UN", "#333")],
  ["eslint.config", m("ES", "#4b32c3")],
  [".eslintrc", m("ES", "#4b32c3")],
  [".oxlintrc", m("OX", "#32f3e9", "#1b1b1b")],
  [".prettierrc", m("PR", "#1a2b34", "#f7b93e")],
  ["vue.config", m("V", "#41b883")],
  ["svelte.config", m("S", "#ff3e00")],
  ["astro.config", m("A", "#17191e", "#ff5d01")],
  ["deck.config", m("K", "#0ea5e9")],
  ["docker-compose", m("DK", "#2496ed")],
  ["compose.", m("DK", "#2496ed")],
  ["wrangler", m("CF", "#f38020")],
];

const EXT: Record<string, Mark> = {
  ts: TS,
  mts: TS,
  cts: TS,
  tsx: m("TSX", "#3178c6"),
  js: JS,
  mjs: JS,
  cjs: JS,
  jsx: m("JSX", "#f7df1e", "#1b1b1b"),
  json: JSON_,
  jsonc: JSON_,
  json5: JSON_,
  md: MD,
  mdx: m("MDX", "#1b1f24", "#f9ac00"),
  py: PY,
  ipynb: m("NB", "#f37626"),
  rs: m("RS", "#dea584", "#1b1b1b"),
  go: m("GO", "#00add8"),
  rb: m("RB", "#cc342d"),
  java: m("JV", "#b07219"),
  kt: m("KT", "#7f52ff"),
  kts: m("KT", "#7f52ff"),
  swift: m("SW", "#f05138"),
  c: m("C", "#555cb0"),
  h: m("H", "#555cb0"),
  cpp: m("C++", "#00599c"),
  cc: m("C++", "#00599c"),
  hpp: m("H++", "#00599c"),
  cs: m("C#", "#68217a"),
  php: m("PHP", "#777bb4"),
  html: HTML,
  htm: HTML,
  css: CSS,
  scss: m("SC", "#cd6799"),
  sass: m("SA", "#cd6799"),
  less: m("LS", "#1d365d"),
  vue: m("V", "#41b883"),
  svelte: m("S", "#ff3e00"),
  astro: m("A", "#17191e", "#ff5d01"),
  yml: YAML,
  yaml: YAML,
  toml: m("TML", "#9c4221"),
  ini: m("INI", "#6d8086"),
  xml: m("XML", "#e37933"),
  svg: m("SVG", "#ffb13b", "#1b1b1b"),
  sql: m("SQL", "#e38c00"),
  graphql: m("GQ", "#e10098"),
  gql: m("GQ", "#e10098"),
  sh: SH,
  bash: SH,
  zsh: SH,
  fish: SH,
  ps1: m("PS", "#012456"),
  lua: m("LUA", "#000080"),
  dart: m("DT", "#0175c2"),
  ex: m("EX", "#4b275f"),
  exs: m("EX", "#4b275f"),
  zig: m("ZIG", "#f7a41d", "#1b1b1b"),
  wasm: m("WA", "#654ff0"),
  wat: m("WAT", "#654ff0"),
  txt: m("TXT", "#6d8086"),
  csv: m("CSV", "#237346"),
  lock: m("LCK", "#6d8086"),
};

const LANG: Record<string, Mark> = {
  typescript: TS,
  javascript: JS,
  python: PY,
  rust: EXT.rs!,
  shellscript: SH,
  markdown: MD,
  kotlin: EXT.kt!,
  csharp: EXT.cs!,
  ruby: EXT.rb!,
  docker: EXACT.dockerfile!,
};

/** The badge for a title (or, failing that, the fence language), or null. */
export function fileMark(title: string | null | undefined, lang?: string | null): Mark | null {
  const name = (title ?? "")
    .trim()
    .split(/[\s·—|(]/)[0]!
    .split(/[\\/]/)
    .pop()!
    .toLowerCase();
  if (name) {
    if (EXACT[name]) return EXACT[name]!;
    for (const [p, mark] of PREFIX) if (name.startsWith(p)) return mark;
    const dot = name.lastIndexOf(".");
    if (dot >= 0 && EXT[name.slice(dot + 1)]) return EXT[name.slice(dot + 1)]!;
  }
  const l = (lang ?? "").toLowerCase();
  return (l && (EXT[l] ?? LANG[l] ?? EXACT[l])) || null;
}

/** The badge, drawn: a rounded square with the letters, sized to the text around it. */
export function FileIcon({ title, lang }: { title?: string | null; lang?: string | null }) {
  const mark = fileMark(title, lang);
  if (!mark) return null;
  const size = mark.label.length > 2 ? 0.62 : 0.75;
  return (
    <svg
      className="deck-file-icon"
      viewBox="0 0 24 24"
      width="1.25em"
      height="1.25em"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="22" height="22" rx="5" fill={mark.bg} />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={mark.fg}
        fontSize={`${size * 16}`}
        fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      >
        {mark.label}
      </text>
    </svg>
  );
}

/** The title bar: a file-type badge (or the dot) and the name. */
export function CodeTitle({
  title,
  lang,
  children,
}: {
  title: string;
  lang?: string;
  children?: ReactNode;
}) {
  return (
    <div className="deck-code-title">
      {/* The badge when the name or language has one, the theme's dot otherwise. */}
      <FileIcon title={title} lang={lang} />
      <span className="deck-code-title-dot" />
      <span className="deck-code-title-text">{title}</span>
      {children}
    </div>
  );
}
