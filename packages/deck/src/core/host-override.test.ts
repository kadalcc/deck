import { describe, expect, test } from "bun:test";

import { readHostOverride, resolveConfig, roomIdOf, withHostOverride } from "./model.ts";

describe("host override", () => {
  const built = resolveConfig({ slug: "@ana/my-talk" }, { live: { api: "/api", room: null } });

  test("no global: the built config is returned untouched", () => {
    expect(readHostOverride({})).toBeNull();
    expect(withHostOverride(built, readHostOverride({}))).toBe(built);
  });

  test("the host's room, api and badge win over the build", () => {
    const o = readHostOverride({
      __KADAL_DECK__: { room: "dabc123def456", api: "https://deck.kadal.cc/api", badge: true },
    });
    const c = withHostOverride(built, o);
    expect(c.live.room).toBe("dabc123def456");
    expect(c.live.api).toBe("https://deck.kadal.cc/api");
    expect(c.badge).toBe(true);
    expect(c.live.turnstile).toBe(built.live.turnstile);
    expect(built.live.room).toBeNull(); // not mutated
  });

  test("every host call keys on the room id, falling back to the slug", () => {
    expect(roomIdOf(built)).toBe("@ana/my-talk");
    expect(roomIdOf(withHostOverride(built, { room: "dabc123def456" }))).toBe("dabc123def456");
    expect(roomIdOf(resolveConfig({ slug: "" }))).toBe("deck");
  });

  test("malformed values are ignored, not trusted", () => {
    const o = readHostOverride({ __KADAL_DECK__: { room: "../../etc", api: 42, badge: "yes" } });
    expect(o).toEqual({});
    expect(withHostOverride(built, o)).toBe(built);
    expect(readHostOverride({ __KADAL_DECK__: "room" })).toBeNull();
  });

  test("badge defaults off", () => {
    expect(built.badge).toBe(false);
  });
});

describe("the host's quick-edit address", () => {
  test("only an http(s) URL is taken", async () => {
    const { editUrl } = await import("../presenter/EditButton.tsx");
    const scope = (edit: unknown) => ({ __KADAL_DECK__: { edit } });
    expect(readHostOverride(scope("https://deck.kadal.cc/app/decks/d1/quick-edit"))!.edit).toBe(
      "https://deck.kadal.cc/app/decks/d1/quick-edit",
    );
    for (const bad of ["javascript:alert(1)", "/app/decks/d1", "data:text/html,x", 42, "https://"])
      expect(readHostOverride(scope(bad))!.edit).toBeUndefined();
    expect(editUrl(3, 1, scope("https://deck.kadal.cc/app/decks/d1/quick-edit"))).toBe(
      "https://deck.kadal.cc/app/decks/d1/quick-edit?slide=3.1",
    );
    expect(editUrl(0, 0, scope(undefined))).toBeNull();
  });
});
