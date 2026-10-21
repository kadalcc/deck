/**
 * `--format md`: the deck as a Markdown file that reads anywhere a README does — a picture of
 * every page and, under it, the slide's notes as text. The shape is Slidev's (`slidev export
 * --format md`): per slide its pictures (one per click step when steps print separately), then
 * its notes, slides separated by `---`. The pictures are the PNG export's (`png/`), so `--png
 * --md` writes them once.
 */

export interface MarkdownSlide {
  /** 1-based slide number. */
  number: number;
  title: string | null;
  /** Paths relative to the .md file, in page order. */
  images: string[];
  notes: string;
}

/** Text safe inside `![…]`: brackets and line breaks would end it early. */
const alt = (s: string) =>
  s
    .replace(/[[\]\\]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim();

/** Spaces in a path would end a Markdown link's target; `<…>` keeps it whole. */
const target = (p: string) => (/[\s()<>]/.test(p) ? `<${p.replace(/[<>]/g, "")}>` : p);

export function deckMarkdown(slides: MarkdownSlide[]): string {
  return (
    slides
      .map((s) => {
        const label = alt(s.title || `Slide ${s.number}`);
        const pics = s.images.map((img) => `![${label}](${target(img)})\n\n`).join("");
        return pics + (s.notes.trim() ? `${s.notes.trim()}\n\n` : "");
      })
      .join("---\n\n")
      .trimEnd() + "\n"
  );
}
