import type { Captured, Picture } from "./capture.ts";
import type {
  BoxItem,
  Cell,
  ImageItem,
  Paragraph,
  Rect,
  Rgba,
  Run,
  SlideSnapshot,
  TableItem,
  TextItem,
} from "./types.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUILDER  —  snapshots and pictures to pptxgenjs calls
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure apart from the pptxgenjs instance it is handed, so the mapping is testable without a
 * browser. Units: the slide is `width / 96` inches wide, so a CSS pixel is 1/96 inch and 0.75 pt.
 * Paint order is the deck's: the background, then shapes, pictures and tables as the DOM paints
 * them, then the residue (decorations the walker left to a picture), then the text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const IN = 1 / 96;
const PT = 0.75;

export const hex = (c: Rgba) =>
  c
    .slice(0, 3)
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
/** pptxgenjs's transparency, 0 (opaque) to 100. */
export const transparency = (c: Rgba | number) =>
  Math.round(Math.max(0, Math.min(1, 1 - (typeof c === "number" ? c : c[3]))) * 100);

const at = (r: Rect) => ({
  x: r.x * IN,
  y: r.y * IN,
  w: Math.max(r.w, 0.5) * IN,
  h: Math.max(r.h, 0.5) * IN,
});

/** The slice of pptxgenjs this module uses (typed loosely: its own types are a large union). */
export interface PptxSlide {
  background?: { color?: string; data?: string; path?: string; transparency?: number };
  addText(text: unknown, options: Record<string, unknown>): void;
  addShape(shape: string, options: Record<string, unknown>): void;
  addImage(options: Record<string, unknown>): void;
  addTable(rows: unknown, options: Record<string, unknown>): void;
  addNotes(notes: string): void;
}
export interface PptxDeck {
  defineLayout(l: { name: string; width: number; height: number }): void;
  layout: string;
  title: string;
  author: string;
  subject: string;
  company: string;
  addSlide(): PptxSlide;
  write(o: { outputType: "nodebuffer" | "arraybuffer" | "blob" }): Promise<unknown>;
}

/**
 * Which file slide each deck slide starts on (1-based), for links between slides; set by
 * `buildSlides` before it adds any, since a link may point forward.
 */
let slideOf = new Map<number, number>();

/** A link as pptxgenjs takes it: an address, a jump to a slide in the file, or none. */
export function linkTo(href: string | undefined): { url: string } | { slide: number } | null {
  if (!href) return null;
  const m = /^slide:(\d+)$/.exec(href);
  if (!m) return { url: href };
  const n = slideOf.get(Number(m[1]));
  return n ? { slide: n } : null;
}

/** A run's pptxgenjs options. */
export function runOptions(run: Run): Record<string, unknown> {
  const o: Record<string, unknown> = {
    fontFace: run.font,
    fontSize: Math.round(run.size * PT * 100) / 100,
    color: hex(run.color),
  };
  const t = transparency(run.color);
  if (t) o.transparency = t;
  if (run.spacer) return o;
  if (run.bold) o.bold = true;
  if (run.italic) o.italic = true;
  if (run.underline) o.underline = { style: "sng" };
  if (run.strike) o.strike = "sngStrike";
  if (run.sup) o.superscript = true;
  if (run.sub) o.subscript = true;
  if (run.spacing) o.charSpacing = Math.round(run.spacing * PT * 100) / 100;
  const link = linkTo(run.href);
  if (link) o.hyperlink = link;
  return o;
}

/** Paragraphs as pptxgenjs's text array: paragraph options ride on each paragraph's runs. */
export function textRuns(
  paragraphs: Paragraph[],
): { text: string; options: Record<string, unknown> }[] {
  const out: { text: string; options: Record<string, unknown> }[] = [];
  paragraphs.forEach((p, pi) => {
    const para: Record<string, unknown> = { align: p.align };
    if (p.lineHeight) para.lineSpacing = Math.round(p.lineHeight * PT * 100) / 100;
    if (p.before > 0.5) para.paraSpaceBefore = Math.round(p.before * PT * 100) / 100;
    if (p.rtl) para.rtlMode = true;
    if (p.bullet) {
      const b = p.bullet;
      para.bullet =
        b.kind === "number"
          ? {
              type: "number",
              style: b.numberType ?? "arabicPeriod",
              numberStartAt: b.start ?? 1,
              indent: Math.round(b.indent * PT),
            }
          : {
              characterCode: (b.char ?? "•")
                .codePointAt(0)!
                .toString(16)
                .toUpperCase()
                .padStart(4, "0"),
              indent: Math.round(b.indent * PT),
            };
      if (b.level > 0) para.indentLevel = b.level;
    } else para.bullet = false;
    p.runs.forEach((run, ri) => {
      // pptxgenjs breaks a paragraph at "\n" by itself; the walker never leaves one in a run.
      const text = run.text.replace(/\n/g, " ");
      const options: Record<string, unknown> = { ...para, ...runOptions(run) };
      if (run.breakBefore && ri > 0) options.softBreakBefore = true;
      if (ri === p.runs.length - 1 && pi < paragraphs.length - 1) options.breakLine = true;
      out.push({ text, options });
    });
  });
  return out;
}

