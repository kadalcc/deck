import { describe, expect, test } from "bun:test";

import { createPanelRegistry } from "./panels.ts";

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
});
