/**
 * What the narrator says, as plain functions: shared by the browser and `kadal-deck narrate`, so
 * a clip baked on the command line is found again by the deck (both hash the same text).
 *
 * A slide's notes are cut at `[click]` the way the presenter's notes panel cuts them: segment 0 is
 * what comes before the first marker and is said at click 0, segment i is said at click i.
 */

/** The notes split at `[click]`, each piece trimmed. Empty pieces are kept: they hold a place. */
export function segmentsOf(notesText: string | null | undefined): string[] {
  if (!notesText || !notesText.trim()) return [];
  return notesText.split("[click]").map((s) => s.trim());
}

/**
 * Text fit to be spoken: no leftover markup, no addresses read out a character at a time.
 * Deliberately modest — it expands nothing (numbers, abbreviations), which the voices do well.
 */
export function speakable(text: string): string {
  return text
    .replace(/\[click(?::\d+)?\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\bhttps?:\/\/\S+/g, " ")
    .replace(/[`*_#>~|{}\\]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The parts of a slide the narrator reads. `SlideMeta` has this shape. */
export interface NarratableSlide {
  title?: string | null;
  text?: string;
  notesText?: string | null;
  frontmatter?: Record<string, unknown>;
}

/**
 * The spoken segments of one slide, after its frontmatter has had its say: `narration: false`
 * leaves it silent, `say: "…"` replaces the notes (with `[click]` markers of its own if it likes).
 */
export function slideSegments(slide: NarratableSlide): string[] {
  const fm = slide.frontmatter ?? {};
  if (fm.narration === false) return [];
  const source = typeof fm.say === "string" ? fm.say : slide.notesText;
  const segments = segmentsOf(source).map(speakable);
  return segments.some(Boolean) ? segments : [];
}

/** Speaking pace the estimates assume, in words a minute at rate 1. */
export const SPEAKING_WPM = 165;
/** Reading pace for a slide with nothing to say. */
export const READING_WPM = 230;

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

/** How long `text` takes to say at `rate`, in milliseconds. */
export function speechMs(text: string, rate = 1): number {
  const words = wordCount(text);
  if (!words) return 0;
  return Math.max(700, Math.round((words / (SPEAKING_WPM * Math.max(0.25, rate))) * 60_000));
}

/** How long to leave a slide with no notes on screen: long enough to read it, 2–20 s. */
export function dwellMs(text: string | undefined, rate = 1): number {
  const words = wordCount(speakable(text ?? ""));
  const ms = 2000 + (words / (READING_WPM * Math.max(0.25, rate))) * 60_000;
  return Math.round(Math.min(20_000, Math.max(2000, ms)));
}

/** The `narration.silent` setting: what to do with a slide that has nothing to say. */
export type SilentPolicy = "estimate" | "skip" | number;

/** Milliseconds to stay on a silent slide; 0 means move straight on. */
export function silentMs(policy: SilentPolicy, text: string | undefined, rate = 1): number {
  if (policy === "skip") return 0;
  if (typeof policy === "number") return Math.max(0, policy);
  return dwellMs(text, rate);
}

/** One slide on the narration timeline. */
export interface TimelineEntry {
  index: number;
  title: string | null;
  segments: string[];
  /** Estimated milliseconds for each segment (a silent slide has one, its dwell). */
  ms: number[];
  /** Where the slide starts on the timeline, and how long it lasts, gaps included. */
  start: number;
  duration: number;
}

export interface Timeline {
  slides: TimelineEntry[];
  total: number;
}

/** The whole talk as estimated durations: the progress bar, its markers, elapsed / total. */
export function timelineOf(
  slides: NarratableSlide[],
  opts: { rate: number; gap: number; silent: SilentPolicy; measured?: (text: string) => number | null },
): Timeline {
  let at = 0;
  const out: TimelineEntry[] = slides.map((s, index) => {
    const segments = slideSegments(s);
    const ms = segments.length
      ? segments.map((t) => {
          const known = t ? opts.measured?.(t) : null;
          return known ? known / Math.max(0.25, opts.rate) : speechMs(t, opts.rate);
        })
      : [silentMs(opts.silent, s.text, opts.rate)];
    const duration = ms.reduce((n, m) => n + m, 0) + ms.filter((m) => m > 0).length * opts.gap;
    const entry = { index, title: s.title ?? null, segments, ms, start: at, duration };
    at += duration;
    return entry;
  });
  return { slides: out, total: at };
}

/**
 * What to say at `click` on a slide with these segments and `clicks` steps, as the segments to say
 * one after another. On the slide's last step every segment still unsaid is said, so notes with
 * more `[click]`s than the slide has steps lose no words — and each is still its own clip.
 */
export function segmentPartsAt(segments: string[], click: number, clicks: number): string[] {
  if (!segments.length) return [];
  if (click >= clicks) return segments.slice(click).filter(Boolean);
  const one = segments[click];
  return one ? [one] : [];
}

/** Which segments `segmentPartsAt` says, by their index among the slide's segments. */
export function segmentPartIndexes(segments: string[], click: number, clicks: number): number[] {
  if (!segments.length) return [];
  if (click >= clicks)
    return segments.flatMap((s, i) => (i >= click && s ? [i] : []));
  return segments[click] ? [click] : [];
}

/** The same, as one string. */
export function segmentAt(segments: string[], click: number, clicks: number): string {
  return segmentPartsAt(segments, click, clicks).join(" ");
}

/** Whether a deck narrates: `narration.enabled`, where "auto" means "some slide has words to say". */
export function narrationOn(enabled: boolean | "auto", slides: NarratableSlide[]): boolean {
  if (enabled !== "auto") return enabled;
  return slides.some((s) => slideSegments(s).length > 0);
}
