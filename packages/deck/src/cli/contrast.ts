import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type Box,
  type Rgb,
  blend,
  decodePng,
  hex,
  isLargeText,
  judge,
  parseColor,
  inkBackground,
  sampleGrid,
} from "./contrast-math.ts";
import type { PageLike, SlideRenderer } from "./render.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IS THE TEXT LEGIBLE  —  `kadal-deck contrast` (and `check --contrast`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every page of the print view (a page per click step), in each colour scheme, is read twice:
 * once from the DOM — each visible run of text, its colour, opacity, size and weight — and once
 * as a picture with every glyph made transparent, so what is behind the text is measured as the
 * audience sees it, whatever drew it: an image, a gradient, a canvas or WebGL background, a
 * scrim. Each text's colour is blended over a grid of background samples under its line boxes,
 * and the WCAG 2.x contrast ratio at a low percentile of those samples (the 10th by default)
 * decides, so a caption that crosses a bright patch of a photo fails even if most of it is fine.
 *
 * The text is hidden with `-webkit-text-fill-color` rather than `color`, so a card tinted with
 * `currentColor` keeps its tint in the background picture. Not seen: text drawn inside a canvas
 * or an image (it is not text to the DOM), text whose colour is itself a gradient
 * (`background-clip: text` — counted as unmeasured), and text covered by another element.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Scheme = "light" | "dark";

export interface ContrastOptions {
  schemes: Scheme[];
  /** The ratio normal text needs (WCAG AA: 4.5). */
  min: number;
  /** The ratio large text needs (WCAG AA: 3). */
  minLarge: number;
  /** Which background sample decides: the `percentile`th lowest contrast (default 10). */
  percentile: number;
  /** A page per click step (default), or one page per slide with every step shown. */
  clicks: boolean;
  /** The print view's `?range=` (visible slides, counting from 1). */
  range?: string;
  theme?: string;
  /** Write a picture of each page with failures, the failing text outlined, into this folder. */
  out?: string;
  /** A script run before the deck's own (see `PrintViewRequest.init`). */
  init?: string;
  say?: (line: string) => void;
}

export const CONTRAST_DEFAULTS = { min: 4.5, minLarge: 3, percentile: 10 } as const;

export interface ContrastFinding {
  level: "fail" | "warn";
  scheme: Scheme;
  /** The slide's number as the audience counts it (from 1). */
  slide: number;
  id: string | null;
  /** The click steps it fails on (0 is the slide before any click). */
  steps: number[];
  text: string;
  /** Font size in stage pixels (the slide is 1920 × 1080), and its weight. */
  fontSize: number;
  fontWeight: number;
  large: boolean;
  ratio: number;
  required: number;
  /** The text as painted and the background at the deciding sample. */
  fg: string;
  bg: string;
  /** The best contrast across its samples (far above `ratio`: a busy background). */
  best: number;
  shadow: boolean;
  path: string;
  /** How many different texts this finding stands for (a chart's labels), and which. */
  count: number;
  texts: string[];
}

export interface ContrastSchemeSummary {
  asked: Scheme;
  /** What the deck drew: a deck with a fixed `colorScheme` draws it whatever is asked. */
  drawn: Scheme;
  pages: number;
  texts: number;
  failures: number;
  warnings: number;
  skipped: Record<string, number>;
}

export interface ContrastReport {
  ok: boolean;
  thresholds: { normal: number; large: number; percentile: number };
  schemes: ContrastSchemeSummary[];
  findings: ContrastFinding[];
  /** Pictures written by `out`. */
  files: string[];
  errors: string[];
}

/** One run of text as the page reports it (stage pixels, the page's own coordinates). */
interface TextRun {
  page: number;
  boxes: Box[];
  color: string;
  opacity: number;
  fontSize: number;
  fontWeight: number;
  shadow: boolean;
  /** An SVG label's halo: a stroke painted under its fill, wide enough to be its background. */
  halo: string | null;
  text: string;
  path: string;
}
interface PageFacts {
  page: number;
  slide: number;
  id: string | null;
  click: number;
  width: number;
}
interface Collected {
  pages: PageFacts[];
  runs: TextRun[];
  skipped: Record<string, number>;
}

/**
 * In the page: every text node with something to read, grouped by its element, with what decides
 * how it reads. Runs as-is in the browser (no imports, no helpers).
 */
