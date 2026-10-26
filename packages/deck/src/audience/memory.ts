import { readItem, writeItem } from "../core/storage.ts";

export const AUDIENCE_TABS = ["follow", "ask", "polls", "notes", "mine"] as const;
export type AudienceTab = (typeof AUDIENCE_TABS)[number];

export interface AudienceMemory {
  tab: AudienceTab;
  /** The question typed and not sent yet. */
  draft: string;
  /** Ids of the questions this viewer asked (the room keeps askers anonymous, even to themselves). */
  asked: string[];
}

/**
 * What the audience page keeps for this tab of the browser: the panel the viewer was on, the
 * question they had not sent yet, and which questions were theirs. A phone that locks mid-talk
 * often reloads the page when it wakes (the socket reconnecting is what the viewer notices), and
 * without this it came back on Pace with the draft gone. Session storage: per tab, gone when the
 * tab closes; where storage is refused it lasts as long as the page (core/storage.ts), which still
 * covers a remount.
 */
export function audienceMemory(slug: string) {
  const key = `deck.audience.${slug}`;
  const read = (): AudienceMemory => {
    try {
      const v = JSON.parse(readItem(key, "session") ?? "{}") as {
        tab?: unknown;
        draft?: unknown;
        asked?: unknown;
      };
      return {
        tab: AUDIENCE_TABS.includes(v.tab as AudienceTab) ? (v.tab as AudienceTab) : "follow",
        draft: typeof v.draft === "string" ? v.draft.slice(0, 280) : "",
        asked: Array.isArray(v.asked)
          ? v.asked.filter((id): id is string => typeof id === "string").slice(-50)
          : [],
      };
    } catch {
      return { tab: "follow", draft: "", asked: [] };
    }
  };
  return {
    read,
    /** Without `asked`, the ids already stored are kept. */
    write: (tab: AudienceTab, draft: string, asked: readonly string[] = read().asked) =>
      writeItem(key, JSON.stringify({ tab, draft, asked: asked.slice(-50) }), "session"),
  };
}
