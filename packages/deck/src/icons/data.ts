import { ICONIFY_PREFIXES } from "./collections.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ICONIFY ICONS, AS DATA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Any icon of any Iconify set, by name: `<Icon name="mdi:account" />`, or Slidev's tag form
 * `<mdi-account />`, `<logos-vue />`, `<carbon-x />` — which the compiler turns into the former
 * (compiler/remark-icons.ts). Lucide names without a set (`<Icon name="rocket" />`) keep drawing
 * from the bundled lucide-react, as they always have.
 *
 * Where the drawing comes from:
 *
 *   kadal-deck dev / build   the deck's own `@iconify-json/<set>` (or the whole `@iconify/json`),
 *                            read at compile time (icons/node.ts); each slide's module registers
 *                            the icons it uses (icons/registry.ts), so a built deck needs no network
 *   the hosted shell, or     the Iconify API, fetched once per icon when a slide first shows it,
 *   a set not installed      batched per set and kept in the browser; a box stands in offline
 *
 * This file is the part both sides share: names, and the Iconify JSON format (an icon's `body`
 * is the inside of an `<svg>`; `aliases` point at another icon with an optional flip or turn).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** One icon, ready to draw: the inside of an `<svg viewBox="left top width height">`. */
export interface IconData {
  body: string;
  width: number;
  height: number;
  left?: number;
  top?: number;
}

interface IconifyIcon {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  rotate?: number;
  hFlip?: boolean;
  vFlip?: boolean;
}

/** An icon set file (`@iconify-json/<set>/icons.json`) or an API answer — the same format. */
export interface IconifySet {
  prefix: string;
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, Partial<IconifyIcon> & { parent: string }>;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  not_found?: string[];
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `"mdi:account"` → `{ prefix: "mdi", name: "account" }`; null for a Lucide name or nonsense. */
export function parseIconName(full: string): { prefix: string; name: string } | null {
  const at = full.indexOf(":");
  if (at <= 0) return null;
  const prefix = full.slice(0, at);
  const name = full.slice(at + 1);
  return NAME.test(prefix) && NAME.test(name) ? { prefix, name } : null;
}

/**
 * A lowercase tag as an icon: `mdi-account-circle` → `mdi:account-circle`. The longest known set
 * wins, as in unplugin-icons, so `mdi-light-home` is `mdi-light:home` and `simple-icons-github`
 * is `simple-icons:github`. Null when no known set starts the tag — a custom element stays one.
 * An `i-` in front (UnoCSS's class spelling, `i-carbon-logo-github` or `i-carbon:logo-github`)
 * is read the same way.
 */
export function iconFromTag(tag: string): string | null {
  let t = tag.toLowerCase();
  if (t.startsWith("i-")) t = t.slice(2);
  const colon = t.indexOf(":");
  if (colon > 0) {
    const parsed = parseIconName(t);
    return parsed && ICONIFY_PREFIXES.has(parsed.prefix) ? t : null;
  }
  if (!NAME.test(t)) return null;
  const parts = t.split("-");
  for (let n = parts.length - 1; n >= 1; n--) {
    const prefix = parts.slice(0, n).join("-");
    if (ICONIFY_PREFIXES.has(prefix)) return `${prefix}:${parts.slice(n).join("-")}`;
  }
  return null;
}

/** The npm package that carries a set, for the "install it" hint. */
export const iconPackage = (prefix: string) => `@iconify-json/${prefix}`;

/**
 * One icon out of a set, aliases followed (at most a few hops, an alias may point at an alias) and
 * their flips and quarter turns applied. Null when the set has no such icon.
 */
export function iconFromSet(set: IconifySet, name: string): IconData | null {
  let rotate = 0;
  let hFlip = false;
  let vFlip = false;
  let own: Partial<IconifyIcon> = {};
  let current = name;
  for (let hop = 0; hop < 6; hop++) {
    const icon = set.icons[current];
    if (icon) {
      const width = own.width ?? icon.width ?? set.width ?? 16;
      const height = own.height ?? icon.height ?? set.height ?? 16;
      const left = own.left ?? icon.left ?? set.left ?? 0;
      const top = own.top ?? icon.top ?? set.top ?? 0;
      rotate += icon.rotate ?? 0;
      hFlip = hFlip !== !!icon.hFlip;
      vFlip = vFlip !== !!icon.vFlip;
      return transformed({ body: icon.body, width, height, left, top }, rotate, hFlip, vFlip);
    }
    const alias = set.aliases?.[current];
    if (!alias) return null;
    rotate += alias.rotate ?? 0;
    if (alias.hFlip) hFlip = !hFlip;
    if (alias.vFlip) vFlip = !vFlip;
    own = {
      width: own.width ?? alias.width,
      height: own.height ?? alias.height,
      left: own.left ?? alias.left,
      top: own.top ?? alias.top,
    };
    current = alias.parent;
  }
  return null;
}

/** Flip and turn a body inside its own box (what Iconify's renderer does with the same flags). */
function transformed(
  icon: Required<IconData>,
  rotate: number,
  hFlip: boolean,
  vFlip: boolean,
): IconData {
  const { width, height, left, top } = icon;
  const steps: string[] = [];
  if (hFlip) steps.push(`translate(${width + 2 * left} 0) scale(-1 1)`);
  if (vFlip) steps.push(`translate(0 ${height + 2 * top}) scale(1 -1)`);
  const turns = ((rotate % 4) + 4) % 4;
  let w = width;
  let h = height;
  if (turns === 1) {
    steps.unshift(`rotate(90 ${h / 2 + top} ${h / 2 + top})`);
    [w, h] = [h, w];
  } else if (turns === 2) steps.unshift(`rotate(180 ${width / 2 + left} ${height / 2 + top})`);
  else if (turns === 3) {
    steps.unshift(`rotate(-90 ${w / 2 + left} ${w / 2 + left})`);
    [w, h] = [h, w];
  }
  const body = steps.length ? `<g transform="${steps.join(" ")}">${icon.body}</g>` : icon.body;
  const out: IconData = { body, width: w, height: h };
  if (left) out.left = left;
  if (top) out.top = top;
  return out;
}

/** The closest names a set has to a misspelt one, for a lint hint. */
export function nearIconNames(set: IconifySet, name: string, limit = 3): string[] {
  const names = [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})];
  const scored: Array<[string, number]> = [];
  for (const n of names) {
    if (Math.abs(n.length - name.length) > 4) continue;
    const d = distance(n, name);
    if (d <= Math.max(2, Math.floor(name.length / 3))) scored.push([n, d]);
  }
  return scored
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([n]) => n);
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}