const collect = (): Collected => {
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const pages: PageFacts[] = [];
  const runs: TextRun[] = [];
  const all = [...document.querySelectorAll<HTMLElement>(".deck-print-page")];
  all.forEach((pageEl, pi) => {
    if (pageEl.classList.contains("deck-print-notes-page")) return;
    const slideEl = pageEl.querySelector<HTMLElement>(".deck-slide");
    const pr = pageEl.getBoundingClientRect();
    const scale = pr.width / (pageEl.offsetWidth || pr.width || 1) || 1;
    pages.push({
      page: pi,
      slide: Number(pageEl.dataset.slide ?? slideEl?.dataset.index ?? -1) + 1,
      id: slideEl?.dataset.id ?? null,
      click: Number(pageEl.dataset.click ?? slideEl?.dataset.click ?? 0),
      width: pageEl.offsetWidth,
    });
    const groups = new Map<Element, { rects: DOMRect[]; text: string }>();
    const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (!/\S/.test(n.data)) continue;
      const el = n.parentElement;
      if (!el || el.closest("style,script,noscript,template,title,desc,metadata,textarea"))
        continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const g = groups.get(el) ?? { rects: [], text: "" };
      g.rects.push(...range.getClientRects());
      g.text += n.data;
      groups.set(el, g);
    }
    const pathOf = (el: Element) => {
      const parts: string[] = [];
      for (let a: Element | null = el; a && a !== pageEl && parts.length < 4; a = a.parentElement) {
        if (a === slideEl) break;
        let p = a.tagName.toLowerCase();
        if (a.id) p += `#${a.id}`;
        else {
          const cls = [...a.classList].filter((c) => !/^(is-|has-)/.test(c)).slice(0, 2);
          if (cls.length) p += `.${cls.join(".")}`;
        }
        parts.unshift(p);
      }
      return parts.join(" > ");
    };
    for (const [el, g] of groups) {
      if (el.closest('[data-contrast="ignore"]')) {
        skip("ignored");
        continue;
      }
      // The engine's own de-emphasis (code lines outside the highlight, past magic-move and
      // KaTeX lines, sketch parts): dim on purpose, and read when their step comes.
      if (el.closest(".is-dim")) {
        skip("dimmed on purpose");
        continue;
      }
      // Words a background draws (a marquee, a type field) are its texture: ambience, as every
      // background is. Text over a background is measured like any other.
      if (el.closest(".deck-background, .deck-slide-background")) {
        skip("in a background");
        continue;
      }
      // aria-hidden is not a reason to skip: a chart is often aria-hidden beside its text
      // alternative, and its axis labels are exactly what the room squints at. Decorative text
      // says so with data-contrast="ignore".
      if (
        "checkVisibility" in el &&
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      ) {
        skip("hidden");
        continue;
      }
      const cs = getComputedStyle(el);
      const svg = el instanceof SVGElement;
      let opacity = 1;
      for (let a: Element | null = el; a; a = a.parentElement) {
        opacity *= parseFloat(getComputedStyle(a).opacity) || 0;
        if (a === pageEl) break;
      }
      if (svg) opacity *= parseFloat(cs.fillOpacity || "1");
      if (opacity < 0.02) {
        skip("hidden");
        continue;
      }
      // What is in view of each line box: inside the page and every clipping ancestor.
      let clip = { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom };
      for (let a = el.parentElement; a && a !== pageEl; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const r = a.getBoundingClientRect();
          clip = {
            l: Math.max(clip.l, r.left),
            t: Math.max(clip.t, r.top),
            r: Math.min(clip.r, r.right),
            b: Math.min(clip.b, r.bottom),
          };
        }
      }
      let full = 0;
      const boxes: Box[] = [];
      for (const r of g.rects) {
        full += r.width * r.height;
        const l = Math.max(r.left, clip.l);
        const t = Math.max(r.top, clip.t);
        const w = Math.min(r.right, clip.r) - l;
        const h = Math.min(r.bottom, clip.b) - t;
        if (w >= 1.5 && h >= 1.5)
          boxes.push({
            x: (l - pr.left) / scale,
            y: (t - pr.top) / scale,
            w: w / scale,
            h: h / scale,
          });
      }
      const seen = boxes.reduce((s, b) => s + b.w * b.h, 0) * scale * scale;
      if (!boxes.length || seen < full * 0.3 || seen < 16) {
        skip("clipped");
        continue;
      }
      let color = svg ? cs.fill : cs.webkitTextFillColor || cs.color;
      const clear = (c: string) => /^(transparent|rgba\(.*,\s*0\)|.*\/\s*0\))$/.test(c.trim());
      if (!svg && clear(color)) {
        const stroke = parseFloat(cs.webkitTextStrokeWidth || "0");
        const clipText =
          cs.backgroundClip === "text" || cs.getPropertyValue("-webkit-background-clip") === "text";
        if (stroke > 0 && !clipText) color = cs.webkitTextStrokeColor;
        else {
          if (clipText) el.setAttribute("data-kd-contrast-clip", "");
          skip(clipText ? "gradient text" : "transparent text");
          continue;
        }
      }
      if (svg && !/^(rgb|color|#|ok|lab|lch|hsl)/.test(color)) {
        skip("svg paint server");
        continue;
      }
      // Its size as drawn, in stage pixels: CSS zoom and transforms included.
      let k = 1;
      if (svg) {
        const m = (el as SVGGraphicsElement).getScreenCTM?.();
        if (m) k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      } else {
        const r = el.getBoundingClientRect();
        const h = el as HTMLElement;
        if (h.offsetWidth > 0) k = r.width / h.offsetWidth;
        else if (h.offsetHeight > 0) k = r.height / h.offsetHeight;
      }
      // A map or chart label's halo (`paint-order: stroke` and a stroke of 3px or more): the
      // glyph's own background, whatever the map does behind it.
      let halo: string | null = null;
      if (svg && cs.paintOrder.startsWith("stroke") && /^(rgb|color|#|ok|lab|lch|hsl)/.test(cs.stroke)) {
        const sw = ((parseFloat(cs.strokeWidth) || 0) * k) / scale;
        if (sw >= 3) halo = cs.stroke;
      }
      runs.push({
        page: pi,
        halo,
        boxes,
        color,
        opacity,
        fontSize: (parseFloat(cs.fontSize) * k) / scale,
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
        shadow: cs.textShadow !== "none" && cs.textShadow !== "",
        text: g.text.replace(/\s+/g, " ").trim().slice(0, 80),
        path: pathOf(el),
      });
    }
  });
  return { pages, runs, skipped };
};

