import { blankHtmlComments, codeSpans, htmlComments } from "../compiler/comments.ts";
import { MERMAID_CONFIG_KEYS } from "../compiler/remark-fences.ts";
import { extractStyles } from "../compiler/slide-style.ts";
import type { RawSlide } from "../compiler/split.ts";
import { notesBlocks } from "../compiler/split.ts";
import { BUILTIN_TRANSITIONS } from "../core/transitions.ts";
import type { FrontmatterKey } from "../catalog/types.ts";
import type { Diagnostic } from "./lint.ts";
import { checkValue, closest } from "./validate.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LINTER KNOWS OF SLIDEV'S SYNTAX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The syntax the compiler accepts beyond MDX — HTML-comment notes, block frontmatter, slide
 * `<style>`, `src:` ranges, `defaults`, ```mermaid / ```plantuml / `$$ {steps}`, custom
 * transitions, `notesAutoRuby`, `katex` and `mermaid` — checked here so lint.ts stays a list of
 * calls. Two halves: `maskSlideBody` gives the MDX pass the text the compiler compiles (so a
 * comment or a `<style>` is never a false "does not compile"), and `checkSlideSyntax` /
 * `checkDeckSyntax` report the mistakes worth a line each.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Add = (d: Diagnostic) => void;

/** A slide body as the compiler compiles it: comments and `<style>` blocks blanked, lines kept. */
export function maskSlideBody(body: string): string {
  return extractStyles(blankHtmlComments(body)).content;
}

const lineAt = (text: string, offset: number) => text.slice(0, offset).split("\n").length - 1;

/** Problems in one slide's own text: unclosed comments and `<style>`s, CSS that will not parse. */
export function checkSlideSyntax(
  body: string,
  at: { file: string; offset: number; slide: number; head: boolean; hasFence: boolean },
  add: Add,
) {
  const where = (offset: number) => ({
    file: at.file,
    line: at.offset + lineAt(body, offset) + 1,
    slide: at.slide,
  });
  const trailing = new Set(
    notesBlocks(body)
      .filter((b) => b.kind === "comment")
      .map((b) => b.start),
  );
  for (const c of htmlComments(body)) {
    if (!c.closed)
      add({
        ...where(c.start),
        severity: "warning",
        code: "comment-unclosed",
        message:
          "This `<!--` is never closed, so everything after it is a comment (speaker notes, here).",
        hint: "Close it with `-->`.",
      });
    else if (!trailing.has(c.start) && /\S/.test(c.inner) && /^\s*\[click/m.test(c.inner))
      add({
        ...where(c.start),
        severity: "info",
        code: "comment-not-notes",
        message:
          "This comment has [click] markers but is not at the end of the slide, so it is not the slide's notes — it is dropped.",
        hint: "Move it to the end of the slide (only comments at the end are notes), or use <Notes>.",
      });
  }
  // `<style>` blocks: one that never closes swallows nothing (MDX then fails on it); braces that
  // do not balance leave the rest of the CSS unread.
  const text = blankHtmlComments(body);
  const code = codeSpans(text);
  const opens = [...text.matchAll(/<style(\s[^>]*)?>/gi)].filter(
    (m) => !/\/\s*>$/.test(m[0]) && !code.some(([a, b]) => m.index! >= a && m.index! < b),
  );
  const { styles } = extractStyles(text);
  if (opens.length > styles.length)
    add({
      ...where(opens[styles.length]?.index ?? 0),
      severity: "error",
      code: "style-unclosed",
      message: "A `<style>` block has no `</style>`.",
    });
  for (const s of styles) {
    const css = s.css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
    const open = (css.match(/\{/g) ?? []).length;
    const close = (css.match(/\}/g) ?? []).length;
    if (open !== close)
      add({
        file: at.file,
        line: at.offset + s.line + 1,
        slide: at.slide,
        severity: "warning",
        code: "style-braces",
        message: `This <style> has ${open} "{" and ${close} "}"; the CSS after the mismatch is ignored.`,
      });
  }
  // A ```yaml fence at the top of the deck's first slide is code: the headmatter is the
  // first slide's frontmatter, as in Slidev.
  if (at.head && /^\s*```ya?ml\s*$/m.test(body.split("\n").find((l) => l.trim()) ?? ""))
    add({
      file: at.file,
      line: at.offset + 1,
      slide: at.slide,
      severity: "info",
      code: "block-frontmatter-head",
      message:
        "A ```yaml block at the top of the first slide is shown as code: block frontmatter works from the second slide on.",
      hint: at.hasFence
        ? "Move these settings into the headmatter between the `---` lines at the top."
        : "Put them between `---` lines at the top of the file instead.",
    });
}

