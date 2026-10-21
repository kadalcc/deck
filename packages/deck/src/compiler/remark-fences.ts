import { visit } from "unist-util-visit";

import { type Loose, braceGroups, jsxAttribute, parseLoose } from "./loose-object.ts";
import { DEFAULT_PLANTUML_SERVER, plantUmlUrl } from "./plantuml.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FENCES THAT ARE NOT CODE: diagrams and stepped maths
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev's fence spellings, turned into the engine's own elements before highlighting:
 *
 *   ```mermaid {theme: 'neutral', scale: 0.8}     → <Mermaid code=… theme="neutral" scale={0.8}>
 *                                                   (any other key is Mermaid config for this
 *                                                   diagram: {look: 'handDrawn'}, {themeVariables: …})
 *   ```plantuml {scale: 0.8, alt: 'Login flow'}   → <figure><img src="<server>/svg/<encoded>"></figure>
 *                                                   (the deck's `plantUmlServer`, PlantUML's
 *                                                   DEFLATE + base64 encoding, see plantuml.ts)
 *   $$ {1|3|all}                                  → <KatexLines steps="1|3|all">…KaTeX…</KatexLines>
 *   $$ {2-3|all} {at: 2, finally: 'all'}            one click per step after the first, like a
 *                                                   code fence's line steps
 *
 * Fence options are a JavaScript object literal (loose-object.ts), never evaluated. Problems —
 * options that do not parse, keys that mean nothing — go to `warn` with their line, and the fence
 * still renders as well as it can.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface RemarkFencesOptions {
  /** The PlantUML server, from the headmatter's `plantUmlServer`. */
  plantUmlServer?: string;
  warn?: (message: string, line?: number) => void;
}

/** Fence keys a mermaid fence reads itself; any other key is Mermaid configuration. */
export const MERMAID_FENCE_KEYS = ["theme", "scale", "className"];

/**
 * Mermaid's top-level configuration keys (mermaid 11's `MermaidConfig`), so a typo in a fence's
 * options or the deck's `mermaid:` is a warning rather than silently nothing.
 */
export const MERMAID_CONFIG_KEYS = [
  "theme",
  "themeVariables",
  "themeCSS",
  "look",
  "handDrawnSeed",
  "layout",
  "maxTextSize",
  "maxEdges",
  "darkMode",
  "htmlLabels",
  "fontFamily",
  "altFontFamily",
  "logLevel",
  "securityLevel",
  "startOnLoad",
  "arrowMarkerAbsolute",
  "secure",
  "legacyMathML",
  "forceLegacyMathML",
  "deterministicIds",
  "deterministicIDSeed",
  "flowchart",
  "sequence",
  "gantt",
  "journey",
  "timeline",
  "class",
  "state",
  "er",
  "pie",
  "quadrantChart",
  "xyChart",
  "requirement",
  "architecture",
  "mindmap",
  "kanban",
  "gitGraph",
  "c4",
  "sankey",
  "packet",
  "block",
  "radar",
  "treemap",
  "dompurifyConfig",
  "wrap",
  "fontSize",
  "markdownAutoWrap",
  "suppressErrorRendering",
  "elk",
];

/** Options a plantuml fence reads. */
export const PLANTUML_FENCE_KEYS = ["scale", "alt", "format", "className"];
/** Options of a `$$ {steps} {…}` block. */
export const KATEX_LINES_KEYS = ["at", "finally", "startLine"];

interface MdNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  position?: { start: { line: number } };
  children?: MdNode[];
  [key: string]: unknown;
}

/** Parse the options group of a fence; a broken one warns and counts as none. */
export function fenceOptions(
  group: string | undefined,
  warn: (message: string) => void,
  what: string,
): Record<string, Loose> {
  if (!group) return {};
  try {
    const v = parseLoose(group);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    warn(`${what} options must be an object like {scale: 0.8}.`);
  } catch (e) {
    warn(`${what} options do not parse: ${e instanceof Error ? e.message : String(e)}.`);
  }
  return {};
}

