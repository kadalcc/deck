/**
 * Slidev's named slots for layouts: a line `::right::` (or any `::name::`) splits the slide body
 * into slots. Each slot becomes a `<div data-slot="name">` so a layout's CSS can place it — the
 * two-cols layout puts `default` in the left column and `right` in the right one. A body with no
 * markers is left untouched, so plain slides pay nothing for this.
 */
const MARKER = /^::([a-z][\w-]*)::[ \t]*$/;

export function applySlots(body: string): string {
  const lines = body.split("\n");
  if (!lines.some((l) => MARKER.test(l))) return body;
  const slots: { name: string; lines: string[] }[] = [{ name: "default", lines: [] }];
  let fence: string | null = null;
  for (const line of lines) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1]!;
      else if (line.trim().startsWith(fence[0]!) && line.trim().length >= fence.length)
        fence = null;
    }
    const m = !fence && line.match(MARKER);
    if (m) {
      slots.push({ name: m[1]!, lines: [] });
      continue;
    }
    slots[slots.length - 1]!.lines.push(line);
  }
  return slots
    .filter((s) => s.lines.join("\n").trim())
    .map(
      (s) =>
        `<div data-slot="${s.name}" className="deck-slot deck-slot-${s.name}">\n\n${s.lines.join("\n").trim()}\n\n</div>`,
    )
    .join("\n\n");
}