/** Transition names a deck may use: built in, its `transitions:`, its CSS, its `registerTransition`. */
export function deckTransitionNames(
  headmatter: Record<string, unknown>,
  slides: RawSlide[],
  registered: string[] = [],
): Set<string> {
  const names = new Set<string>([...BUILTIN_TRANSITIONS, ...registered]);
  const own = headmatter.transitions;
  if (own && typeof own === "object" && !Array.isArray(own))
    for (const k of Object.keys(own)) names.add(k);
  for (const s of slides)
    for (const st of s.styles ?? [])
      for (const m of st.css.matchAll(/data-transition(?:-out)?\s*=\s*["']?([\w-]+)/g))
        names.add(m[1]!);
  return names;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Deck-level syntax settings: `defaults` (its keys are slide keys), `transitions` (each needs
 * keyframe names), `mermaid` (Mermaid's keys), `katex.macros`, `notesAutoRuby`, `plantUmlServer`.
 */
export function checkDeckSyntax(
  headmatter: Record<string, unknown>,
  at: { file: string; line: number },
  slideKeys: Map<string, FrontmatterKey>,
  add: Add,
) {
  const warn = (code: string, message: string, hint?: string) =>
    add({ ...at, slide: 0, severity: "warning", code, message, ...(hint ? { hint } : {}) });
  const d = headmatter.defaults;
  if (isObject(d))
    for (const [k, v] of Object.entries(d)) {
      const def = slideKeys.get(k);
      if (!def) {
        const near = closest(k, [...slideKeys.keys()]);
        warn(
          "defaults-unknown-key",
          `"defaults" sets "${k}", which is not a slide setting.`,
          near ? `Did you mean "${near}"?` : undefined,
        );
        continue;
      }
      const why = checkValue(def.type, v);
      if (why)
        add({
          ...at,
          slide: 0,
          severity: "error",
          code: "frontmatter-type",
          message: `"defaults.${k}": ${why}.`,
        });
    }
  const t = headmatter.transitions;
  if (isObject(t))
    for (const [name, def] of Object.entries(t)) {
      if (!isObject(def) || (typeof def.in !== "string" && typeof def.out !== "string"))
        warn(
          "transition-definition",
          `The transition "${name}" names no keyframes.`,
          `Write it as ${name}: { in: ${name}-in, out: ${name}-out } and define those @keyframes in the theme's CSS or a <style global>.`,
        );
      for (const extra of Object.keys(isObject(def) ? def : {}))
        if (!["in", "out", "back", "up", "down", "summary"].includes(extra))
          warn(
            "transition-definition",
            `The transition "${name}" has an unknown key "${extra}" (in, out, back, up, down).`,
          );
    }
  const m = headmatter.mermaid;
  if (isObject(m))
    for (const k of Object.keys(m))
      if (!MERMAID_CONFIG_KEYS.includes(k)) {
        const near = closest(k, MERMAID_CONFIG_KEYS);
        warn(
          "mermaid-option",
          `"mermaid" sets "${k}", which is not a Mermaid option.`,
          near ? `Did you mean "${near}"?` : undefined,
        );
      }
  const k = headmatter.katex;
  if (
    isObject(k) &&
    k.macros !== undefined &&
    (!isObject(k.macros) || Object.values(k.macros).some((v) => typeof v !== "string"))
  )
    warn(
      "katex-macros",
      '"katex.macros" maps each macro to its expansion, both strings: { "\\\\RR": "\\\\mathbb{R}" }.',
    );
  const r = headmatter.notesAutoRuby;
  if (r !== undefined && (!isObject(r) || Object.values(r).some((v) => typeof v !== "string")))
    warn(
      "notes-ruby",
      '"notesAutoRuby" maps each word to its reading, both strings: { 日本語: "ni hon go" }.',
    );
  const p = headmatter.plantUmlServer;
  if (typeof p === "string" && !/^https?:\/\//.test(p.trim()))
    warn(
      "plantuml-server",
      `"plantUmlServer" must be an http(s) URL; "${p}" is ignored and the public server is used.`,
    );
}
