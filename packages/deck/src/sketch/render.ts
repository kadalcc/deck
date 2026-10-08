import type { SketchScene } from "./dsl.ts";
import { COLOR_MAP } from "./palette.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SKETCH RENDERER  —  Excalidraw elements in, a theme-aware SVG out
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three inputs, one pipeline:
 *
 *   DSL scene            skeletons ──► convertToExcalidrawElements
 *   .excalidraw file     elements  ──► restoreElements                  ──► exportToSvg ──► rewrite
 *   Mermaid text         parseMermaidToExcalidraw ──► convertToExcalidrawElements
 *
 * The rewrite is what makes the drawing belong to the deck: every element gets a `link` before
 * export (Excalidraw wraps linked elements in `<a>`, the only per-element hook its exporter
 * offers), which becomes a `<g data-id data-region>` so a slide can light regions up per click;
 * and every palette literal becomes the theme token it stands for, so the sketch follows the
 * theme menu and the dark scheme like everything else.
 *
 * Fonts are self-hosted: the Vite plugin serves `dist/prod/fonts` under `<base>excalidraw/`
 * and this module points `EXCALIDRAW_ASSET_PATH` there. A warm-up export registers the faces
 * in `document.fonts` before any text is measured, so boxes are sized for the real font.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SketchInput =
  | SketchScene
  | { kind: "file"; data: ExcalidrawFile }
  | { kind: "url"; src: string }
  | { kind: "mermaid"; source: string; fontSize?: number };

