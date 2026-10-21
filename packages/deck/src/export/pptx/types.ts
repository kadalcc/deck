/**
 * The snapshot the in-page walker (walk.ts) hands to the builder (build.ts): every printed slide
 * as plain JSON, in slide pixels (the authored stage, origin at its top-left corner). The builder
 * sizes the PowerPoint slide `width / 96` × `height / 96` inches, so one CSS pixel is exactly
 * 1/96 inch and 0.75 pt.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** sRGB 0–255 and straight alpha 0–1, the element's own opacity and its ancestors' folded in. */
export type Rgba = [number, number, number, number];

export interface Run {
  text: string;
  /** A family PowerPoint can name (resolved in the page: the first of the stack that loaded). */
  font: string;
  /** Pixels. */
  size: number;
  color: Rgba;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** Pixels of extra space between letters. */
  spacing?: number;
  /** An address, or `slide:<flat index>` for a jump to a slide of this deck. */
  href?: string;
  /** A `<br>` before this run: a line break inside the paragraph. */
  breakBefore?: boolean;
  /** Text an inline picture or formula stands on (en spaces as wide as it): never styled. */
  spacer?: boolean;
}

export interface Bullet {
  kind: "bullet" | "number";
  /** The bullet character, for `kind: "bullet"`. */
  char?: string;
  /** PowerPoint's numbering scheme, for `kind: "number"`. */
  numberType?: string;
  start?: number;
  /** 0 for a top-level item. */
  level: number;
  /** Pixels from the bullet to the text. */
  indent: number;
}

export interface Paragraph {
  runs: Run[];
  align: "left" | "center" | "right" | "justify";
  /** The CSS line height in pixels, or null for the font's own. */
  lineHeight: number | null;
  /** Pixels of space above this paragraph (its distance from the one before). */
  before: number;
  bullet?: Bullet;
  rtl?: boolean;
}

interface Base {
  rect: Rect;
}

export interface TextItem extends Base {
  kind: "text";
  paragraphs: Paragraph[];
  /** Laid out on one line in the browser: PowerPoint must not wrap it either. */
  wrap: boolean;
  /** Code: keep every space, no wrapping. */
  code?: boolean;
}

export interface Line {
  /** Pixels. */
  width: number;
  color: Rgba;
  dash: "solid" | "dash" | "sysDot";
}

export interface BoxItem extends Base {
  kind: "box";
  shape: "rect" | "roundRect" | "ellipse";
  fill?: Rgba;
  /** A border the same on all four sides. */
  line?: Line;
  /** Pixels. */
  radius: number;
  shadow?: { blur: number; x: number; y: number; color: Rgba };
}

export interface ImageItem extends Base {
  kind: "image";
  /** Absolute URL of the picture, fetched in Node with the page's own cookies. */
  src: string;
  /**
   * The rectangle the whole picture is drawn into (object-fit, background-size), when it is not
   * `rect`: the part outside `rect` is cropped away.
   */
  drawn?: Rect;
  opacity: number;
  href?: string;
  /** Marks the element, so a picture that cannot be fetched is photographed instead. */
  id: number;
}

/** Drawn in the browser and placed as a picture: SVG, canvas, maths, diagrams, effects. */
export interface RasterItem extends Base {
  kind: "raster";
  id: number;
  /** "all": the element and everything in it. "own": its own paint only (its children are natively drawn). */
  mode: "all" | "own";
  reason: string;
  /** Pixels the element paints outside its box (a shadow, a glow): the picture takes them in. */
  bleed: number;
}

export interface CellBorder {
  width: number;
  color: Rgba;
}

export interface Cell {
  paragraphs: Paragraph[];
  fill?: Rgba;
  /** Top, right, bottom, left. */
  border: [CellBorder | null, CellBorder | null, CellBorder | null, CellBorder | null];
  /** Pixels: top, right, bottom, left. */
  padding: [number, number, number, number];
  valign: "top" | "middle" | "bottom";
  colspan: number;
  rowspan: number;
}

export interface TableItem extends Base {
  kind: "table";
  /** Pixels. */
  colW: number[];
  rowH: number[];
  /** Cells covered by a span are left out of their row, as PowerPoint wants. */
  rows: Cell[][];
}

export type Item = TextItem | BoxItem | ImageItem | RasterItem | TableItem;

export interface SlideSnapshot {
  /** Index of the print page. */
  page: number;
  /** 0-based flat slide index. */
  slide: number;
  h: number;
  v: number;
  click: number;
  width: number;
  height: number;
  /** The slide's background: a colour, or (`raster`) a picture of the background layer. */
  background: { color: Rgba | null; raster: boolean };
  /** Shapes, pictures and tables, in paint order; text goes over them. */
  under: Item[];
  /** Text boxes, in paint order. */
  over: TextItem[];
  /** Families named in this slide's runs. */
  fonts: string[];
}
