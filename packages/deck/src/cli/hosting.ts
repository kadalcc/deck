import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { splitDeck } from "../compiler/index.ts";
import { UsageError } from "./args.ts";
import { slugFrom } from "./publish.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HOSTING RECIPES  —  `kadal-deck ci <host>` (and `kadal-deck new --ci <host>`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The files each host needs to build and serve a deck, written for this deck — its package
 * manager (from the lockfile), its folder inside the repository, and whether its build needs a
 * browser (`download: true`, `seoMeta.ogImage: auto`, `pwa`):
 *
 *   github-pages   .github/workflows/deploy-deck.yml at the repository's root: build with
 *                  --base /<repo>/ (or / for a <owner>.github.io repository), upload, deploy.
 *                  The build's route copies and 404.html give every deck route a page.
 *   netlify        netlify.toml: the build, dist/, the single-page rewrite, cache headers
 *   vercel         vercel.json: the same, Vercel's way
 *   cloudflare     wrangler.jsonc: Workers static assets with single-page fallback
 *                  (`npx wrangler deploy` after the build); Pages' Git integration needs no file
 *   docker         Dockerfile + nginx.conf + .dockerignore: build in Node, serve dist/ from
 *                  nginx on :8080 (about 25 MB)
 *
 * Nothing is overwritten without --force. Each recipe says what to do next.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const HOSTS = ["github-pages", "netlify", "vercel", "cloudflare", "docker"] as const;
export type HostTarget = (typeof HOSTS)[number];

const ALIASES: Record<string, HostTarget> = {
  gh: "github-pages",
  "gh-pages": "github-pages",
  github: "github-pages",
  pages: "github-pages",
  "cloudflare-pages": "cloudflare",
  cf: "cloudflare",
  workers: "cloudflare",
};

export function hostTargets(spec: string): HostTarget[] {
  const out = new Set<HostTarget>();
  for (const raw of spec
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)) {
    const t = (HOSTS as readonly string[]).includes(raw) ? (raw as HostTarget) : ALIASES[raw];
    if (!t) throw new UsageError(`Unknown host "${raw}". Try: ${HOSTS.join(", ")}`);
    out.add(t);
  }
  if (!out.size) throw new UsageError(`Which host? ${HOSTS.join(", ")}`);
  return [...out];
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** The deck's package manager, from its lockfile (here or in a workspace above). */
export function detectPackageManager(dir: string): PackageManager {
  for (let d = resolve(dir); ; d = dirname(d)) {
    if (existsSync(join(d, "bun.lock")) || existsSync(join(d, "bun.lockb"))) return "bun";
    if (existsSync(join(d, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(d, "yarn.lock"))) return "yarn";
    if (existsSync(join(d, "package-lock.json"))) return "npm";
    if (dirname(d) === d) return "npm";
  }
}

const PM: Record<PackageManager, { install: string; run: (bin: string) => string }> = {
  npm: { install: "npm ci", run: (b) => `npx ${b}` },
  pnpm: { install: "pnpm install --frozen-lockfile", run: (b) => `pnpm exec ${b}` },
  yarn: { install: "yarn install --frozen-lockfile", run: (b) => `yarn ${b}` },
  bun: { install: "bun install --frozen-lockfile", run: (b) => `bun run ${b}` },
};

export interface HostingContext {
  /** The deck folder. */
  dir: string;
  /** The repository's root (where .git is), or the deck folder when there is none. */
  repoRoot: string;
  pm: PackageManager;
  /** The lockfile, here or in a workspace above (a fresh `new --no-install` deck has none). */
  lockfile: string | null;
  /** The build needs Chromium (a PDF, an OG card, PWA icons). */
  needsBrowser: boolean;
  /** The deck's slug (folder name), for names. */
  slug: string;
  /** Today, for a compatibility date. */
  today: string;
}

export function hostingContext(dir: string, now = new Date()): HostingContext {
  let repoRoot = resolve(dir);
  for (let d = resolve(dir); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) {
      repoRoot = d;
      break;
    }
    if (dirname(d) === d) break;
  }
  let headmatter: Record<string, unknown> = {};
  try {
    const file = join(dir, "deck.mdx");
    headmatter = splitDeck(readFileSync(file, "utf8"), { file }).headmatter;
  } catch {
    /* no deck.mdx yet: the recipes still apply */
  }
  const seo = (headmatter.seoMeta ?? {}) as Record<string, unknown>;
  const pm = detectPackageManager(dir);
  let lockfile: string | null = null;
  for (let d = resolve(dir); !lockfile; d = dirname(d)) {
    const f = ["bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"].find(
      (n) => existsSync(join(d, n)),
    );
    if (f) lockfile = join(d, f);
    if (dirname(d) === d) break;
  }
  return {
    dir: resolve(dir),
    repoRoot,
    pm,
    lockfile,
    needsBrowser: headmatter.download === true || seo.ogImage === "auto" || !!headmatter.pwa,
    slug: slugFrom(basename(resolve(dir))),
    today: now.toISOString().slice(0, 10),
  };
}