/** The shape of a `.excalidraw` document (what excalidraw.com saves). */
export interface ExcalidrawFile {
  type?: string;
  elements: readonly Record<string, unknown>[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface RenderedSketch {
  key: string;
  svg: string;
  width: number;
  height: number;
}

interface StoredScene {
  elements: readonly Record<string, unknown>[];
  files: Record<string, unknown>;
}

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");

const LINK = "https://sketch.deck/#";
const cache = new Map<string, Promise<RenderedSketch>>();
const scenes = new Map<string, StoredScene>();
/** Excalidraw's font ids → the family names its faces register under. */
const FAMILY: Record<number, string> = {
  1: "Virgil",
  2: "Helvetica",
  3: "Cascadia",
  5: "Excalifont",
  6: "Nunito",
  7: "Lilita One",
  8: "Comic Shanns",
  9: "Liberation Sans",
};
let modulePromise: Promise<ExcalidrawModule> | null = null;

/** Where the fonts are: `<deck base>/excalidraw/`, absolute so the package resolves it plainly. */
function assetPath(): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return new URL(`${base.replace(/\/?$/, "/")}excalidraw/`, window.location.href).toString();
}

export function loadExcalidraw(): Promise<ExcalidrawModule> {
  if (!modulePromise) {
    (window as unknown as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = assetPath();
    modulePromise = import("@excalidraw/excalidraw");
  }
  return modulePromise;
}

/** A stable key for an input, so re-mounts and the canvas find the same render. */
export function hashInput(input: SketchInput): string {
  const text =
    input.kind === "sketch"
      ? JSON.stringify(input.elements)
      : input.kind === "file"
        ? JSON.stringify(input.data.elements)
        : input.kind === "url"
          ? input.src
          : `${input.source}|${input.fontSize ?? ""}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${input.kind}-${(h >>> 0).toString(36)}`;
}

/** The elements behind a rendered sketch, for the interactive canvas. */
export function getScene(key: string): StoredScene | null {
  return scenes.get(key) ?? null;
}

export function renderSketch(input: SketchInput, key = hashInput(input)): Promise<RenderedSketch> {
  let p = cache.get(key);
  if (!p) {
    p = render(input, key).catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

/**
 * Register and load the fonts these ids name, for the characters the sketch uses, so text
 * measured before export is measured in the real face. Only the canvas export path loads fonts
 * into `document.fonts` (the SVG path inlines them instead), so a one-pixel canvas export of a
 * probe carrying every character does the registration; Excalidraw caches what it has loaded.
 */
async function ensureFonts(ex: ExcalidrawModule, ids: number[], sample: string): Promise<void> {
  const families = [...new Set(ids.length ? ids : [5])];
  const chars = [...new Set(sample.replace(/\s+/g, ""))].join("") || "Ag";
  const probes = ex.convertToExcalidrawElements(
    families.map((fontFamily, i) => ({
      type: "text" as const,
      x: i * 10,
      y: 0,
      text: chars,
      fontFamily,
    })),
  );
  await ex.exportToCanvas({
    elements: probes,
    files: null,
    appState: { exportBackground: false },
    getDimensions: () => ({ width: 4, height: 4 }),
  });
  await document.fonts.ready;
}

/** True when every family is registered in `document.fonts`, so the SVG can lean on the page. */
function registered(ids: number[]): boolean {
  const have = new Set([...document.fonts].map((f) => f.family.replace(/^"|"$/g, "")));
  return (ids.length ? ids : [5]).every((id) => have.has(FAMILY[id] ?? ""));
}

const textOf = (elements: readonly Record<string, unknown>[]): string =>
  elements
    .flatMap((e) => [
      typeof e.text === "string" ? e.text : "",
      typeof (e.label as { text?: unknown } | undefined)?.text === "string"
        ? ((e.label as { text: string }).text ?? "")
        : "",
    ])
    .join("");

async function elementsFor(
  ex: ExcalidrawModule,
  input: SketchInput,
): Promise<{
  elements: Record<string, unknown>[];
  files: Record<string, unknown>;
  regions: Record<string, string[]>;
  fonts: number[];
}> {
  if (input.kind === "sketch") {
    await ensureFonts(ex, input.fonts, textOf(input.elements));
    const elements = ex.convertToExcalidrawElements(input.elements as never, {
      regenerateIds: false,
    }) as unknown as Record<string, unknown>[];
    return { elements, files: {}, regions: input.regions, fonts: input.fonts };
  }
  if (input.kind === "mermaid") {
    const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
    await ensureFonts(ex, [5], input.source);
    const out = await parseMermaidToExcalidraw(input.source, {
      themeVariables: { fontSize: `${input.fontSize ?? 20}px` },
    });
    const elements = ex.convertToExcalidrawElements(out.elements) as unknown as Record<
      string,
      unknown
    >[];
    return {
      elements,
      files: (out.files ?? {}) as Record<string, unknown>,
      regions: {},
      fonts: [5],
    };
  }
  const data: ExcalidrawFile =
    input.kind === "file"
      ? input.data
      : await fetch(input.src).then((r) => {
          if (!r.ok) throw new Error(`sketch: ${input.src} answered ${r.status}`);
          return r.json() as Promise<ExcalidrawFile>;
        });
  const fonts = data.elements
    .filter((e) => e.type === "text")
    .map((e) => Number(e.fontFamily ?? 5));
  await ensureFonts(ex, fonts, textOf(data.elements));
  const elements = ex.restoreElements(data.elements as never, null, {
    refreshDimensions: true,
    repairBindings: true,
  }) as unknown as Record<string, unknown>[];
  // Frames and groups saved on excalidraw.com become regions, so files step through too.
  const regions: Record<string, string[]> = {};
  for (const e of elements) {
    const names: string[] = [];
    if (typeof e.frameId === "string") names.push(e.frameId);
    if (Array.isArray(e.groupIds)) names.push(...(e.groupIds as string[]));
    if (names.length) regions[e.id as string] = names;
  }
  for (const e of elements)
    if (e.type === "frame" && typeof e.name === "string") {
      regions[e.id as string] = [e.id as string];
      // Named frames can be addressed by their name as well as their id.
      for (const [id, rs] of Object.entries(regions))
        if (rs.includes(e.id as string) && !rs.includes(e.name)) regions[id] = [...rs, e.name];
    }
  return { elements, files: (data.files ?? {}) as Record<string, unknown>, regions, fonts };
}

async function render(input: SketchInput, key: string): Promise<RenderedSketch> {
  const ex = await loadExcalidraw();
  const { elements, files, regions, fonts } = await elementsFor(ex, input);

  // The link is the exporter's only per-element handle; bound labels inherit their container's.
  const regionOf = (e: Record<string, unknown>): string[] => {
    const own = regions[e.id as string];
    if (own) return own;
    const container = typeof e.containerId === "string" ? regions[e.containerId] : undefined;
    return container ?? [];
  };
  for (const e of elements) e.link = `${LINK}${e.id}`;

  const svg = await ex.exportToSvg({
    elements: elements as never,
    files: files as never,
    appState: {
      exportBackground: false,
      exportWithDarkMode: false,
      exportEmbedScene: false,
      viewBackgroundColor: "transparent",
    },
    exportPadding: 12,
    // Registered faces serve the SVG from the page; otherwise the export carries its own.
    ...(registered(fonts) ? { skipInliningFonts: true as const } : {}),
  });

  // <a href="…#id"> → <g data-id data-region>
  const byId = new Map(elements.map((e) => [e.id as string, e]));
  for (const a of [...svg.querySelectorAll<SVGAElement>("a")]) {
    const href = a.getAttribute("href") ?? "";
    if (!href.startsWith(LINK)) continue;
    const id = href.slice(LINK.length);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "sk-el");
    g.setAttribute("data-id", id);
    const el = byId.get(id);
    const rs = el ? regionOf(el) : [];
    // "|"-separated: a frame saved on excalidraw.com can be named with spaces.
    if (rs.length) g.setAttribute("data-region", rs.join("|"));
    while (a.firstChild) g.appendChild(a.firstChild);
    a.replaceWith(g);
  }

  // Palette literals → theme tokens. Inline style outranks the presentation attribute, which
  // stays behind as the literal colour (what the canvas and a saved copy show).
  for (const node of svg.querySelectorAll<SVGElement>("[stroke], [fill]")) {
    for (const attr of ["stroke", "fill"] as const) {
      const v = node.getAttribute(attr)?.toLowerCase();
      if (!v) continue;
      const css = COLOR_MAP.get(v);
      if (css) node.style.setProperty(attr, css);
    }
  }

  svg.removeAttribute("xmlns:xlink");
  svg.setAttribute("class", "deck-sketch-svg");
  svg.setAttribute("role", "img");
  const width = Number(svg.getAttribute("width") ?? 0);
  const height = Number(svg.getAttribute("height") ?? 0);

  scenes.set(key, {
    elements: elements.map((e) => ({ ...e, link: null })),
    files,
  });
  return { key, svg: svg.outerHTML, width, height };
}
