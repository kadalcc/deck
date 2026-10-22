import { afterAll, describe, expect, test } from "bun:test";

// The bus is made only in a page: give this test one (Bun has BroadcastChannel and message events).
const g = globalThis as { window?: unknown };
const hadWindow = "window" in g;
if (!hadWindow) g.window = globalThis;
afterAll(() => {
  if (!hadWindow) delete g.window;
});

const { onDragPosition, postDragPosition } = await import("./drag-sync.ts");

/** Another window of the same deck: a channel of the bus's name, speaking its envelope. */
function otherWindow(slug: string) {
  const ch = new BroadcastChannel(`deck:${slug}:drag`);
  const heard: unknown[] = [];
  ch.onmessage = (e) => heard.push((e.data as { data: unknown }).data);
  let n = 0;
  return {
    heard,
    post: (data: unknown) =>
      ch.postMessage({ "kadal-deck:bus": `${slug}:drag`, id: `other-${n++}`, data }),
    close: () => ch.close(),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe("dragged positions over the window bus", () => {
  test("a move here reaches the deck's other windows, as moving and then as saved", async () => {
    const other = otherWindow("talk");
    postDragPosition("talk", "2:logo", "10,20,300,_", false);
    postDragPosition("talk", "2:logo", "10,20,300,_", true);
    await settle();
    expect(other.heard).toEqual([
      { type: "drag", key: "2:logo", pos: "10,20,300,_", saved: false, from: expect.any(String) },
      { type: "drag", key: "2:logo", pos: "10,20,300,_", saved: true, from: expect.any(String) },
    ]);
    other.close();
  });

  test("a move in another window reaches this element only, and stops when unsubscribed", async () => {
    const other = otherWindow("talk2");
    const heard: string[] = [];
    const off = onDragPosition("talk2", "0:#1", (pos, saved) => heard.push(`${pos}|${saved}`));
    const unrelated: string[] = [];
    const off2 = onDragPosition("talk2", "0:#2", (pos) => unrelated.push(pos));
    other.post({ type: "drag", key: "0:#1", pos: "1,2,3,4", saved: true, from: "w2" });
    await settle();
    expect(heard).toEqual(["1,2,3,4|true"]);
    expect(unrelated).toEqual([]);
    off();
    other.post({ type: "drag", key: "0:#1", pos: "9,9,9,9", saved: false, from: "w2" });
    await settle();
    expect(heard).toEqual(["1,2,3,4|true"]);
    off2();
    other.close();
  });

  test("another deck's bus, a malformed message and this window's own echo are ignored", async () => {
    const elsewhere = otherWindow("other-deck");
    const other = otherWindow("talk3");
    const heard: string[] = [];
    const off = onDragPosition("talk3", "k", (pos) => heard.push(pos));
    elsewhere.post({ type: "drag", key: "k", pos: "x", saved: true, from: "w2" });
    other.post({ type: "drag", key: "k", pos: 5, saved: true, from: "w2" });
    other.post({ type: "other", key: "k", pos: "y", saved: true, from: "w2" });
    await settle();
    expect(heard).toEqual([]);
    off();
    elsewhere.close();
    other.close();
  });
});
