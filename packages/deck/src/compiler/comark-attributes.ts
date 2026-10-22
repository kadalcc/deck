/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMARK ATTRIBUTES  —  the `{…}` after a component, a span or an element
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Comark's (formerly MDC's) attribute list, as the syntax reads it (comark-syntax.ts):
 *
 *   {.red .big}, {.red.big}  classes                       → className="red big"
 *   {#intro}                 an id                         → id="intro"
 *   {type="warning"}         a string (either quote)       → type="warning"
 *   {size=lg}                an unquoted string            → size="lg"
 *   {open}                   a boolean                     → open (true)
 *   {:count="3"}             a binding: the value is data  → count={3}
 *   {:items='["a", "b"]'}      (JSON, or a JavaScript-style
 *   {:pos="{x: 1, y: 2}"}       object literal; never run)  → pos={{ x: 1, y: 2 }}
 *
 * Separated by spaces, in any order and mixed. A list that is anything else — `{props.x}`,
 * `{1 + 1}`, `{" "}` — is not an attribute list, so the syntax leaves it to MDX as the
 * expression it is: turning Comark on never changes what an MDX expression means.
 *
 * Pure functions, no Markdown here: `parseComarkAttributes` reads the text between the braces,
 * `comarkName` decides what a component name renders as.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type Loose, parseLoose } from "./loose-object.ts";

export type ComarkAttribute =
  | { kind: "class"; value: string }
  | { kind: "id"; value: string }
  /** `value` true for a bare name; `bind` for `:name="…"` (the value is data, not a string). */
  | { kind: "prop"; name: string; value: string | true; bind: boolean };

const SPACE = /\s/;
/** What a class or an id may hold: anything but spaces, quotes, `=`, `#`, `.` and braces. */
const TOKEN = /[^\s"'=#.{}`<>]/;
const NAME_START = /[A-Za-z_@]/;
const NAME = /[\w@:-]/;
/** An unquoted value: no spaces, quotes, `=`, angle brackets, braces or backticks. */
const BARE = /[^\s"'=<>`{}]/;

/**
 * The attributes in `text` (what is between the braces), or null when it is not an attribute
 * list at all. An empty list is `[]`.
 */
export function parseComarkAttributes(text: string): ComarkAttribute[] | null {
  const out: ComarkAttribute[] = [];
  let i = 0;
  const n = text.length;
  const run = (re: RegExp) => {
    const start = i;
    while (i < n && re.test(text[i]!)) i++;
    return text.slice(start, i);
  };
  while (i < n) {
    if (SPACE.test(text[i]!)) {
      i++;
      continue;
    }
    const c = text[i]!;
    // `.a.b#c` chains (Comark's shorthand); anything else must be apart from what came before.
    // (`{props.x}` stays an MDX expression: a chain starts at a class or an id, never a name.)
    const prev = out[out.length - 1];
    if (
      prev &&
      !SPACE.test(text[i - 1] ?? " ") &&
      !((c === "." || c === "#") && prev.kind !== "prop")
    )
      return null;
    if (c === "." || c === "#") {
      i++;
      const value = run(TOKEN);
      if (!value) return null;
      out.push(c === "." ? { kind: "class", value } : { kind: "id", value });
      continue;
    }
    let bind = false;
    if (c === ":") {
      bind = true;
      i++;
    }
    if (!NAME_START.test(text[i] ?? "")) return null;
    const name = run(NAME);
    if (text[i] !== "=") {
      if (bind) return null; // `:name` alone binds nothing
      out.push({ kind: "prop", name, value: true, bind: false });
      continue;
    }
    i++;
    const q = text[i];
    let value = "";
    if (q === '"' || q === "'") {
      i++;
      let closed = false;
      while (i < n) {
        const ch = text[i]!;
        if (ch === "\\" && (text[i + 1] === q || text[i + 1] === "\\")) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        if (ch === q) {
          closed = true;
          i++;
          break;
        }
        value += ch;
        i++;
      }
      if (!closed) return null;
    } else {
      value = run(BARE);
      if (!value) return null;
    }
    out.push({ kind: "prop", name, value, bind });
  }
  return out;
}

/**
 * Where the closing brace of an attribute list starting at `text[open]` (a `{`) is, quotes
 * respected; -1 when it does not close on this line.
 */
export function closingBrace(text: string, open: number): number {
  let q: string | null = null;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\n" || c === "\r") return -1;
    if (q) {
      if (c === "\\") i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "}") return i;
    else if (c === "{") return -1;
  }
  return -1;
}

/** A binding's value as data: JSON, else a JavaScript-style literal, else the text itself. */
export function bindingValue(text: string): { value: Loose; ok: boolean } {
  try {
    return { value: JSON.parse(text) as Loose, ok: true };
  } catch {
    try {
      return { value: parseLoose(text), ok: true };
    } catch {
      return { value: text, ok: false };
    }
  }
}

/** `color: red; font-size: 2em` → `{ color: "red", fontSize: "2em" }` (custom properties kept). */
export function styleObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const at = decl.indexOf(":");
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim();
    const value = decl.slice(at + 1).trim();
    if (!prop || !value) continue;
    const key = prop.startsWith("--")
      ? prop
      : prop
          .toLowerCase()
          .replace(/^-ms-/, "ms-")
          .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[key] = value;
  }
  return out;
}

// ── component names ────────────────────────────────────────────────────────────────────────

/** HTML's elements: `:span[…]`, `::section` draw these, not a component. */
export const HTML_ELEMENTS = new Set(
  (
    "a abbr address area article aside audio b bdi bdo blockquote br button canvas caption cite " +
    "code col colgroup data datalist dd del details dfn dialog div dl dt em fieldset figcaption " +
    "figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label " +
    "legend li main map mark menu meter nav noscript object ol optgroup option output p picture " +
    "pre progress q rp rt ruby s samp search section select slot small source span strong sub " +
    "summary sup table tbody td template textarea tfoot th thead time tr track u ul var video wbr"
  ).split(" "),
);

/** Slidev's built-ins by the names a Slidev deck's Comark uses (`:auto-fit-text`), Kadal's. */
const SLIDEV_NAMES: Record<string, string> = {
  AutoFitText: "FitText",
  Titles: "TitleRenderer",
  SlidevVideo: "Video",
  VClick: "Click",
  VAfter: "After",
  VClicks: "Clicks",
  VSwitch: "Switch",
  VDrag: "Drag",
  VDragArrow: "DragArrow",
  // Slidev's <Link to="3"> is a component, though `link` is an HTML element's name too.
  Link: "Link",
};

/** `my-card` → `MyCard`. */
export const pascalCase = (name: string): string =>
  name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");

/** `my-slot` → `mySlot`: a named slot's prop. */
export const camelCase = (name: string): string => {
  const p = pascalCase(name);
  return p ? p[0]!.toLowerCase() + p.slice(1) : name;
};

/**
 * What `:name` / `::name` renders: an HTML element (`span`, `section`), or a component by its
 * PascalCase name — Kadal's (`badge` → Badge, Slidev's `v-click` → Click) or the deck's own
 * (`my-card` → MyCard), resolved where the slide renders, as any JSX tag is.
 */
export function comarkName(name: string): { element: string } | { component: string } {
  const pascal = pascalCase(name);
  if (SLIDEV_NAMES[pascal] && (name === pascal || !/[A-Z]/.test(name)))
    return { component: SLIDEV_NAMES[pascal]! };
  if (name === name.toLowerCase() && HTML_ELEMENTS.has(name)) return { element: name };
  return { component: pascal };
}
