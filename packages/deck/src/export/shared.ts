/**
 * Naming shared by the Node exporter (index.ts) and the browser one (browser/): isomorphic, no
 * Node or DOM imports, so both bundles can take it.
 */

/** What a printed page is, as the print view labels it (`data-slide`, `data-click`, …). */
export interface PageLabel {
  /** 0-based flat slide index, or null when the page is not a slide's. */
  slide: number | null;
  click: number;
  /** A notes page (`showNotes: "separate-page"`). */
  notes: boolean;
}

/** A page's PNG name: the slide's number, and its step when the slide has more than one page. */
export function pngName(p: PageLabel, pagesOfSlide: number, index: number): string {
  if (p.slide === null) return `page-${String(index + 1).padStart(3, "0")}.png`;
  const n = String(p.slide + 1).padStart(3, "0");
  if (p.notes) return `${n}-notes.png`;
  return pagesOfSlide > 1 ? `${n}-${p.click}.png` : `${n}.png`;
}

/** Notes as text for a reader: `[click]` / `[click:3]` markers out, blank runs collapsed. */
export function plainNotes(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\[click(?::\s*[+-]?\d+)?\]\s*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A file name from a title: what a download is saved as. */
export function fileStem(title: string | null | undefined, fallback = "deck"): string {
  const stem = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return stem || fallback;
}
