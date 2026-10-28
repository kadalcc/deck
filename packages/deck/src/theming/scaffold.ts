/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THEME AND ADDON SCAFFOLDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `kadal-deck new --theme <name>` and `npm create @kadal/deck -- --theme <name>` (and `--addon`)
 * write a package that is ready to publish: package.json per the contract (theming/contract.ts),
 * a stylesheet that sets every token in light and dark and styles every layout class, a layout,
 * a layer, a README, and a preview deck that uses the package from its folder (`theme: ../`).
 *
 * Pure strings: no React, no Node. @kadal/create-deck renders these at its build with sentinel
 * names and fills the real ones in when it runs, so the two scaffolds can never drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ScaffoldOptions {
  /** The short name: `aurora` → kadal-theme-aurora, `.theme-aurora`. */
  name: string;
  /** The display name: "Aurora". */
  title: string;
  /** The @kadal/deck version range to depend on, e.g. "^0.4.0". */
  deckRange: string;
}

/** Every layout the engine has, as `.deck-layout-<name>` (a test checks this against LAYOUTS). */
export const LAYOUT_CLASSES = [
  "default",
  "center",
  "cover",
  "intro",
  "section",
  "end",
  "fact",
  "quote",
  "statement",
  "full",
  "two-cols",
  "two-cols-header",
  "image",
  "image-left",
  "image-right",
  "iframe",
  "iframe-left",
  "iframe-right",
] as const;

/** Every token a theme sets (`--deck-*`), with what it is for. A test checks base.css has each. */
export const THEME_TOKENS: Array<[token: string, purpose: string]> = [
  ["--deck-bg", "the slide's background"],
  ["--deck-fg", "text"],
  ["--deck-muted", "secondary text: subtitles, captions, the slide number"],
  ["--deck-accent", "links, highlights, the progress bar, active controls"],
  ["--deck-accent-2", "a second accent: gradients, the second series"],
  ["--deck-surface", "cards, callouts, inline code: a faint layer over the background"],
  ["--deck-border", "hairlines: tables, cards, rules"],
  ["--deck-heading-font", "headings"],
  ["--deck-body-font", "body text"],
  ["--deck-mono-font", "code"],
  ["--deck-serif-font", "the serif face (fonts.serif; Tailwind's font-serif)"],
  ["--deck-code-bg", "code block background"],
  ["--deck-code-fg", "code block text without a Shiki colour"],
  ["--deck-code-active", "the highlighted line's wash"],
  ["--deck-radius", "corner radius of cards, code, images"],
  ["--deck-pad", "the slide's padding"],
  ["--deck-base-size", "the slide's base font size (1em on a slide)"],
  ["--deck-live", "the live room's accent (reactions, polls)"],
  ["--deck-transition", "the slide transition's length"],
];

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