function addText(slide: PptxSlide, item: TextItem): void {
  if (!item.paragraphs.length) return;
  slide.addText(textRuns(item.paragraphs), {
    ...at(item.rect),
    margin: 0,
    valign: "top",
    wrap: item.wrap,
    fit: "none",
    autoFit: false,
    isTextBox: true,
  });
}

function addBox(slide: PptxSlide, b: BoxItem): void {
  const o: Record<string, unknown> = { ...at(b.rect) };
  // DrawingML strokes straddle the outline, CSS borders lie inside the box: inset by half.
  if (b.line) {
    const half = b.line.width / 2;
    Object.assign(
      o,
      at({
        x: b.rect.x + half,
        y: b.rect.y + half,
        w: b.rect.w - b.line.width,
        h: b.rect.h - b.line.width,
      }),
    );
    o.line = {
      color: hex(b.line.color),
      width: Math.round(b.line.width * PT * 100) / 100,
      ...(transparency(b.line.color) ? { transparency: transparency(b.line.color) } : {}),
      ...(b.line.dash !== "solid" ? { dashType: b.line.dash } : {}),
    };
  } else o.line = { type: "none" };
  // No `fill` is `<a:noFill/>`.
  if (b.fill)
    o.fill = {
      color: hex(b.fill),
      ...(transparency(b.fill) ? { transparency: transparency(b.fill) } : {}),
    };
  if (b.shape === "roundRect")
    o.rectRadius = Math.max(0, b.radius - (b.line ? b.line.width / 2 : 0)) * IN;
  if (b.shadow) {
    const { x, y, blur, color } = b.shadow;
    const angle = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    o.shadow = {
      type: "outer",
      color: hex(color),
      opacity: Math.round(color[3] * 100) / 100,
      blur: Math.round(blur * PT * 100) / 100,
      offset: Math.round(Math.hypot(x, y) * PT * 100) / 100,
      angle: Math.round(angle),
    };
  }
  slide.addShape(b.shape, o);
}

const dataUrl = (mime: string, bytes: Uint8Array) =>
  `${mime};base64,${Buffer.from(bytes).toString("base64")}`;

function addPicture(slide: PptxSlide, pic: Picture, href?: string): void {
  slide.addImage({
    data: dataUrl("image/png", pic.png),
    ...at(pic.rect),
    ...(linkTo(href) ? { hyperlink: linkTo(href) } : {}),
  });
}

function addImage(
  slide: PptxSlide,
  item: ImageItem,
  file: { mime: string; bytes: Uint8Array },
): void {
  const o: Record<string, unknown> = { data: dataUrl(file.mime, file.bytes) };
  if (item.drawn) {
    // The whole picture drawn at `drawn`, the window `rect` of it kept.
    const r = item.rect;
    const d = item.drawn;
    const x0 = Math.max(r.x, d.x);
    const y0 = Math.max(r.y, d.y);
    const x1 = Math.min(r.x + r.w, d.x + d.w);
    const y1 = Math.min(r.y + r.h, d.y + d.h);
    if (x1 <= x0 || y1 <= y0) return;
    Object.assign(o, { x: x0 * IN, y: y0 * IN, w: d.w * IN, h: d.h * IN });
    o.sizing = {
      type: "crop",
      x: (x0 - d.x) * IN,
      y: (y0 - d.y) * IN,
      w: (x1 - x0) * IN,
      h: (y1 - y0) * IN,
    };
  } else Object.assign(o, at(item.rect));
  if (item.opacity < 0.995) o.transparency = transparency(item.opacity);
  const link = linkTo(item.href);
  if (link) o.hyperlink = link;
  slide.addImage(o);
}

