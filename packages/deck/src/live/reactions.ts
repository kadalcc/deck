import type { ServerMessage } from "./protocol.ts";

/** The most emojis one `react` message floats, however far behind this window was. */
export const MAX_FLOATS = 6;

/**
 * How many emojis to float for the room's messages, keeping `seen` (emoji → the room's running
 * total) current. A `react` carries the total, not the step: floating `min(6, n)` floated six for
 * every tap once six had come in. One message is one new reaction, so it floats the step since
 * the last total this window saw — one, unless messages were missed — and never more than six.
 * The welcome and the room's tally patches only bring `seen` up to date (nothing floats).
 */
export function reactionFloats(seen: Record<string, number>, m: ServerMessage): number {
  if (m.type === "welcome") {
    replace(seen, m.state.reactions);
    return 0;
  }
  if (m.type === "state") {
    if (m.patch.reactions) replace(seen, m.patch.reactions);
    return 0;
  }
  if (m.type !== "react") return 0;
  const before = seen[m.emoji] ?? 0;
  seen[m.emoji] = Math.max(before, m.n);
  return Math.min(MAX_FLOATS, Math.max(1, m.n - before));
}

function replace(seen: Record<string, number>, totals: Record<string, number>) {
  for (const k of Object.keys(seen)) delete seen[k];
  Object.assign(seen, totals);
}
