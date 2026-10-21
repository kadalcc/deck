/**
 * `[click]` markers in speaker notes, as data.
 *
 * Notes are paced by markers: the text before the first marker is what to say before any click,
 * and each `[click]` starts the part for the next step. `[click:3]` (Slidev's spelling) starts the
 * part for step 3 exactly, so a slide whose first two steps need no words can say so. Every view
 * that shows notes by step — the presenter's panel, the /notes and /overview pages, the phone
 * remote — reads them through here, so they agree on which part is "now".
 */

/** `[click]` or `[click:N]`; a global regex, so reset `lastIndex` (or use `matchAll`). */
export const CLICK_MARKER = /\[click(?::(\d+))?\]/gi;

export interface NotesPart {
  /** The step this part belongs to: 0 before any marker. */
  click: number;
  text: string;
}

/**
 * Cut notes at their markers. Each part carries the step it starts at: `[click]` is one more
 * than the step before it, `[click:N]` is N. The part before the first marker is step 0, and is
 * kept even when empty, so part `i` of a notes text always means "after the i-th marker".
 */
export function splitNotes(text: string): NotesPart[] {
  const parts: NotesPart[] = [];
  let at = 0;
  let click = 0;
  for (const m of text.matchAll(CLICK_MARKER)) {
    parts.push({ click, text: text.slice(at, m.index) });
    click = m[1] !== undefined ? Number(m[1]) : click + 1;
    at = m.index! + m[0].length;
  }
  parts.push({ click, text: text.slice(at) });
  return parts;
}

/**
 * Which part is "now" at a step: the last one whose step has been reached. Parts are not assumed
 * to be in order — `[click:5]` may come before `[click:2]` — so it is the one with the highest
 * step not past `click` (the later one, on a tie). -1 when none has been reached.
 */
export function currentPart(steps: readonly number[], click: number): number {
  let best = -1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s <= click && (best === -1 || s >= steps[best]!)) best = i;
  }
  return best;
}

/** Past, current or future, for styling a part (or the marker that opens it). */
export function partState(
  steps: readonly number[],
  index: number,
  click: number,
): "past" | "current" | "future" {
  const now = currentPart(steps, click);
  if (index === now) return "current";
  return steps[index]! <= click ? "past" : "future";
}

/** The notes for one step, trimmed; null when there is nothing to say then. */
export function notesForClick(text: string | null | undefined, click: number): string | null {
  if (!text) return null;
  const parts = splitNotes(text);
  const i = currentPart(
    parts.map((p) => p.click),
    Math.max(0, click),
  );
  const part = i === -1 ? "" : parts[i]!.text.trim();
  return part || null;
}
