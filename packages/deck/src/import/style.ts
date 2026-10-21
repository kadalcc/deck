import type { Reporter } from "./report.ts";
import { applyDeclarations, scaleCssValue } from "./uno.ts";

/**
 * A slide's `<style>` from Slidev, for Kadal. Both scope a slide's `<style>` to that slide
 * (compiler/slide-style.ts), so the block stays where it is; its CSS changes in four ways:
 *
 *   - UnoCSS's `@apply mt-5 opacity-10;` becomes the declarations (uno.ts) — Kadal's scoped CSS
 *     never passes through a utility engine;
 *   - lengths are scaled from Slidev's 980px canvas to Kadal's stage (rem → `--slidev-rem`);
 *   - Slidev's class names become Kadal's (`.slidev-layout` → `.deck-layout`, `.slidev-page` →
 *     `.deck-slide`, `.two-cols-header` → `.deck-layout-two-cols-header`…);
 *   - `--slidev-theme-primary` is the Kadal theme's accent.
 *
 * `scoped` is dropped (it is the default); a preprocessor (`lang="scss"`) is reported, since the
 * CSS is used as written.
 */

const CLASS_MAP: Array<[RegExp, string]> = [
  [/\.slidev-layout\.two-columns\b/g, ".deck-layout-two-cols"],
  [/\.slidev-layout\.([a-z][\w-]*)\b/g, ".deck-layout-$1"],
  [/\.slidev-layout\b/g, ".deck-layout"],
  [/\.slidev-page\b/g, ".deck-slide"],
  [/\.slidev-code\b/g, ".deck-code"],
  [/\.slidev-vclick-target\b/g, ".deck-click"],
  [/\.slidev-vclick-hidden\b/g, ".deck-click.is-hidden"],
  [/\.two-cols-header\b/g, ".deck-layout-two-cols-header"],
  [/\.two-columns\b/g, ".deck-layout-two-cols"],
  [/\.col-left\b/g, ".deck-slot-default"],
  [/\.col-right\b/g, ".deck-slot-right"],
  [/--slidev-theme-primary\b/g, "--deck-accent"],
];

export interface StyleContext {
  scale: number;
  report: Reporter;
  lineAt: (offset: number) => number;
}

/** The CSS of a Slidev `<style>`, converted (see above); `unknown` lists @apply classes it skipped. */
export function convertCss(css: string, scale: number): { css: string; unknown: string[] } {
  const unknown: string[] = [];
  let out = css.replace(/@apply\s+([^;}]+);?/g, (_, list: string) => {
    const r = applyDeclarations(list.trim(), scale);
    unknown.push(...r.unknown);
    return r.css;
  });
  for (const [re, to] of CLASS_MAP) out = out.replace(re, to);
  // lengths, outside strings and url()s
  out = out
    .split(/(url\([^)]*\)|"[^"]*"|'[^']*')/)
    .map((part, i) => (i % 2 ? part : scaleCssValue(part, scale)))
    .join("");
  return { css: out, unknown };
}

export function convertStyle(block: string, ctx: StyleContext): string {
  const open = /^<style([^>]*)>/i.exec(block)!;
  const css = block.slice(open[0].length).replace(/<\/style\s*>$/i, "");
  const attrs = open[1]!.replace(/\s+scoped\b/, "");
  const lang = /\blang=["']?(\w+)/.exec(attrs)?.[1];
  if (lang && !/^(css|postcss)$/.test(lang))
    ctx.report({
      severity: "warning",
      line: ctx.lineAt(0),
      what: `A <style lang="${lang}"> is used as plain CSS; Kadal does not run ${lang}.`,
      suggestion: "Convert it to CSS (nesting works as written in modern browsers).",
    });
  const { css: next, unknown } = convertCss(css, ctx.scale);
  if (unknown.length)
    ctx.report({
      severity: "warning",
      what: `@apply in a <style> names classes the importer has no CSS for: ${[...new Set(unknown)].join(", ")}.`,
      suggestion: "Write those declarations out.",
    });
  return `<style${attrs.replace(/\s*lang=["']?(css|postcss)["']?/, "")}>${next}</style>`;
}
