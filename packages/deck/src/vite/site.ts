import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";

import { titleOf } from "../compiler/index.ts";
import type { PreparedSlide } from "../compiler/pipeline.ts";
import { headTags, injectHead } from "../core/head.ts";
import type { ResolvedPackage } from "../theming/resolve.ts";
import { RemoteAssets } from "./remote-assets.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUILT SITE  —  what `kadal-deck build` adds around the deck itself
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The deck plugin (vite/index.ts) hands four of its hooks to this module:
 *
 *   transformIndexHtml   (after Vite's own) the head from the headmatter — title, description,
 *                        Open Graph, Twitter, canonical, favicon, lang (core/head.ts) — in dev
 *                        and build; with `bundleRemoteAssets`, the page's remote links bundled
 *   transform            with `bundleRemoteAssets`: the slides', notes', manifest's and the
 *                        deck's own modules' remote URLs bundled (vite/remote-assets.ts), and the
 *                        `fonts:` stylesheets mapped for the runtime
 *   generateBundle       with `bundleRemoteAssets`: the CSS bundle's remote url()s and @imports
 *   closeBundle          in this order, once dist/ is written: the bundled files; og-image.png
 *                        (vite/pictures.ts); the PWA's icons, manifest and head (vite/pwa.ts);
 *                        the static-host fallbacks (vite/static-host.ts); and last sw.js, whose
 *                        precache list is every other file
 *
 * Switches, for the CLI: KADAL_DECK_BUILD_RECORD=<file> (where the build went, as JSON),
 * KADAL_DECK_TARGET=host (`kadal-deck publish`: no static-host files, and
 * no PWA unless KADAL_DECK_PWA=1), KADAL_DECK_PWA=0|1 and KADAL_DECK_REMOTE_ASSETS=0|1 over the
 * headmatter's `pwa` and `bundleRemoteAssets`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SiteContext {
  root: () => string;
  /** The deck file. */
  entry: () => string;
  base: () => string;
  outDir: () => string;
  publicDir: () => string | null;
  building: () => boolean;
  watching: () => boolean;
  /** The deck as the plugin last read it. */
  deck: () => {
    headmatter: Record<string, unknown>;
    slides: PreparedSlide[];
    packages: { theme: ResolvedPackage };
  };
  /** The manifest module's resolved id. */
  manifestId: string;
}

export interface SiteSettings {
  pwa: boolean;
  remoteAssets: boolean;
  staticHost: boolean;
}

/** What the headmatter and the CLI's switches ask the build for. */
export function siteSettings(
  headmatter: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
): SiteSettings {
  const hosted = env.KADAL_DECK_TARGET === "host";
  const pwaKey = headmatter.pwa;
  const pwaOn =
    pwaKey === true ||
    pwaKey === "true" ||
    pwaKey === "build" ||
    (!!pwaKey && typeof pwaKey === "object" && !Array.isArray(pwaKey));
  const remoteKey = headmatter.bundleRemoteAssets ?? headmatter.remoteAssets;
  return {
    pwa: env.KADAL_DECK_PWA === "1" ? true : env.KADAL_DECK_PWA === "0" || hosted ? false : pwaOn,
    remoteAssets:
      env.KADAL_DECK_REMOTE_ASSETS === "1"
        ? true
        : env.KADAL_DECK_REMOTE_ASSETS === "0"
          ? false
          : remoteKey === true || remoteKey === "true" || remoteKey === "build",
    staticHost: !hosted,
  };
}

/** The deck's title for the head: the headmatter's, else slide 1's heading. */
function deckTitle(headmatter: Record<string, unknown>, slides: PreparedSlide[]): string | null {
  if (typeof headmatter.title === "string" && headmatter.title.trim())
    return headmatter.title.trim();
  const first = slides.find((s) => s.frontmatter.hide !== true);
  return first ? titleOf(first) : null;
}