/** `{1|3|all}`: a steps group (not an options object). */
export const isStepsGroup = (g: string) => /^\{\s*[\w*,|\s-]*\}$/.test(g) && !/:/.test(g);

const element = (
  name: string,
  attributes: Record<string, Loose | undefined>,
  children: MdNode[] = [],
): MdNode => ({
  type: "mdxJsxFlowElement",
  name,
  attributes: Object.entries(attributes)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => jsxAttribute(k, v as Loose)),
  children,
});

export function remarkDeckFences(options: RemarkFencesOptions = {}) {
  const server = options.plantUmlServer || DEFAULT_PLANTUML_SERVER;
  return async (tree: MdNode) => {
    const jobs: Promise<void>[] = [];
    visit(tree as never, (node: MdNode, index: number | undefined, parent: MdNode | undefined) => {
      if (!parent || index === undefined) return;
      const line = node.position?.start.line;
      const warn = (m: string) => options.warn?.(m, line);
      if (node.type === "code" && node.lang === "mermaid") {
        const opts = fenceOptions(braceGroups(node.meta ?? "")[0], warn, "Mermaid");
        const { theme, scale, className, ...config } = opts;
        for (const k of Object.keys(config))
          if (!MERMAID_CONFIG_KEYS.includes(k))
            warn(`Unknown mermaid option "${k}" (scale, theme, or a Mermaid config key).`);
        parent.children![index] = element("Mermaid", {
          code: node.value ?? "",
          theme: typeof theme === "string" ? theme : undefined,
          scale: typeof scale === "number" ? scale : undefined,
          className: typeof className === "string" ? className : undefined,
          config: Object.keys(config).length ? config : undefined,
        });
        return;
      }
      if (node.type === "code" && node.lang === "plantuml") {
        const opts = fenceOptions(braceGroups(node.meta ?? "")[0], warn, "PlantUML");
        for (const k of Object.keys(opts))
          if (!PLANTUML_FENCE_KEYS.includes(k))
            warn(`Unknown plantuml option "${k}" (${PLANTUML_FENCE_KEYS.join(", ")}).`);
        const format = opts.format === "png" ? "png" : "svg";
        const alt = typeof opts.alt === "string" ? opts.alt : "PlantUML diagram";
        const scale = typeof opts.scale === "number" ? opts.scale : undefined;
        const figure = element(
          "figure",
          {
            className: ["deck-plantuml", typeof opts.className === "string" ? opts.className : ""]
              .filter(Boolean)
              .join(" "),
            style: scale ? { zoom: scale } : undefined,
          },
          [],
        );
        parent.children![index] = figure;
        jobs.push(
          plantUmlUrl(node.value ?? "", server, format).then((src) => {
            figure.children = [
              element("img", {
                src,
                alt,
                loading: "eager",
                decoding: "async",
                referrerPolicy: "no-referrer",
                className: "deck-plantuml-image",
              }),
            ];
          }),
        );
        return;
      }
      if (node.type === "math" && node.meta) {
        const groups = braceGroups(node.meta);
        const steps = groups[0] && isStepsGroup(groups[0]) ? groups[0].slice(1, -1).trim() : null;
        if (!steps) {
          warn(
            `Display maths options "${node.meta}" are not understood: write steps like $$ {1|3|all}.`,
          );
          return;
        }
        const opts = fenceOptions(groups[1], warn, "Maths line");
        for (const k of Object.keys(opts))
          if (!KATEX_LINES_KEYS.includes(k))
            warn(`Unknown maths line option "${k}" (${KATEX_LINES_KEYS.join(", ")}).`);
        parent.children![index] = element(
          "KatexLines",
          {
            steps,
            at: typeof opts.at === "number" || typeof opts.at === "string" ? opts.at : undefined,
            finally:
              typeof opts.finally === "number" || typeof opts.finally === "string"
                ? String(opts.finally)
                : undefined,
            startLine: typeof opts.startLine === "number" ? opts.startLine : undefined,
          },
          [{ ...node, meta: null }],
        );
      }
    });
    await Promise.all(jobs);
  };
}