/** Glyphs gone, everything else as it was (layout included): the picture of what is behind. */
const TEXT_FREE = `
.deck-print-page *, .deck-print-page *::before, .deck-print-page *::after {
  -webkit-text-fill-color: transparent !important;
  -webkit-text-stroke-color: transparent !important;
  text-shadow: none !important;
  text-decoration-color: transparent !important;
  caret-color: transparent !important;
  transition: none !important;
}
.deck-print-page ::marker { color: transparent !important; }
.deck-print-page text, .deck-print-page tspan, .deck-print-page textPath {
  fill: transparent !important; stroke: transparent !important;
}
[data-kd-contrast-clip] { background-image: none !important; background-color: transparent !important; }
`;

async function picture(page: PageLike, index: number): Promise<Buffer> {
  // Scrolled and clipped by hand: Playwright's element shot waits for the element to hold still,
  // and a page with an animated background never does.
  const box = await page.evaluate(async (i: number) => {
    const el = document.querySelectorAll<HTMLElement>(".deck-print-page")[i];
    if (!el) return null;
    el.scrollIntoView({ block: "start", inline: "start" });
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, index);
  if (!box) throw new Error(`print page ${index} is gone`);
  return page.screenshot({ type: "png", animations: "disabled", clip: box });
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Check one scheme: open the print view, read its text, picture it without, judge. */
async function checkScheme(
  renderer: SlideRenderer,
  asked: Scheme,
  o: ContrastOptions,
  files: string[],
): Promise<{ summary: ContrastSchemeSummary; findings: ContrastFinding[]; errors: string[] }> {
  return renderer.withPrintView(
    {
      scheme: asked,
      theme: o.theme,
      range: o.range,
      clicks: o.clicks,
      notes: false,
      settle: true,
      deviceScaleFactor: 1,
      init: o.init,
      // Every page and step of a long deck, its fonts and library items: more than a picture.
      timeout: 300_000,
    },
    async ({ page, scheme: drawn, errors }) => {
      const { settleMedia } = await import("../export/pdf.ts");
      await settleMedia(page as never);
      const facts = await page.evaluate(collect);
      const byPage = new Map<number, TextRun[]>();
      for (const r of facts.runs) byPage.set(r.page, [...(byPage.get(r.page) ?? []), r]);
      const raw: Array<Omit<ContrastFinding, "count" | "texts"> & { page: number; boxes: Box[] }> =
        [];
      const textFree = (on: boolean) =>
        page.evaluate(
          ({ on, css }: { on: boolean; css: string }) => {
            document.getElementById("kd-contrast-text-free")?.remove();
            if (!on) return;
            const s = document.createElement("style");
            s.id = "kd-contrast-text-free";
            s.textContent = css;
            document.head.append(s);
          },
          { on, css: TEXT_FREE },
        );
      const count = (why: string) => (facts.skipped[why] = (facts.skipped[why] ?? 0) + 1);
      for (const p of facts.pages) {
        const runs = byPage.get(p.page);
        if (!runs?.length) continue;
        // The page as it is, then the same page with every glyph transparent.
        const ink = decodePng(await picture(page, p.page));
        await textFree(true);
        const bare = decodePng(await picture(page, p.page));
        await textFree(false);
        const k = bare.width / (p.width || 1920);
        for (const run of runs) {
          const fg = parseColor(run.color);
          if (!fg) {
            count("unparsed colour");
            continue;
          }
          const r = Math.max(2, Math.min(8, Math.round(run.fontSize * k * 0.2)));
          const samples: Rgb[] = [];
          const halo = run.halo ? parseColor(run.halo) : null;
          for (const [x, y] of sampleGrid(run.boxes)) {
            // A halo paints its own colour around the glyphs; the fill is what is matched.
            const bg = inkBackground(
              ink,
              bare,
              x * k,
              y * k,
              r,
              halo ? undefined : fg,
              run.opacity,
            );
            if (bg) samples.push(halo ? blend(halo, bg, run.opacity) : bg);
          }
          const j = judge(fg, run.opacity, samples, o.percentile);
          if (!j) {
            // Nothing of it painted: covered, clipped away, or the colour of what is behind it.
            count("no visible ink");
            continue;
          }
          const large = isLargeText(run.fontSize, run.fontWeight);
          const required = large ? o.minLarge : o.min;
          // Large text that passes AA's 3:1 but not 4.5:1 is worth a look, not a failure.
          const level = j.ratio < required ? "fail" : large && j.ratio < o.min ? "warn" : null;
          if (!level) continue;
          raw.push({
            level,
            scheme: drawn,
            slide: p.slide,
            id: p.id,
            steps: [p.click],
            text: run.text,
            fontSize: round(run.fontSize, 1),
            fontWeight: run.fontWeight,
            large,
            ratio: round(j.ratio),
            required,
            fg: hex(j.fg),
            bg: hex(j.bg),
            best: round(j.best),
            shadow: run.shadow,
            path: run.path,
            page: p.page,
            boxes: run.boxes,
          });
        }
      }

      if (o.out && raw.some((f) => f.level === "fail")) {
        await mkdir(o.out, { recursive: true });
        const pagesWith = [...new Set(raw.map((f) => f.page))];
        for (const pi of pagesWith) {
          const marks = raw
            .filter((f) => f.page === pi)
            .flatMap((f) =>
              f.boxes.map((b) => ({ ...b, fail: f.level === "fail", ratio: f.ratio })),
            );
          await page.evaluate(
            ({
              pi,
              marks,
            }: {
              pi: number;
              marks: Array<Box & { fail: boolean; ratio: number }>;
            }) => {
              const el = document.querySelectorAll<HTMLElement>(".deck-print-page")[pi];
              if (!el) return;
              const layer = document.createElement("div");
              layer.className = "kd-contrast-marks";
              layer.style.cssText =
                "position:absolute;inset:0;pointer-events:none;z-index:2147483647";
              for (const m of marks) {
                const box = document.createElement("div");
                const c = m.fail ? "#ff1f4b" : "#ffb020";
                box.style.cssText = `position:absolute;left:${m.x - 3}px;top:${m.y - 3}px;width:${m.w + 6}px;height:${m.h + 6}px;outline:3px solid ${c};box-shadow:0 0 0 5px rgba(0,0,0,.55)`;
                const tag = document.createElement("span");
                tag.textContent = m.ratio.toFixed(2);
                tag.style.cssText = `position:absolute;left:0;top:-22px;font:700 15px/18px system-ui,sans-serif;color:#fff;background:${c};padding:1px 5px;-webkit-text-fill-color:#fff`;
                box.append(tag);
                layer.append(box);
              }
              if (getComputedStyle(el).position === "static") el.style.position = "relative";
              el.append(layer);
            },
            { pi, marks },
          );
          const shot = await picture(page, pi);
          await page.evaluate(() => {
            for (const l of document.querySelectorAll(".kd-contrast-marks")) l.remove();
          });
          const f = raw.find((x) => x.page === pi)!;
          const file = join(
            o.out,
            `slide-${String(f.slide).padStart(3, "0")}-step-${f.steps[0]}-${drawn}.png`,
          );
          await writeFile(file, shot);
          files.push(file);
        }
      }

      // The same text failing the same way on every step of a slide is one finding, and so are
      // the many labels of one chart that share an element path, a size and colours.
      const merged = new Map<string, ContrastFinding>();
      for (const { page: _p, boxes: _b, ...f } of raw) {
        const key = [f.level, f.slide, f.path, f.fontSize, f.ratio.toFixed(1), f.fg, f.bg].join(
          "|",
        );
        const had = merged.get(key);
        if (!had) {
          merged.set(key, { ...f, count: 1, texts: [f.text] });
          continue;
        }
        had.steps = [...new Set([...had.steps, ...f.steps])].sort((a, b) => a - b);
        if (!had.texts.includes(f.text)) {
          had.texts.push(f.text);
          had.count = had.texts.length;
        }
      }
      const findings = [...merged.values()];
      return {
        summary: {
          asked,
          drawn,
          pages: facts.pages.length,
          texts: facts.runs.length,
          failures: findings.filter((f) => f.level === "fail").length,
          warnings: findings.filter((f) => f.level === "warn").length,
          skipped: facts.skipped,
        },
        findings,
        errors,
      };
    },
  );
}

export async function checkContrast(
  renderer: SlideRenderer,
  o: ContrastOptions,
): Promise<ContrastReport> {
  const schemes: ContrastSchemeSummary[] = [];
  const findings: ContrastFinding[] = [];
  const errors: string[] = [];
  const files: string[] = [];
  for (const asked of o.schemes) {
    o.say?.(`look   ${asked} scheme`);
    const r = await checkScheme(renderer, asked, o, files);
    errors.push(...r.errors);
    // A deck with a fixed colorScheme draws the same pages whichever is asked: once is enough.
    if (schemes.some((s) => s.drawn === r.summary.drawn)) {
      o.say?.(`skip   ${asked}: the deck draws ${r.summary.drawn} only (its colorScheme is fixed)`);
      continue;
    }
    schemes.push(r.summary);
    findings.push(...r.findings);
  }
  findings.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "fail" ? -1 : 1) ||
      a.scheme.localeCompare(b.scheme) ||
      a.slide - b.slide ||
      a.ratio - b.ratio,
  );
  return {
    ok: findings.every((f) => f.level !== "fail"),
    thresholds: { normal: o.min, large: o.minLarge, percentile: o.percentile },
    schemes,
    findings,
    files,
    errors: [...new Set(errors)].slice(0, 20),
  };
}

