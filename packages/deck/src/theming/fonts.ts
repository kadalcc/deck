/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FONTS: the `fonts` headmatter key
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two spellings. The list Kadal always had, Google Fonts families as the css2 API writes them:
 *
 *   fonts: ["Inter:wght@400;600", "JetBrains Mono"]
 *
 * and Slidev's richer object, which also points the theme's font tokens at the families:
 *
 *   fonts:
 *     sans: Inter                    body text (and headings, unless `heading` says otherwise)
 *     heading: Fraunces              Kadal's own: headings only
 *     serif: Source Serif 4          --deck-serif-font, Tailwind's font-serif
 *     mono: Fira Code                code
 *     weights: "300,400,600,700"     every family (default 300,400,600,700)
 *     italic: true                   italics too (default false)
 *     provider: google               google · bunny · none (load nothing; the fonts are local)
 *     local: [Helvetica Neue]        families on the machine already: never fetched
 *     fallbacks: false               no system stack after the family (default true)
 *
 * Each family loads from its own stylesheet, so a family that does not have a weight asked for
 * (Google answers 400 for the whole request) costs that family only — and is asked for again
 * without the weights. Nothing here touches the DOM; theming/react.tsx does.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type FontProvider = "google" | "bunny" | "none";

/** The object form of `fonts`. */
export interface FontOptions {
  sans?: string;
  heading?: string;
  serif?: string;
  mono?: string;
  /** Comma-separated or a list: "300,400,600,700". */
  weights?: string | number | Array<string | number>;
  italic?: boolean;
  provider?: FontProvider;
  /** Families that are installed locally: never fetched. */
  local?: string | string[];
  /** Append a system fallback stack to each family (default true). */
  fallbacks?: boolean;
}

/** What a deck may write: the list, or the object. */
export type FontsInput = string[] | FontOptions;

export interface ResolvedFonts {
  /** One stylesheet per family to fetch (with its no-weights retry for Google). */
  sheets: Array<{ family: string; href: string; retry: string | null }>;
  /** CSS custom properties for the deck root: the theme's font tokens, pointed at the families. */
  vars: Record<string, string>;
  /** The families to wait for before a screenshot (`document.fonts.load`). */
  families: string[];
}

export const DEFAULT_WEIGHTS = [300, 400, 600, 700];

const FALLBACK = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

/** Generic families never fetched and never quoted. */
const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
]);

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .map((s) =>
      String(s)
        .trim()
        .replace(/^["']|["']$/g, ""),
    )
    .filter(Boolean);

function weightsOf(w: FontOptions["weights"]): number[] {
  const raw = Array.isArray(w)
    ? w
    : typeof w === "number"
      ? [w]
      : typeof w === "string"
        ? w.split(",")
        : [];
  const out = raw
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 1000);
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : DEFAULT_WEIGHTS;
}

const quote = (f: string) =>
  GENERIC.has(f.toLowerCase()) || f.startsWith("var(") ? f : `"${f.replace(/"/g, "")}"`;

/** A css2 family parameter: `Fira+Code:ital,wght@0,400;0,600;1,400;1,600`. */
export function googleFamily(family: string, weights: number[], italic: boolean): string {
  const name = family.trim().replace(/\s+/g, "+");
  const axis = italic
    ? `ital,wght@${[0, 1].flatMap((i) => weights.map((w) => `${i},${w}`)).join(";")}`
    : `wght@${weights.join(";")}`;
  return `${name}:${axis}`;
}

/** Bunny Fonts' (Google v1-compatible) parameter: `fira-code:400,600,400i,600i`. */
export function bunnyFamily(family: string, weights: number[], italic: boolean): string {
  const name = family.trim().toLowerCase().replace(/\s+/g, "-");
  const styles = [...weights.map(String), ...(italic ? weights.map((w) => `${w}i`) : [])];
  return `${name}:${styles.join(",")}`;
}

/** The legacy list form: one css2 stylesheet per entry, as written. */
function listSheets(families: string[]): ResolvedFonts["sheets"] {
  return families
    .filter((f) => typeof f === "string" && f.trim())
    .map((f) => {
      const param = encodeURIComponent(f.trim())
        .replace(/%20/g, "+")
        .replace(/%3A/gi, ":")
        .replace(/%40/g, "@")
        .replace(/%3B/gi, ";")
        .replace(/%2C/gi, ",");
      const family = f.split(":")[0]!.trim();
      return {
        family,
        href: `https://fonts.googleapis.com/css2?family=${param}&display=swap`,
        retry: f.includes(":")
          ? `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}&display=swap`
          : null,
      };
    });
}

/** `fonts` in either form → the stylesheets to load and the CSS variables to set. */
export function resolveFonts(input: unknown): ResolvedFonts {
  if (Array.isArray(input)) {
    const sheets = listSheets(input.filter((x): x is string => typeof x === "string"));
    return { sheets, vars: {}, families: sheets.map((s) => s.family) };
  }
  if (!input || typeof input !== "object") return { sheets: [], vars: {}, families: [] };
  const o = input as FontOptions;
  const provider: FontProvider =
    o.provider === "bunny" || o.provider === "none" ? o.provider : "google";
  const local = new Set(list(o.local).map((f) => f.toLowerCase()));
  const weights = weightsOf(o.weights);
  const italic = o.italic === true;
  const fallbacks = o.fallbacks !== false;

  const roles = {
    sans: list(o.sans),
    heading: list(o.heading),
    serif: list(o.serif),
    mono: list(o.mono),
  };
  const stack = (families: string[], kind: keyof typeof FALLBACK) =>
    [...families.map(quote), ...(fallbacks ? [FALLBACK[kind]] : [])].join(", ");

  const vars: Record<string, string> = {};
  if (roles.sans.length) {
    const s = stack(roles.sans, "sans");
    vars["--deck-body-font"] = s;
    vars["--font-sans"] = s;
    if (!roles.heading.length) vars["--deck-heading-font"] = s;
  }
  if (roles.heading.length) vars["--deck-heading-font"] = stack(roles.heading, "sans");
  if (roles.serif.length) {
    const s = stack(roles.serif, "serif");
    vars["--deck-serif-font"] = s;
    vars["--font-serif"] = s;
  }
  if (roles.mono.length) {
    const s = stack(roles.mono, "mono");
    vars["--deck-mono-font"] = s;
    vars["--font-mono"] = s;
  }

  const families = [
    ...new Set([...roles.sans, ...roles.heading, ...roles.serif, ...roles.mono]),
  ].filter((f) => !GENERIC.has(f.toLowerCase()) && !f.startsWith("var("));
  const remote = provider === "none" ? [] : families.filter((f) => !local.has(f.toLowerCase()));
  const sheets = remote.map((family) =>
    provider === "bunny"
      ? {
          family,
          href: `https://fonts.bunny.net/css?family=${bunnyFamily(family, weights, italic)}&display=swap`,
          retry: `https://fonts.bunny.net/css?family=${family.trim().toLowerCase().replace(/\s+/g, "-")}&display=swap`,
        }
      : {
          family,
          href: `https://fonts.googleapis.com/css2?family=${googleFamily(family, weights, italic)}&display=swap`,
          retry: `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, "+")}&display=swap`,
        },
  );
  return { sheets, vars, families };
}
