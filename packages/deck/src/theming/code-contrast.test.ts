import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { codeToTokens } from "shiki";

import { THEME_PACKAGES } from "../catalog/reference.ts";
import { blend, contrastRatio, hex, parseColor, type Rgb } from "../cli/contrast-math.ts";
import { DEFAULT_SHIKI } from "./merge.ts";

/**
 * The code a deck shows when neither it nor its theme names a Shiki pair, on every built-in
 * theme's code panel, in each scheme that theme draws: the starter's own code (slide 5, which
 * failed `kadal-deck contrast` at 2.87:1 on GitHub's default light theme) and a wider sample of
 * the tokens a talk's code has. Every token must clear WCAG's 4.5:1 on the panel and on the band
 * a stepped line (`{1|2-4}`) or a highlighted one wears. A menu theme (T) over such a deck keeps
 * the deck's colours (compiler/code-themes.ts), so this is also every theme picked from the menu.
 */

const repo = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const MIN = 4.5;

const SAMPLE = `import { readFile } from "node:fs/promises";

type Answer = { value: number; label?: string };
export class Oracle<T extends Answer> extends Base implements Asker {
  #cache = new Map<string, T>();
  static readonly MAX = 0x2a;
  async ask(question: string, ...rest: unknown[]): Promise<T | null> {
    if (!question || rest.length > 3) throw new Error(\`no: \${question}\`);
    const hit = this.#cache.get(question) ?? (await readFile("a.json", "utf8"));
    return /^\\d+$/.test(String(hit)) ? null : (JSON.parse(hit) as T);
  }
}`;

/** The fenced code of the starter deck, as a fresh `npm create @kadal/deck` deck has it. */
function starterCode(): Array<{ lang: string; code: string }> {
  const mdx = readFileSync(join(repo, "examples/starter/deck.mdx"), "utf8");
  return [...mdx.matchAll(/^```(\w+)[^\n]*\n([\s\S]*?)^```/gm)].map((m) => ({
    lang: m[1]!,
    code: m[2]!,
  }));
}

interface Panel {
  theme: string;
  scheme: "light" | "dark";
  /** The Shiki side drawn: the scheme's, unless a one-scheme theme pins its own. */
  side: "light" | "dark";
  bg: Rgb;
  band: Rgb;
}

/** `--name: value;` declarations of one rule, by its exact selector. */
function declarations(css: string, selector: string): Map<string, string> | null {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) return null;
  const body = css.slice(i + selector.length + 2, css.indexOf("}", i));
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

/** A custom property's colour: `var()` followed through the rule and the theme's base rule, and
 * `color-mix(in …, C P%, transparent)` read as C at P% (what the band tokens use). */
function colour(
  value: string,
  scopes: Array<Map<string, string>>,
  depth = 0,
): ReturnType<typeof parseColor> {
  if (depth > 8) return null;
  const v = value.trim();
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
  if (ref) {
    const found = scopes.find((s) => s.has(ref[1]!))?.get(ref[1]!);
    if (found) return colour(found, scopes, depth + 1);
    return ref[2] ? colour(ref[2], scopes, depth + 1) : null;
  }
  const mix =
    /^color-mix\(\s*in [\w-]+\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)$/.exec(v);
  if (mix) {
    const c = colour(mix[1]!, scopes, depth + 1);
    return c ? { ...c, a: c.a * (Number(mix[2]) / 100) } : null;
  }
  return parseColor(v);
}

function panels(theme: string, css: string, colorScheme: "light" | "dark" | "both"): Panel[] {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const base = declarations(css, `.theme-${theme}`);
  if (!base) throw new Error(`.theme-${theme} has no base rule`);
  const light = declarations(css, `.theme-${theme}[data-color-scheme="light"]`);
  const dark = declarations(css, `.theme-${theme}[data-color-scheme="dark"]`);
  // The base rule is the scheme the theme starts in: dark when it is the light one that is the
  // variant (rla), or when the theme only draws dark.
  const baseScheme = light || colorScheme === "dark" ? "dark" : "light";
  const rules: Array<["light" | "dark", Map<string, string>]> = [[baseScheme, base]];
  if (light) rules.push(["light", light]);
  if (dark) rules.push(["dark", dark]);
  return rules.map(([scheme, decl]) => {
    const scopes = [decl, base];
    const bg = colour(decl.get("--deck-code-bg") ?? base.get("--deck-code-bg") ?? "", scopes);
    if (!bg) throw new Error(`${theme} (${scheme}): no --deck-code-bg colour`);
    const active = colour(
      decl.get("--deck-code-active") ?? base.get("--deck-code-active") ?? "transparent",
      scopes,
    );
    const bgRgb = blend(bg, { r: 255, g: 255, b: 255 });
    return {
      theme,
      scheme,
      side: colorScheme === "both" ? scheme : colorScheme,
      bg: bgRgb,
      band: active ? blend(active, bgRgb) : bgRgb,
    };
  });
}

function allPanels(): Panel[] {
  const out: Panel[] = [];
  for (const name of ["minimal", "rla", "stack"])
    out.push(
      ...panels(
        name,
        readFileSync(join(repo, "packages/deck/src/themes", `${name}.css`), "utf8"),
        "both",
      ),
    );
  for (const t of THEME_PACKAGES)
    out.push(
      ...panels(
        t.name,
        readFileSync(join(repo, "packages", `theme-${t.name}`, "style.css"), "utf8"),
        t.scheme as "light" | "dark" | "both",
      ),
    );
  return out;
}

async function inks(code: string, lang: string, theme: string): Promise<Map<string, string>> {
  const { tokens } = await codeToTokens(code, { lang: lang as never, theme });
  const out = new Map<string, string>();
  for (const line of tokens)
    for (const t of line)
      if (t.content.trim() && t.color) out.set(t.color.toLowerCase(), t.content.trim());
  return out;
}

describe("the default Shiki pair is legible on every built-in code panel", () => {
  const all = allPanels();
  test("the panels were read (core themes and every theme package)", () => {
    expect(new Set(all.map((p) => p.theme)).size).toBe(3 + THEME_PACKAGES.length);
  });

  const sources = [...starterCode(), { lang: "ts", code: SAMPLE }];
  for (const side of ["light", "dark"] as const) {
    test(`${DEFAULT_SHIKI[side]}: every token ≥ ${MIN}:1, on the panel and on a stepped line`, async () => {
      const colours = new Map<string, string>();
      for (const s of sources)
        for (const [c, t] of await inks(s.code, s.lang, DEFAULT_SHIKI[side])) colours.set(c, t);
      expect(colours.size).toBeGreaterThan(5);
      const failures: string[] = [];
      for (const p of all.filter((p) => p.side === side))
        for (const [c, text] of colours) {
          const ink = parseColor(c)!;
          for (const [where, bg] of [
            ["panel", p.bg],
            ["band", p.band],
          ] as const) {
            const r = contrastRatio(blend(ink, bg), bg);
            if (r < MIN)
              failures.push(
                `${p.theme} ${p.scheme} ${where} ${hex(bg)}: "${text}" ${c} ${r.toFixed(2)}`,
              );
          }
        }
      expect(failures).toEqual([]);
    });
  }
});
