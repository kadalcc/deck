import { describe, expect, test } from "bun:test";

import { writeItem } from "../core/storage.ts";
import { audienceMemory } from "./memory.ts";

describe("audience memory", () => {
  test("a fresh page starts on Pace with no draft", () => {
    expect(audienceMemory("fresh").read()).toEqual({ tab: "follow", draft: "", asked: [] });
  });

  test("the tab and the unsent question come back for the same deck, not another", () => {
    const m = audienceMemory("talk");
    m.write("ask", "Half-typed question");
    // A second page load builds its own handle and reads the same entry.
    expect(audienceMemory("talk").read()).toEqual({
      tab: "ask",
      draft: "Half-typed question",
      asked: [],
    });
    expect(audienceMemory("other-talk").read().tab).toBe("follow");
  });

  test("the viewer's own questions survive a reload, and a write without them keeps them", () => {
    const m = audienceMemory("mine");
    m.write("ask", "", ["q1", "q2"]);
    m.write("polls", "draft");
    expect(audienceMemory("mine").read()).toEqual({
      tab: "polls",
      draft: "draft",
      asked: ["q1", "q2"],
    });
  });

  test("anything unexpected in storage falls back instead of throwing", () => {
    writeItem("deck.audience.junk", "{not json", "session");
    expect(audienceMemory("junk").read()).toEqual({ tab: "follow", draft: "", asked: [] });
    writeItem(
      "deck.audience.odd",
      JSON.stringify({ tab: "admin", draft: 5, asked: ["ok", 7, null] }),
      "session",
    );
    expect(audienceMemory("odd").read()).toEqual({ tab: "follow", draft: "", asked: ["ok"] });
  });
});