export interface HostingFile {
  /** Absolute path. */
  path: string;
  content: string;
}

/** The files for one host. */
export function hostingFiles(target: HostTarget, c: HostingContext): HostingFile[] {
  const pm = c.lockfile || c.pm !== "npm" ? PM[c.pm] : { ...PM.npm, install: "npm install" };
  const build = pm.run("kadal-deck build");
  // GitHub's runner and the Docker build are root on Debian/Ubuntu and can add Chromium's system
  // libraries; Netlify's and Vercel's images cannot, and carry them already.
  const browser = `${pm.run("playwright")} install --with-deps chromium`;
  const browserOnly = `${pm.run("playwright")} install chromium`;
  switch (target) {
    case "github-pages": {
      const rel = relative(c.repoRoot, c.dir).split(sep).join("/");
      const at = rel ? `${rel}/` : "";
      const lockAt = c.lockfile ? relative(c.repoRoot, c.lockfile).split(sep).join("/") : "";
      const cachePath = lockAt.includes("/") ? `\n          cache-dependency-path: ${lockAt}` : "";
      const setup =
        c.pm === "bun"
          ? `      - uses: oven-sh/setup-bun@v2\n`
          : c.pm === "pnpm"
            ? `      - uses: pnpm/action-setup@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: pnpm${cachePath}\n`
            : c.lockfile
              ? `      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: ${c.pm}${cachePath}\n`
              : `      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n`;
      return [
        {
          path: join(c.repoRoot, ".github", "workflows", "deploy-deck.yml"),
          content: `# Builds the deck and publishes it to GitHub Pages on every push to main.
# Once: Settings → Pages → Build and deployment → Source: GitHub Actions.
name: Deploy the deck

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest${rel ? `\n    defaults:\n      run:\n        working-directory: ${rel}` : ""}
    steps:
      - uses: actions/checkout@v4
${setup}      - run: ${pm.install}
${
  c.needsBrowser
    ? `      # The build prints a PDF, an Open Graph card or app icons: it needs Chromium.
      # (playwright must be in the deck's devDependencies: npm i -D playwright)
      - run: ${browser}
`
    : ""
}      # A project site lives at /<repository>/; a <owner>.github.io repository at /.
      - name: Build
        run: |
          repo="\${{ github.event.repository.name }}"
          if [ "$repo" = "\${{ github.repository_owner }}.github.io" ]; then base=/; else base="/$repo/"; fi
          ${build} --base "$base"
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${at}dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`,
        },
      ];
    }
    case "netlify":
      return [
        {
          path: join(c.dir, "netlify.toml"),
          content: `# Netlify: new site from this repository${c.dir !== c.repoRoot ? ` (base directory: ${relative(c.repoRoot, c.dir).split(sep).join("/")})` : ""}.
[build]
  command = "${c.needsBrowser ? `${browserOnly} && ` : ""}${build}"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

# The deck's routes (/presenter, /notes…) are one page. Files that exist are served first.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
`,
        },
      ];
    case "vercel":
      return [
        {
          path: join(c.dir, "vercel.json"),
          content: `${JSON.stringify(
            {
              $schema: "https://openapi.vercel.sh/vercel.json",
              buildCommand: `${c.needsBrowser ? `${browserOnly} && ` : ""}${build}`,
              outputDirectory: "dist",
              // Files are served first; any other path is the deck's page (/presenter, /notes…).
              rewrites: [{ source: "/(.*)", destination: "/index.html" }],
              headers: [
                {
                  source: "/assets/(.*)",
                  headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
                },
                { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
              ],
            },
            null,
            2,
          )}\n`,
        },
      ];
    case "cloudflare":
      return [
        {
          path: join(c.dir, "wrangler.jsonc"),
          content: `// Cloudflare Workers static assets: \`${build} && npx wrangler deploy\`.
// (Cloudflare Pages' Git integration needs no file: build command "${build}", output "dist".)
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": ${JSON.stringify(c.slug)},
  "compatibility_date": ${JSON.stringify(c.today)},
  "assets": {
    "directory": "./dist",
    // Any path that is not a file is the deck's page: /presenter, /notes, /remote…
    "not_found_handling": "single-page-application"
  }
}
`,
        },
      ];
    case "docker": {
      const lock = {
        npm: "package.json package-lock.json*",
        pnpm: "package.json pnpm-lock.yaml",
        yarn: "package.json yarn.lock",
        bun: "package.json bun.lock*",
      }[c.pm];
      const from = c.pm === "bun" ? "oven/bun:1" : "node:22-bookworm-slim";
      const corepack = c.pm === "pnpm" || c.pm === "yarn" ? "RUN corepack enable\n" : "";
      return [
        {
          path: join(c.dir, "Dockerfile"),
          content: `# The deck, built and served by nginx on :8080.
#   docker build -t ${c.slug} .            (--build-arg BASE=/talks/${c.slug}/ for a sub-path)
#   docker run --rm -p 8080:8080 ${c.slug}
FROM ${from} AS build
WORKDIR /deck
${corepack}COPY ${lock} ./
RUN ${pm.install}
COPY . .
${c.needsBrowser ? `RUN ${browser}\n` : ""}ARG BASE=/
RUN ${build} --base "$BASE"

FROM nginx:1.27-alpine
ARG BASE=/
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /deck/dist /usr/share/nginx/html\${BASE}
EXPOSE 8080
`,
        },
        {
          path: join(c.dir, "nginx.conf"),
          content: `server {
  listen 8080;
  root /usr/share/nginx/html;

  # Files first; any other path is the deck's page (/presenter, /notes…). A deck built with
  # --base gets route copies under its folder, so the fallback is only for stray paths.
  location / {
    try_files $uri $uri/ /index.html;
  }

  location ~ /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location ~ /(sw\\.js|index\\.html|manifest\\.webmanifest)$ {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
  }
}
`,
        },
        {
          path: join(c.dir, ".dockerignore"),
          content: "node_modules\ndist\nexport\nscreenshots\n.kadal-deck\n.git\n",
        },
      ];
    }
  }
}