function themeCss({ name, title }: ScaffoldOptions): string {
  const t = `.theme-${name}`;
  return `/* ${title} — a Kadal Deck theme.

   Everything is scoped under ${t}, so this file can sit beside any other theme (the deck's
   theme menu switches between them). Dark mode is ${t}[data-color-scheme="dark"]: the deck root
   carries both, and so does a slide that forces its own scheme (\`colorScheme: dark\`).

   themeConfig: each key of the package's (and the deck's) \`themeConfig\` arrives as a custom
   property \`--theme-<kebab-key>\` on the deck root. Always read one with a fallback. */

${t} {
  /* colour */
  --deck-bg: #fbfaf7;
  --deck-fg: #1c1917;
  --deck-muted: #78716c;
  --deck-accent: var(--theme-primary, #0f766e);
  --deck-accent-2: var(--theme-secondary, #b45309);
  --deck-surface: rgba(28, 25, 23, 0.05);
  --deck-border: rgba(28, 25, 23, 0.12);
  --deck-live: var(--theme-primary, #0f766e);
  /* type */
  --deck-heading-font: "Fraunces", Georgia, "Times New Roman", serif;
  --deck-body-font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --deck-mono-font: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --deck-serif-font: "Fraunces", Georgia, serif;
  --deck-base-size: 34px;
  /* code */
  --deck-code-bg: #f5f3ee;
  --deck-code-fg: #292524;
  --deck-code-active: color-mix(in oklab, var(--deck-accent) 14%, transparent);
  /* shape */
  --deck-radius: 14px;
  --deck-pad: 88px;
  --deck-transition: 600ms;
  --deck-controls-color: var(--deck-accent);
}
${t}[data-color-scheme="dark"] {
  --deck-bg: #141210;
  --deck-fg: #f5f5f4;
  --deck-muted: #a8a29e;
  --deck-accent: var(--theme-primary-dark, var(--theme-primary, #2dd4bf));
  --deck-accent-2: var(--theme-secondary-dark, var(--theme-secondary, #fbbf24));
  --deck-surface: rgba(245, 245, 244, 0.06);
  --deck-border: rgba(245, 245, 244, 0.14);
  --deck-code-bg: #1c1917;
  --deck-code-fg: #e7e5e4;
}

/* ── type ─────────────────────────────────────────────────────────────── */
${t} .deck-slide :is(h1, h2, h3) {
  font-family: var(--deck-heading-font);
  font-weight: 600;
  letter-spacing: -0.02em;
}
${t} .deck-slide h1 {
  font-size: 3em;
  line-height: 1.05;
}
${t} .deck-slide h2 {
  font-size: 2em;
}
${t} .deck-slide a {
  color: var(--deck-accent);
  text-underline-offset: 0.15em;
}
${t} .deck-slide blockquote {
  border-inline-start: 0.2em solid var(--deck-accent);
  background: var(--deck-surface);
}

/* ── the layouts: one block per .deck-layout-<name> ───────────────────── */
${t} .deck-layout-default {
  /* content from the top left */
}
${t} .deck-layout-center {
  /* everything centred */
}
${t} .deck-layout-cover {
  align-items: flex-start;
}
${t} .deck-layout-cover h1 {
  font-size: 3.6em;
  max-width: 16ch;
}
${t} .deck-layout-cover::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 0.35em;
  background: linear-gradient(90deg, var(--deck-accent), var(--deck-accent-2));
}
${t} .deck-layout-intro h1 {
  font-size: 3em;
}
${t} .deck-layout-section {
  align-items: flex-start;
}
${t} .deck-layout-section h1,
${t} .deck-layout-section h2 {
  font-size: 3.2em;
  max-width: 14ch;
}
${t} .deck-layout-section::before {
  content: "";
  display: block;
  width: 2.4em;
  height: 0.2em;
  margin-bottom: 0.8em;
  background: var(--deck-accent);
}
${t} .deck-layout-end h1 {
  font-size: 3.4em;
}
${t} .deck-layout-fact > :is(h1, h2, p) {
  color: var(--deck-accent);
}
${t} .deck-layout-quote {
  font-family: var(--deck-heading-font);
}
${t} .deck-layout-statement h1 {
  font-size: 3.2em;
}
${t} .deck-layout-full {
  /* edge to edge, no padding */
}
${t} .deck-layout-two-cols {
  column-gap: 2.5em;
}
${t} .deck-layout-two-cols-header > .deck-slot-default {
  padding-bottom: 0.4em;
  border-bottom: 1px solid var(--deck-border);
}
${t} .deck-layout-two-cols-header > :is(.deck-slot-left, .deck-slot-right) {
  padding-top: 0.3em;
}
${t} .deck-layout-image .deck-layout-image-content {
  /* the words over a full-bleed image */
}
${t} .deck-layout-image-left .deck-layout-image-content,
${t} .deck-layout-image-right .deck-layout-image-content {
  background: var(--deck-bg);
}
${t} .deck-layout-image-pane {
  /* the picture */
}
${t} .deck-layout-iframe,
${t} .deck-layout-iframe-left,
${t} .deck-layout-iframe-right {
  background: var(--deck-surface);
}
${t} .deck-layout-iframe-content {
  /* the words beside an embedded page */
}

/* ── this theme's own layout (layouts.tsx) ────────────────────────────── */
${t} .deck-layout-hero {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  align-items: center;
  gap: 2em;
}
${t} .deck-layout-hero-panel {
  align-self: stretch;
  border-radius: var(--deck-radius);
  background:
    radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--deck-accent) 55%, transparent), transparent 60%),
    radial-gradient(circle at 70% 80%, color-mix(in oklab, var(--deck-accent-2) 45%, transparent), transparent 55%),
    var(--deck-surface);
}

/* ── the footer layer (index.tsx) ─────────────────────────────────────── */
${t} .${name}-footer {
  position: absolute;
  inset: auto var(--deck-pad) calc(var(--deck-pad) * 0.35) var(--deck-pad);
  display: flex;
  justify-content: space-between;
  font-size: 0.5em;
  color: var(--deck-muted);
  letter-spacing: 0.04em;
}
`;
}

