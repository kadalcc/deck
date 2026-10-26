import { describe, expect, test } from "bun:test";

import { createPanelRegistry, panelAccent } from "./panels.ts";

const panel = (id: string) => ({ id, title: id, mount: () => {} });

describe("host panels", () => {
  test("register adds a panel, and its return removes that one", () => {
    const r = createPanelRegistry();
    const off = r.register(panel("copilot"));
    r.register(panel("notes"));
    expect(r.list().map((p) => p.id)).toEqual(["copilot", "notes"]);
    off();
    expect(r.list().map((p) => p.id)).toEqual(["notes"]);
  });

  test("the same id replaces the earlier panel; removing the old one leaves the new", () => {
    const r = createPanelRegistry();
    const offOld = r.register(panel("copilot"));
    const fresh = { ...panel("copilot"), title: "Copilot 2" };
    r.register(fresh);
    expect(r.list()).toEqual([fresh]);
    offOld();
    expect(r.list()).toEqual([fresh]);
  });

  test("open asks for a panel; removing it drops the request", () => {
    const r = createPanelRegistry();
    const off = r.register(panel("copilot"));
    r.open("copilot");
    expect(r.state.get().requested).toBe("copilot");
    off();
    expect(r.state.get().requested).toBeNull();
  });

  test("a panel without an id, a title or a mount is refused", () => {
    const r = createPanelRegistry();
    expect(() => r.register({ id: "", title: "x", mount: () => {} })).toThrow();
    expect(() => r.register({ id: "x", title: "x" } as never)).toThrow();
  });

  test("the AI accent: asked for, or a copilot's by default; anything else is plain", () => {
    expect(panelAccent({ id: "notes", accent: "ai" })).toBe("ai");
    expect(panelAccent({ id: "copilot" })).toBe("ai");
    expect(panelAccent({ id: "copilot", accent: "none" })).toBeNull();
    expect(panelAccent({ id: "notes" })).toBeNull();
    // A host on an older or newer contract passing something unknown gets a plain tab.
    expect(panelAccent({ id: "notes", accent: "sparkly" as never })).toBeNull();
  });
});