/** What to do once the files exist. */
export function hostingNext(target: HostTarget, c: HostingContext): string {
  const build = PM[c.pm].run("kadal-deck build");
  switch (target) {
    case "github-pages":
      return "GitHub: Settings → Pages → Source: GitHub Actions, then push to main.";
    case "netlify":
      return "Netlify: Add new site → Import from Git (it reads netlify.toml).";
    case "vercel":
      return "Vercel: Add New → Project → import the repository (it reads vercel.json).";
    case "cloudflare":
      return `Cloudflare: ${build} && npx wrangler deploy`;
    case "docker":
      return `Docker: docker build -t ${c.slug} . && docker run --rm -p 8080:8080 ${c.slug}`;
  }
}

/** Write the recipes; refuses to replace a file unless `force`. */
export function writeHosting(
  dir: string,
  targets: HostTarget[],
  { force = false, now }: { force?: boolean; now?: Date } = {},
): { files: string[]; next: string[] } {
  const c = hostingContext(dir, now);
  const all = targets.flatMap((t) => hostingFiles(t, c));
  const clash = all.filter((f) => existsSync(f.path));
  if (clash.length && !force)
    throw new UsageError(
      `Already there: ${clash.map((f) => relative(process.cwd(), f.path) || f.path).join(", ")}. --force replaces them.`,
    );
  for (const f of all) {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, f.content);
  }
  return { files: all.map((f) => f.path), next: targets.map((t) => hostingNext(t, c)) };
}