function themeLayouts({ name }: ScaffoldOptions): string {
  return `import type { LayoutProps } from "@kadal/deck";

/**
 * A layout is a React component a slide picks by name (\`layout: hero\`). It gets the slide's
 * MDX as children and its frontmatter, and wraps them in \`.deck-layout\` plus a class of its own
 * that style.css styles. Exporting a built-in name (\`cover\`, \`default\`…) replaces it.
 */
export function Hero({ children, frontmatter }: LayoutProps) {
  const image = typeof frontmatter.image === "string" ? frontmatter.image : null;
  return (
    <div className="deck-layout deck-layout-hero">
      <div className="deck-layout-hero-body">{children}</div>
      <div
        className="deck-layout-hero-panel"
        aria-hidden
        style={image ? { backgroundImage: \`url(\${image})\`, backgroundSize: "cover" } : undefined}
      />
    </div>
  );
}

export const layouts = { hero: Hero };
// \`${name}\`'s layouts, by the name a slide's \`layout:\` uses.
`;
}

function themeIndex({ name }: ScaffoldOptions): string {
  return `import { type LayerProps, useDeck } from "@kadal/deck";

import { layouts } from "./layouts.tsx";

/**
 * The theme's module: layouts, components and layers merge in under the deck's own (the deck
 * wins, then its addons, then the theme). The stylesheet is style.css, imported by the deck for
 * you because package.json exports it.
 */

/** A footer on every slide but the cover: the deck's title and "page / total". */
function Footer({ page, total, layout }: LayerProps) {
  const deck = useDeck();
  if (layout === "cover" || deck.config.themeConfig.footer === false) return null;
  return (
    <footer className="${name}-footer">
      <span>{deck.config.title}</span>
      <span>
        {page} / {total}
      </span>
    </footer>
  );
}

export default {
  layouts,
  components: {},
  layers: { "slide-bottom": Footer },
};
`;
}

function readmeTheme(o: ScaffoldOptions): string {
  return `# kadal-theme-${o.name}

**${o.title}**, a theme for [Kadal Deck](https://deck.kadal.cc).

\`\`\`bash
npm install kadal-theme-${o.name}
\`\`\`

\`\`\`yaml
---
theme: ${o.name}
themeConfig:
  primary: "#0f766e"     # --theme-primary: the accent
  footer: true           # the title and page number under every slide
---
\`\`\`

## Layouts

Every built-in layout, styled, plus:

| layout | what |
|---|---|
| \`hero\` | words on the left, a panel (or \`image:\`) on the right |

## Develop

\`\`\`bash
npm install
npm run dev        # the preview deck (preview/deck.mdx), live
npm run check      # lint the preview deck
\`\`\`

\`style.css\` sets every token in light and dark; \`layouts.tsx\` has the layouts; \`index.tsx\`
exports them with the footer layer. \`package.json\` → \`kadal.theme\` carries the metadata: the
name (the CSS class), the colour schemes, \`themeConfig\` defaults, Shiki themes, and the slide and
deck defaults the theme brings.

## Publish

\`\`\`bash
npm publish
\`\`\`

Keep the \`kadal-theme\` keyword: it is how people (and \`kadal-deck info themes\`) find it.
`;
}