function addTable(slide: PptxSlide, t: TableItem): void {
  const border = (b: Cell["border"][number]) =>
    b
      ? { type: "solid", pt: Math.round(b.width * PT * 100) / 100, color: hex(b.color) }
      : { type: "none" };
  const rows = t.rows.map((row) =>
    row.map((cell) => {
      const p0 = cell.paragraphs[0];
      return {
        text: cell.paragraphs.length ? textRuns(cell.paragraphs) : "",
        options: {
          ...(cell.fill
            ? {
                fill: {
                  color: hex(cell.fill),
                  ...(transparency(cell.fill) ? { transparency: transparency(cell.fill) } : {}),
                },
              }
            : {}),
          border: cell.border.map(border),
          // Table cell margins are points in pptxgenjs.
          margin: cell.padding.map((v) => Math.round(v * PT * 100) / 100),
          valign: cell.valign,
          ...(p0 ? { align: p0.align } : {}),
          ...(cell.colspan > 1 ? { colspan: cell.colspan } : {}),
          ...(cell.rowspan > 1 ? { rowspan: cell.rowspan } : {}),
        },
      };
    }),
  );
  slide.addTable(rows, {
    x: t.rect.x * IN,
    y: t.rect.y * IN,
    w: t.colW.reduce((a, b) => a + b, 0) * IN,
    colW: t.colW.map((w) => w * IN),
    rowH: t.rowH.map((h) => h * IN),
    autoPage: false,
  });
}

export interface BuildSlide {
  snap: SlideSnapshot | null;
  pictures: Captured | null;
  /** Fetched originals of image items, by id. */
  files: Map<number, { mime: string; bytes: Uint8Array }>;
  /** The whole slide as a picture: the fallback when the walk failed. */
  whole?: Uint8Array;
  notes?: string;
}

export interface BuildReport {
  slides: number;
  natives: { text: number; shapes: number; images: number; tables: number };
  pictures: number;
  fallbacks: number;
}

/** Add the slides to `pptx`. */
export function buildSlides(
  pptx: PptxDeck,
  slides: BuildSlide[],
  size: { width: number; height: number },
): BuildReport {
  slideOf = new Map();
  slides.forEach((s, i) => {
    const flat = s.snap?.slide;
    if (flat !== undefined && !slideOf.has(flat)) slideOf.set(flat, i + 1);
  });
  const report: BuildReport = {
    slides: 0,
    natives: { text: 0, shapes: 0, images: 0, tables: 0 },
    pictures: 0,
    fallbacks: 0,
  };
  for (const s of slides) {
    const slide = pptx.addSlide();
    report.slides++;
    if (!s.snap || !s.pictures) {
      if (s.whole)
        slide.addImage({
          data: dataUrl("image/png", s.whole),
          x: 0,
          y: 0,
          w: size.width * IN,
          h: size.height * IN,
        });
      report.fallbacks++;
      if (s.notes?.trim()) slide.addNotes(s.notes.trim());
      continue;
    }
    const { snap, pictures } = s;
    // A name, so pptxgenjs files the picture as a JPEG (it assumes PNG for bare data).
    if (pictures.background)
      slide.background = {
        data: dataUrl("image/jpeg", pictures.background),
        path: "background.jpeg",
      };
    else if (snap.background.color) slide.background = { color: hex(snap.background.color) };
    for (const item of snap.under) {
      if (item.kind === "box") {
        addBox(slide, item);
        report.natives.shapes++;
      } else if (item.kind === "table") {
        addTable(slide, item);
        report.natives.tables++;
      } else if (item.kind === "image") {
        const file = s.files.get(item.id);
        const shot = pictures.rasters.get(item.id);
        if (file) {
          addImage(slide, item, file);
          report.natives.images++;
        } else if (shot) {
          addPicture(slide, shot, item.href);
          report.pictures++;
        }
      } else if (item.kind === "raster") {
        const shot = pictures.rasters.get(item.id);
        if (shot) {
          addPicture(slide, shot);
          report.pictures++;
        }
      } else if (item.kind === "text") {
        addText(slide, item);
        report.natives.text++;
      }
    }
    for (const pic of pictures.residue) {
      addPicture(slide, pic);
      report.pictures++;
    }
    for (const t of snap.over) {
      addText(slide, t);
      report.natives.text++;
    }
    if (s.notes?.trim()) slide.addNotes(s.notes.trim());
  }
  return report;
}