/** The report for a person: one line per finding, grouped by scheme and slide. */
export function formatContrast(r: ContrastReport): string {
  const lines: string[] = [];
  for (const s of r.schemes) {
    const mine = r.findings.filter((f) => f.scheme === s.drawn);
    lines.push(
      `\n${s.drawn} scheme: ${s.pages} pages, ${s.texts} texts — ${s.failures} failing, ${s.warnings} to look at`,
    );
    let slide = -1;
    for (const f of mine) {
      if (f.slide !== slide) {
        slide = f.slide;
        lines.push(`  slide ${f.slide}${f.id ? ` (${f.id})` : ""}`);
      }
      const steps = f.steps.length > 1 || f.steps[0] ? ` steps ${f.steps.join(",")}` : "";
      lines.push(
        `    ${f.level === "fail" ? "fail" : "warn"}  ${f.ratio.toFixed(2)} < ${f.level === "fail" ? f.required : r.thresholds.normal}  ${f.fg} on ${f.bg}  ${f.fontSize}px/${f.fontWeight}${f.large ? " large" : ""}${f.shadow ? " shadow" : ""}${steps}  "${f.text.slice(0, 48)}"${f.count > 1 ? ` (+${f.count - 1} more)` : ""}  ${f.path}`,
      );
    }
    const skipped = Object.entries(s.skipped)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");
    if (skipped) lines.push(`  not measured: ${skipped}`);
  }
  for (const e of r.errors) lines.push(`error  ${e}`);
  for (const f of r.files) lines.push(`png    ${f}`);
  const failing = r.findings.filter((f) => f.level === "fail");
  const fails = failing.reduce((n, f) => n + f.count, 0);
  lines.push(
    fails
      ? `\n${fails} text(s) in ${failing.length} finding(s) below ${r.thresholds.normal}:1 (large text ${r.thresholds.large}:1). Darken or lighten the text, put a scrim behind it, or make it larger; purely decorative text can say data-contrast="ignore".`
      : `\nEvery text reads: at least ${r.thresholds.normal}:1 (large text ${r.thresholds.large}:1).`,
  );
  return lines.join("\n").replace(/^\n/, "");
}
