import type { Timeline } from "./text.ts";

/**
 * The narration timeline's checkpoints. A long deck has a hundred slides, and a mark for each made
 * the bar a barcode; a talk is told in chapters, so the bar marks those and says the rest on hover.
 *
 * A chapter starts at every `layout: section` slide when the deck has any (the first slides before
 * the first section are a chapter of their own, the opening). Without sections, it starts at every
 * column: a horizontal slide and the vertical ones beneath it are one chapter.
 */

export interface ChapterSlide {
  h: number;
  title?: string | null;
  /** The slide's layout is `section`. */
  section?: boolean;
}

export interface Chapter {
  /** 0-based. */
  n: number;
  /** Flat slide indexes, inclusive. */
  first: number;
  last: number;
  title: string | null;
  /** Milliseconds on the timeline. */
  start: number;
  end: number;
}

export function chaptersOf(slides: ChapterSlide[], timeline: Timeline): Chapter[] {
  if (!slides.length) return [];
  const bySection = slides.some((s) => s.section);
  const starts: number[] = [];
  slides.forEach((s, i) => {
    if (i === 0) starts.push(0);
    else if (bySection ? s.section : s.h !== slides[i - 1]!.h) starts.push(i);
  });
  return starts.map((first, n) => {
    const last = (starts[n + 1] ?? slides.length) - 1;
    const a = timeline.slides[first];
    const b = timeline.slides[last];
    return {
      n,
      first,
      last,
      title: slides[first]!.title ?? null,
      start: a?.start ?? 0,
      end: b ? b.start + b.duration : (a?.start ?? 0),
    };
  });
}

/** The slide playing at `ms` on the timeline (the last one that has started by then). */
export function slideAtTime(timeline: Timeline, ms: number): number {
  let hit = 0;
  for (const s of timeline.slides) {
    if (s.start <= ms) hit = s.index;
    else break;
  }
  return hit;
}

/** The chapter a slide belongs to. */
export function chapterOfSlide(chapters: Chapter[], slide: number): number {
  for (let i = chapters.length - 1; i >= 0; i--) if (chapters[i]!.first <= slide) return i;
  return 0;
}

/** "3:07", or "1:02:07" past the hour. */
export function clock(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "slide 9" or "slides 9–15", 1-based, for a person. */
export function slideRange(c: Pick<Chapter, "first" | "last">): string {
  return c.first === c.last ? `slide ${c.first + 1}` : `slides ${c.first + 1}–${c.last + 1}`;
}