const SOURCE = /\.(m?[jt]sx?|mdx?)$/;

export function deckSite(ctx: SiteContext) {
  let assets: RemoteAssets | null = null;
  let settings: SiteSettings | null = null;
  /**
   * The deck, or null when there is none to read: the prebuilt shell builds the plugin with no
   * deck file (it compiles decks in the browser), and a deck that does not parse reports that
   * through its manifest, not by breaking the page's HTML.
   */
  const deckOrNull = () => {
    if (!existsSync(ctx.entry())) return null;
    try {
      return ctx.deck();
    } catch {
      return null;
    }
  };
  const settingsOf = () => (settings ??= siteSettings(deckOrNull()?.headmatter ?? {}));
  const remote = () => {
    if (!ctx.building() || !settingsOf().remoteAssets) return null;
    assets ??= new RemoteAssets({
      root: ctx.root(),
      base: ctx.base(),
      warn: (m) => console.warn(m),
    });
    return assets;
  };
  const say = (line: string) => console.log(line);

  async function ogPlan() {
    const { ogImagePlan } = await import("./pictures.ts");
    const seo = ctx.deck().headmatter.seoMeta as Record<string, unknown> | undefined;
    return ogImagePlan(seo?.ogImage, ctx.root(), ctx.publicDir());
  }

  async function themeColorsOnce() {
    const { themeColors } = await import("./pwa.ts");
    return themeColors(ctx.deck().packages.theme, ctx.root());
  }

  return {
    transformIndexHtml: {
      order: "post" as const,
      async handler(html: string) {
        // Read afresh for each page: the headmatter may have changed under `dev`.
        settings = null;
        const deck = deckOrNull();
        if (!deck) return html;
        const hm = deck.headmatter;
        let out = html;
        const r = remote();
        if (r) out = await r.html(out);
        const plan = await ogPlan();
        // In dev an `auto` card does not exist yet: only a committed one is named.
        const ogImageFile = plan.render && !ctx.building() ? null : plan.file;
        const colors = settingsOf().pwa && ctx.building() ? await themeColorsOnce() : null;
        const tags = headTags(
          { ...hm, title: deckTitle(hm, deck.slides) },
          {
            base: ctx.base(),
            ogImageFile,
            themeColor: colors ? { light: colors.light.bg, dark: colors.dark.bg } : null,
          },
        );
        return injectHead(out, tags, { lang: hm.lang });
      },
    },

    async transform(code: string, id: string) {
      const r = remote();
      if (!r) return null;
      if (id === ctx.manifestId) {
        let out = await r.code(code);
        const fonts = await r.fonts(ctx.deck().headmatter.fonts);
        if (Object.keys(fonts).length)
          out += `\nglobalThis.__KADAL_DECK_ASSETS__ = Object.assign(globalThis.__KADAL_DECK_ASSETS__ || {}, ${JSON.stringify(fonts)});\n`;
        return out === code ? null : { code: out, map: null };
      }
      const own =
        id.startsWith(`${ctx.manifestId}/slide/`) ||
        id.startsWith(`${ctx.manifestId}/notes/`) ||
        (!id.startsWith("\0") &&
          SOURCE.test(id.split("?")[0]!) &&
          !id.includes(`${sep}node_modules${sep}`) &&
          !id.includes("/node_modules/") &&
          !relative(ctx.root(), id).startsWith(".."));
      if (!own) return null;
      const out = await r.code(code);
      return out === code ? null : { code: out, map: null };
    },

    generateBundle: {
      order: "post" as const,
      async handler(
        _options: unknown,
        bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>,
      ) {
        const r = remote();
        if (!r) return;
        for (const file of Object.values(bundle)) {
          if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
          const css =
            typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source);
          const out = await r.css(css, file.fileName);
          if (out !== css) file.source = out;
        }
      },
    },

    async closeBundle(this: { environment?: { name: string } } | void) {
      const env = (this as { environment?: { name: string } } | undefined)?.environment;
      if (!ctx.building() || (env && env.name !== "client")) return;
      const outDir = ctx.outDir();
      const index = join(outDir, "index.html");
      const deck = deckOrNull();
      if (!existsSync(index) || !deck) return;
      const hm = deck.headmatter;
      const base = ctx.base();
      const s = settingsOf();
      // Where this build went, when `kadal-deck build` asks (several decks, the PDF step: cli/build.ts).
      const record = process.env.KADAL_DECK_BUILD_RECORD;
      if (record)
        writeFileSync(
          record,
          JSON.stringify({
            entry: relative(ctx.root(), ctx.entry()).split(sep).join("/"),
            outDir,
            base,
            title: deckTitle(hm, deck.slides),
          }),
        );

      // 1. The bundled remote assets (every hook that found some has finished by now).
      if (assets) {
        for (const [name, bytes] of await assets.files()) {
          const target = join(outDir, name);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, bytes);
        }
        for (const line of await assets.summary()) say(line);
      }

      // 2. The Open Graph card.
      const plan = await ogPlan();
      if (plan.file) {
        const pictures = await import("./pictures.ts");
        pictures.copyOgImage(plan, outDir);
        if (plan.render && !ctx.watching()) {
          const r = await pictures.renderOgImage({
            root: ctx.root(),
            outDir,
            base,
            file: plan.file,
          });
          if (r.ok) say(`[deck] ${plan.file}: slide 1 at 1200×630, for link previews`);
          else {
            say(`[deck] og image skipped: ${r.reason}`);
            // No picture: no tag pointing at one, and the plain card.
            const seo = (hm.seoMeta ?? {}) as Record<string, unknown>;
            let html = readFileSync(index, "utf8").replace(
              /[ \t]*<meta property="og:image" [^>]*>\r?\n?/g,
              "",
            );
            if (!seo.twitterCard)
              html = html.replace(
                /(<meta name="twitter:card" content=")summary_large_image(")/,
                "$1summary$2",
              );
            writeFileSync(index, html);
          }
        }
      }

      // 3. The app: icons, manifest, head.
      if (s.pwa) await writePwa(ctx, outDir, base, say);

      // 4. Routes, 404.html and _redirects for static hosts.
      if (s.staticHost) {
        const { writeStaticHostFiles } = await import("./static-host.ts");
        const { routePaths, routesFile } = await import("./packages.ts");
        const own = routePaths(routesFile(dirname(ctx.entry())));
        writeStaticHostFiles(outDir, base, ctx.publicDir(), own);
      }

      // 5. Last: the worker, whose list is every file above.
      if (s.pwa) {
        const { bypassPaths, writeServiceWorker } = await import("./pwa.ts");
        const live =
          hm.live && typeof hm.live === "object" ? (hm.live as { api?: unknown }).api : undefined;
        const sw = writeServiceWorker(outDir, base, {
          bypass: bypassPaths(base, live),
          warn: (m) => console.warn(m),
        });
        say(`[deck] pwa: sw.js precaches ${sw.files} files (version ${sw.version})`);
      }
    },
  };
}

