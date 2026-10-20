import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createCommandRegistry, KEY_COMMANDS } from "./commands.ts";
import { KEY_BINDINGS } from "./keyboard.ts";

describe("command registry", () => {
  test("runs a command with validated params and reports the result", async () => {
    const r = createCommandRegistry();
    let got: unknown = null;
    r.register({
      id: "nav.goto",
      title: "Go",
      description: "Go somewhere.",
      group: "navigate",
      params: z.object({ index: z.number().int().min(0) }).strict(),
      run: (p) => {
        got = p.index;
        return { at: p.index };
      },
    });
    expect(await r.run("nav.goto", { index: 3 })).toEqual({ ok: true, value: { at: 3 } });
    expect(got).toBe(3);
    const bad = await r.run("nav.goto", { index: -1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("invalid");
    const extra = await r.run("nav.goto", { index: 1, nope: true });
    expect(extra.ok).toBe(false);
  });

  test("unknown, disabled and throwing commands fail without throwing", async () => {
    const r = createCommandRegistry();
    r.register({
      id: "a",
      title: "A",
      description: "",
      group: "view",
      enabled: () => false,
      run: () => 1,
    });
    r.register({
      id: "b",
      title: "B",
      description: "",
      group: "view",
      run: () => {
        throw new Error("boom");
      },
    });
    expect(await r.run("zzz")).toMatchObject({ ok: false, code: "unknown" });
    expect(await r.run("a")).toMatchObject({ ok: false, code: "disabled" });
    expect(await r.run("b")).toMatchObject({ ok: false, code: "failed", error: "boom" });
  });

  test("a newer registration shadows an older one until it leaves", async () => {
    const r = createCommandRegistry();
    const base = { title: "", description: "", group: "draw" as const };
    const offOld = r.register({ ...base, id: "draw.clear", run: () => "old" });
    const offNew = r.register({ ...base, id: "draw.clear", run: () => "new" });
    expect(await r.run("draw.clear")).toEqual({ ok: true, value: "new" });
    offNew();
    expect(await r.run("draw.clear")).toEqual({ ok: true, value: "old" });
    offNew(); // removing twice is harmless
    expect(r.has("draw.clear")).toBe(true);
    offOld();
    expect(r.has("draw.clear")).toBe(false);
  });

  test("lists commands with JSON Schema params, hiding disabled ones by default", () => {
    const r = createCommandRegistry();
    r.register({
      id: "view.zoom",
      title: "Zoom",
      description: "",
      group: "view",
      params: z.object({ x: z.number(), y: z.number() }),
      run: () => null,
    });
    r.register({ id: "nav.next", title: "Next", description: "", group: "navigate", run: () => null });
    r.register({
      id: "x.off",
      title: "",
      description: "",
      group: "view",
      enabled: () => false,
      run: () => null,
    });
    const list = r.list();
    expect(list.map((c) => c.id)).toEqual(["nav.next", "view.zoom"]);
    expect(list[1]!.params).toMatchObject({
      type: "object",
      properties: { x: { type: "number" }, y: { type: "number" } },
    });
    expect(list[0]!.params).toMatchObject({ type: "object" });
    expect(r.list({ all: true })).toHaveLength(3);
  });

  test("subscribers hear every run with its origin", async () => {
    const r = createCommandRegistry();
    const seen: string[] = [];
    r.subscribe((e) => seen.push(`${e.id}:${e.origin}:${e.result.ok}`));
    r.register({ id: "a", title: "", description: "", group: "view", run: () => null });
    await r.run("a", {}, "remote");
    await r.run("missing", {}, "agent");
    expect(seen).toEqual(["a:remote:true", "missing:agent:false"]);
  });

  test("runs synchronously up to the command's own work", () => {
    const r = createCommandRegistry();
    let ran = false;
    r.register({
      id: "a",
      title: "",
      description: "",
      group: "view",
      run: () => {
        ran = true;
      },
    });
    void r.run("a");
    // A key press must move the slide in the same task, not a microtask later.
    expect(ran).toBe(true);
  });

  test("every keyboard action maps to a command id (or deliberately to none)", () => {
    for (const b of KEY_BINDINGS) expect(b.action in KEY_COMMANDS).toBe(true);
  });
});