function addonIndex({ name, title }: ScaffoldOptions): string {
  const C = title.replace(/[^A-Za-z0-9]/g, "") || "Addon";
  return `import type { LayerProps, SetupApi } from "@kadal/deck";
import type { ReactNode } from "react";

/**
 * ${title}: an addon for Kadal Deck. An addon brings features any theme can use — components,
 * layouts, layers, a stylesheet and a \`setup\` — and a deck lists it in \`addons:\`.
 */

/** A component slides use by name: <${C}Note>…</${C}Note>. */
function ${C}Note({ children }: { children?: ReactNode }) {
  return <aside className="${name}-note">{children}</aside>;
}

/** A thin progress line over every slide. */
function Progress({ page, total }: LayerProps) {
  return <div className="${name}-progress" style={{ width: \`\${(page / Math.max(1, total)) * 100}%\` }} />;
}

/** Runs once the deck is up: commands, keys, renderers. Return a cleanup if you need one. */
function setup(api: SetupApi) {
  const off = api.commands.register({
    id: "${name}.hello",
    title: "Say hello",
    description: "Shows a short greeting from the ${title} addon.",
    group: "view",
    run: () => api.deck.actions.toast("Hello from ${title}"),
  });
  api.shortcut("shift+h", () => void api.commands.run("${name}.hello", {}, "keyboard"));
  return off;
}

export default {
  components: { ${C}Note },
  layouts: {},
  layers: { "global-top": Progress },
  setup,
};
`;
}

function addonCss({ name }: ScaffoldOptions): string {
  return `/* The addon's stylesheet: classes of its own, prefixed so they meet nothing else. Use the
   theme's tokens (--deck-accent, --deck-surface…) so the addon looks at home in any theme. */
.${name}-note {
  margin: 0.4em 0;
  padding: 0.6em 0.9em;
  border-radius: var(--deck-radius);
  border: 1px solid var(--deck-border);
  border-inline-start: 0.25em solid var(--deck-accent);
  background: var(--deck-surface);
}
.${name}-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 6px;
  background: var(--deck-accent);
  transition: width var(--deck-transition) ease;
}
@media (prefers-reduced-motion: reduce) {
  .${name}-progress {
    transition: none;
  }
}
`;
}

function readmeAddon(o: ScaffoldOptions): string {
  const C = o.title.replace(/[^A-Za-z0-9]/g, "") || "Addon";
  return `# kadal-addon-${o.name}

**${o.title}**, an addon for [Kadal Deck](https://deck.kadal.cc).

\`\`\`bash
npm install kadal-addon-${o.name}
\`\`\`

\`\`\`yaml
---
addons: [${o.name}]
---

<${C}Note>Slides can use the addon's components by name.</${C}Note>
\`\`\`

It adds:

- \`<${C}Note>\`, a component;
- a progress line over every slide (the \`global-top\` layer);
- the command \`${o.name}.hello\`, on Shift+H.

## Develop

\`\`\`bash
npm install
npm run dev        # the preview deck (preview/deck.mdx), live
\`\`\`

Keep the \`kadal-addon\` keyword when you publish: it is how people find it.
`;
}

function previewFiles(kind: "theme" | "addon", o: ScaffoldOptions): Record<string, string> {
  const C = o.title.replace(/[^A-Za-z0-9]/g, "") || "Addon";
  const head =
    kind === "theme"
      ? `theme: ../\nthemeConfig:\n  primary: "#0f766e"`
      : `theme: minimal\naddons:\n  - ../`;
  const body =
    kind === "theme"
      ? `# ${o.title}

A theme for Kadal Deck · press T for the theme menu

---
layout: section
---

# A section

---

## Default

- Body text in the theme's face
- \`inline code\` and a [link](https://deck.kadal.cc)

\`\`\`ts
const theme = "${o.name}"; // code in the theme's Shiki colours
\`\`\`

---
layout: two-cols-header
---

## Two columns under a header

::left::

The left column.

::right::

The right column.

---
layout: hero
---

# The hero layout

The theme's own layout, from layouts.tsx.

---
layout: fact
---

# 42%

A fact, very large.

---
layout: quote
---

> A quote, in the heading face.

---
layout: end
---

# Thank you`
      : `# ${o.title}

An addon for Kadal Deck

---

## Its component

<${C}Note>A note from the addon.</${C}Note>

Press Shift+H for its command. The line along the top is its layer.`;
  return {
    "preview/deck.mdx": `---\ntitle: ${o.title} preview\n${head}\n---\n\n${body}\n`,
    "preview/index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${o.title} preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`,
    "preview/src/main.tsx": `import { Deck } from "@kadal/deck";
import "@kadal/deck/styles.css";
import { PresenterPage } from "@kadal/deck/presenter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import manifest from "virtual:deck";

// The ${kind} itself needs no import here: deck.mdx names it, and the deck plugin brings its
// stylesheet and module in.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck manifest={manifest} pages={{ presenter: PresenterPage }} />
  </StrictMode>,
);
`,
    "preview/vite.config.ts": `import { deck } from "@kadal/deck/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [deck(), react()] });
`,
    "preview/env.d.ts": `declare module "virtual:deck" {
  import type { DeckManifest } from "@kadal/deck";
  const manifest: DeckManifest;
  export default manifest;
}
`,
  };
}