async function writePwa(ctx: SiteContext, outDir: string, base: string, say: (l: string) => void) {
  const pwa = await import("./pwa.ts");
  const { rasterizeSvgs } = await import("./pictures.ts");
  const deck = ctx.deck();
  const hm = deck.headmatter;
  const options = pwa.pwaOptions(hm.pwa) ?? {};
  const colors = pwa.themeColors(deck.packages.theme, ctx.root());
  const title = deckTitle(hm, deck.slides) ?? "Deck";
  const at = (rel: string) => `${base}${rel}`;

  // The icon: the deck's own favicon when it is a local SVG or PNG, else the monogram.
  const fav = typeof hm.favicon === "string" ? hm.favicon.trim() : "";
  let ownSvg: string | null = null;
  let ownPng: { rel: string; width: number; height: number } | null = null;
  if (fav && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(fav)) {
    const rel = fav.replace(/^\.?\//, "").replace(/^\//, "");
    const file = [join(outDir, rel), join(ctx.root(), rel)].find((f) => existsSync(f));
    if (file && /\.svg$/i.test(rel)) ownSvg = readFileSync(file, "utf8");
    else if (file && /\.png$/i.test(rel)) {
      const size = pwa.pngSize(new Uint8Array(readFileSync(file)));
      if (size) ownPng = { rel, ...size };
    }
  }
  const icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> = [];
  let touchIcon: string | null = null;
  const publicHas = (rel: string) => {
    const p = ctx.publicDir();
    return !!p && existsSync(join(p, rel));
  };
  if (ownPng) {
    icons.push({
      src: at(ownPng.rel),
      sizes: `${ownPng.width}x${ownPng.height}`,
      type: "image/png",
      purpose: "any",
    });
    touchIcon = at(ownPng.rel);
  } else {
    const svg = ownSvg ?? pwa.monogramSvg(title, colors.light);
    const full = ownSvg ?? pwa.monogramSvg(title, colors.light, true);
    if (!publicHas("icon.svg")) writeFileSync(join(outDir, "icon.svg"), svg);
    icons.push({ src: at("icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" });
    const jobs = [
      { svg, size: 192, file: join(outDir, "icon-192.png") },
      { svg, size: 512, file: join(outDir, "icon-512.png") },
      { svg: full, size: 512, file: join(outDir, "icon-maskable-512.png") },
      { svg: full, size: 180, file: join(outDir, "apple-touch-icon.png") },
    ].filter((j) => !publicHas(j.file.slice(outDir.length + 1)));
    const r = await rasterizeSvgs(ctx.root(), jobs);
    if (r.ok) {
      icons.push(
        { src: at("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: at("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: at("icon-maskable-512.png"),
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      );
      touchIcon = at("apple-touch-icon.png");
    } else say(`[deck] pwa: icons as SVG only (${r.reason})`);
  }

  const manifest = pwa.webManifest({
    title,
    description: typeof hm.info === "string" ? hm.info.trim() : "",
    lang: typeof hm.lang === "string" ? hm.lang.trim() : "",
    base,
    colors: colors.light,
    icons,
    options,
  });
  writeFileSync(join(outDir, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
  const index = join(outDir, "index.html");
  let html = pwa.pwaHead(readFileSync(index, "utf8"), {
    base,
    colors,
    touchIcon,
    ...(options.themeColor ? { themeColor: options.themeColor } : {}),
  });
  if (!/<link\b[^>]*rel=["'](?:shortcut )?icon["']/i.test(html) && !ownPng)
    html = html.replace(
      /([ \t]*)<\/head>/i,
      (_m, i: string) =>
        `    <link rel="icon" href="${at("icon.svg")}" type="image/svg+xml" />\n${i}</head>`,
    );
  writeFileSync(index, html);
  say(`[deck] pwa: manifest.webmanifest, ${icons.length} icon${icons.length === 1 ? "" : "s"}`);
}

/**
 * `kadal-deck build a.mdx b.mdx`: the deck in KADAL_DECK_SUBDIR gets that folder appended to the
 * base and the outDir it would have had (the command line's, else the config's) — for the build
 * only, so `vite preview` of the result is told its folder plainly.
 */
export function subdirConfig(
  user: { base?: string; build?: { outDir?: string } },
  command: string,
  subdir = process.env.KADAL_DECK_SUBDIR,
): { base: string; build: { outDir: string } } | null {
  if (command !== "build" || !subdir) return null;
  const b = user.base ?? "/";
  return {
    base: `${b.endsWith("/") ? b : `${b}/`}${subdir}/`,
    build: { outDir: posix.join((user.build?.outDir ?? "dist").split(sep).join("/"), subdir) },
  };
}
