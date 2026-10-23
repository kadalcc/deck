import { readItem, writeItem } from "../core/storage.ts";

export const AUDIENCE_TABS = ["follow", "ask", "polls", "notes", "mine"] as const;
export type AudienceTab = (typeof AUDIENCE_TABS)[number];

/**
 * What the audience page keeps for this tab of the browser: the panel the viewer was on and the
 * question they had not sent yet. A phone that locks mid-talk often reloads the page when it wakes
 * (the socket reconnecting is what the viewer notices), and without this it came back on Pace with
 * the draft gone. Session storage: per tab, gone when the tab closes; where storage is refused it
 * lasts as long as the page (core/storage.ts), which still covers a remount.
 */
export function audienceMemory(slug: string) {
  const key = `deck.audience.${slug}`;
  const read = (): { tab: AudienceTab; draft: string } => {
    try {
      const v = JSON.parse(readItem(key, "session") ?? "{}") as { tab?: unknown; draft?: unknown };
      return {
        tab: AUDIENCE_TABS.includes(v.tab as AudienceTab) ? (v.tab as AudienceTab) : "follow",
        draft: typeof v.draft === "string" ? v.draft.slice(0, 280) : "",
      };
    } catch {
      return { tab: "follow", draft: "" };
    }
  };
  return {
    read,
    write: (tab: AudienceTab, draft: string) =>
      writeItem(key, JSON.stringify({ tab, draft }), "session"),
  };
}