const TSCONFIG = json({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: "react-jsx",
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  },
  include: ["*.tsx", "preview/src", "preview/env.d.ts"],
});

const GITIGNORE = "node_modules/\npreview/dist/\n.DS_Store\n";

/** The files of a new theme package, by path. */
export function themeScaffold(o: ScaffoldOptions): Record<string, string> {
  return {
    "package.json": json({
      name: `kadal-theme-${o.name}`,
      version: "0.1.0",
      description: `${o.title}: a theme for Kadal Deck.`,
      keywords: ["kadal-theme", "kadal-deck", "presentation", "slides", "theme"],
      license: "MIT",
      type: "module",
      files: ["style.css", "index.tsx", "layouts.tsx", "README.md"],
      exports: {
        ".": "./index.tsx",
        "./style.css": "./style.css",
        "./package.json": "./package.json",
      },
      kadal: {
        theme: {
          name: o.name,
          title: o.title,
          colorScheme: "both",
          swatch: ["#0f766e", "#b45309"],
          themeConfig: { primary: "#0f766e", footer: true },
          shiki: { light: "github-light-high-contrast", dark: "github-dark-high-contrast" },
          config: {
            transition: "fade",
            fonts: { sans: "Inter", heading: "Fraunces", mono: "JetBrains Mono" },
          },
          defaults: {},
          layouts: ["hero"],
          components: [],
        },
      },
      scripts: {
        dev: "kadal-deck dev -C preview",
        build: "kadal-deck build -C preview",
        check: "kadal-deck check -C preview",
      },
      peerDependencies: { "@kadal/deck": o.deckRange, react: "^19.2.0" },
      devDependencies: {
        "@kadal/deck": o.deckRange,
        "@vitejs/plugin-react": "^6.0.2",
        react: "^19.2.7",
        "react-dom": "^19.2.7",
        vite: "^8.0.16",
      },
    }),
    "style.css": themeCss(o),
    "layouts.tsx": themeLayouts(o),
    "index.tsx": themeIndex(o),
    "README.md": readmeTheme(o),
    "tsconfig.json": TSCONFIG,
    _gitignore: GITIGNORE,
    ...previewFiles("theme", o),
  };
}

/** The files of a new addon package, by path. */
export function addonScaffold(o: ScaffoldOptions): Record<string, string> {
  const C = o.title.replace(/[^A-Za-z0-9]/g, "") || "Addon";
  return {
    "package.json": json({
      name: `kadal-addon-${o.name}`,
      version: "0.1.0",
      description: `${o.title}: an addon for Kadal Deck.`,
      keywords: ["kadal-addon", "kadal-deck", "presentation", "slides", "addon"],
      license: "MIT",
      type: "module",
      files: ["style.css", "index.tsx", "README.md"],
      exports: {
        ".": "./index.tsx",
        "./style.css": "./style.css",
        "./package.json": "./package.json",
      },
      kadal: {
        addon: { name: o.name, title: o.title, components: [`${C}Note`], layouts: [] },
      },
      scripts: { dev: "kadal-deck dev -C preview", build: "kadal-deck build -C preview" },
      peerDependencies: { "@kadal/deck": o.deckRange, react: "^19.2.0" },
      devDependencies: {
        "@kadal/deck": o.deckRange,
        "@types/react": "^19.2.0",
        "@vitejs/plugin-react": "^6.0.2",
        react: "^19.2.7",
        "react-dom": "^19.2.7",
        vite: "^8.0.16",
      },
    }),
    "style.css": addonCss(o),
    "index.tsx": addonIndex(o),
    "README.md": readmeAddon(o),
    "tsconfig.json": TSCONFIG,
    _gitignore: GITIGNORE,
    ...previewFiles("addon", o),
  };
}

/** `my theme` → `my-theme`: the short name a package and a CSS class can both carry. */
export function scaffoldName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^kadal-(theme|addon)-/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `my-theme` → `My Theme`. */
export function scaffoldTitle(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
