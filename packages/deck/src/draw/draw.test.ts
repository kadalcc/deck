import { describe, expect, test } from "bun:test";

import type { Stroke } from "../live/protocol.ts";
import { DrawingDoc, cleanStrokes, type DrawBusMessage } from "./doc.ts";
import { cut, cutAll, distToSegment, sweep, touches } from "./erase.ts";
import { record, redo, RoomSender, roomOps, undo, emptyHistory } from "./history.ts";
import { constrain, headLength, polylineOf, shapePoints, shapeStroke, tooSmall } from "./shapes.ts";
import { pathOf, segmentsOf } from "./strokes.ts";
import {
  drawingFile,
  isDrawingFile,
  layerKey,
  parseLayerKey,
  parseSvg,
  pathPoints,
  strokePath,
  toSvg,
} from "./svg.ts";
import { sourceFromFiles } from "./source.ts";
import type { BusMessage, WindowBus } from "../core/windows.ts";

const stroke = (id: string, points: [number, number][], extra: Partial<Stroke> = {}): Stroke => ({
  id,
  tool: "pen",
  color: "#ef4444",
  size: 4,
  points,
  ...extra,
});

describe("shapes", () => {
  test("shift snaps a line to 45° and a box to a square, keeping the drag's direction", () => {
    const [x, y] = constrain("line", [0, 0], [100, 10]);
    expect(y).toBe(0);
    expect(x).toBeCloseTo(100.5, 0);
    const d = constrain("arrow", [0, 0], [100, 90]);
    expect(d[0]).toBeCloseTo(d[1], 0);
    expect(constrain("rect", [10, 10], [60, -100])).toEqual([120, -100]);
    expect(constrain("ellipse", [0, 0], [-30, 20])).toEqual([-30, 30]);
  });

  test("a rectangle doubles its corners, so even the pen's curve draws it square", () => {
    const pts = shapePoints("rect", [10, 20], [110, 70], 4);
    expect(pts).toHaveLength(10);
    expect(pts[0]).toEqual([10, 20]);
    expect(pts[1]).toEqual([10, 20]);
    expect(pts[2]).toEqual([110, 20]);
    expect(pts[pts.length - 1]).toEqual([10, 20]);
    // pathOf through doubled corners: every curve's control point is one of its own ends.
    const d = pathOf(pts);
    expect(d).toContain("Q 10 20 60 20");
    expect(d).toContain("Q 110 20 110 20");
  });

  test("an ellipse is closed and inscribed in the drag box", () => {
    const pts = shapePoints("ellipse", [0, 0], [200, 100], 4);
    expect(pts[0]).toEqual(pts[pts.length - 1]!);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-0.1);
      expect(x).toBeLessThanOrEqual(200.1);
      expect(y).toBeGreaterThanOrEqual(-0.1);
      expect(y).toBeLessThanOrEqual(100.1);
    }
  });

  test("the arrowhead grows with the stroke, and never outgrows a short shaft", () => {
    expect(headLength(4)).toBe(16);
    expect(headLength(16)).toBe(56);
    const barb = (size: number, len: number) => {
      const pts = shapePoints("arrow", [0, 0], [len, 0], size);
      const tip = pts[1]!;
      const left = pts[3]!;
      return Math.hypot(tip[0] - left[0], tip[1] - left[1]);
    };
    expect(barb(16, 1000)).toBeCloseTo(56, 0);
    expect(barb(4, 1000)).toBeCloseTo(16, 0);
    expect(barb(16, 20)).toBeLessThanOrEqual(12.1);
  });

  test("a shape stroke keeps its kind and drag; a click is too small to be one", () => {
    const s = shapeStroke(stroke("a", []), "arrow", [0, 0], [100, 10], true);
    expect(s.shape).toBe("arrow");
    expect(s.anchor![1][1]).toBe(0);
    expect(tooSmall("rect", [0, 0], [2, 3])).toBe(true);
    expect(tooSmall("line", [0, 0], [10, 0])).toBe(false);
  });

  test("a shape draws straight and in one colour; a pen drifts through its family", () => {
    const rect = shapeStroke(stroke("r", [], { color: "#3b82f6" }), "rect", [0, 0], [100, 100]);
    const segs = segmentsOf(rect);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.color).toBe("#3b82f6");
    expect(segs[0]!.d).not.toContain("Q");
    expect(
      polylineOf([
        [0, 0],
        [0, 0],
        [5, 5],
      ]),
    ).toBe("M 0 0 L 5 5");
  });
});

describe("eraser", () => {
  test("distance to a segment", () => {
    expect(distToSegment([5, 5], [0, 0], [10, 0])).toBe(5);
    expect(distToSegment([-3, 4], [0, 0], [10, 0])).toBe(5);
  });

  test("a stroke is touched at its painted edge — a highlighter is wider", () => {
    const pen = stroke(
      "p",
      [
        [0, 0],
        [100, 0],
      ],
      { size: 4 },
    );
    expect(touches(pen, [50, 11], 10)).toBe(true);
    expect(touches(pen, [50, 13], 10)).toBe(false);
    const hi = { ...pen, tool: "highlighter" as const };
    expect(touches(hi, [50, 15], 10)).toBe(true);
  });

  test("a fast sweep across a stroke still catches it", () => {
    const s = [
      stroke("a", [
        [50, 0],
        [50, 100],
      ]),
      stroke("b", [
        [500, 0],
        [500, 100],
      ]),
    ];
    expect(sweep(s, [0, 50], [100, 50], 5)).toEqual(["a"]);
  });

  test("the partial eraser cuts a long straight edge where it crosses, and keeps the rest", () => {
    let n = 0;
    const id = () => `n${++n}`;
    const line = stroke("l", [
      [0, 0],
      [200, 0],
    ]);
    const left = cut(line, [100, 0], 10, id)!;
    expect(left).toHaveLength(2);
    expect(left[0]!.id).toBe("l");
    expect(left[1]!.id).toBe("n1");
    expect(Math.max(...left[0]!.points.map((p) => p[0]))).toBeLessThan(90);
    expect(Math.min(...left[1]!.points.map((p) => p[0]))).toBeGreaterThan(110);
    // A shape's pieces still draw as the shape did, without its drag; a closed outline cut once
    // is one piece, cut twice two.
    const rect = shapeStroke(stroke("r", []), "rect", [0, 0], [100, 100]);
    const pieces = cut(rect, [50, 0], 5, id)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.shape).toBe("rect");
    expect(pieces[0]!.anchor).toBeUndefined();
    expect(cutAll(pieces, [50, 100], 5, id)).toHaveLength(2);
    expect(cut(line, [100, 50], 5, id)).toBeNull();
  });

  test("cutAll keeps the order and returns the same list when it touches nothing", () => {
    const list = [
      stroke("a", [
        [0, 0],
        [100, 0],
      ]),
      stroke("b", [
        [0, 50],
        [100, 50],
      ]),
    ];
    expect(cutAll(list, [50, 200], 5, () => "x")).toBe(list);
    const out = cutAll(list, [50, 0], 5, () => "x");
    expect(out.map((s) => s.id)).toEqual(["a", "x", "b"]);
  });
});

describe("history and the room", () => {
  test("undo and redo walk the steps; a new change forgets redo", () => {
    let h = emptyHistory<string>();
    h = record(h, "a");
    h = record(h, "b");
    const u = undo(h, "c")!;
    expect(u.value).toBe("b");
    const r = redo(u.history, "b")!;
    expect(r.value).toBe("c");
    expect(record(u.history, "b").redo).toEqual([]);
    expect(undo(emptyHistory(), "x")).toBeNull();
  });

  test("roomOps says a change in the room's three words", () => {
    const a = stroke("a", [[0, 0]]);
    const b = stroke("b", [[1, 1]]);
    const c = stroke("c", [[2, 2]]);
    expect(roomOps("0,0", [a], [a, b])).toEqual([{ type: "draw", slide: "0,0", stroke: b }]);
    expect(roomOps("0,0", [a, b], [a])).toEqual([{ type: "draw:undo", slide: "0,0" }]);
    expect(roomOps("0,0", [a, b], [])).toEqual([{ type: "draw:clear", slide: "0,0" }]);
    expect(roomOps("0,0", [a, b], [a, b])).toEqual([]);
    // Erased from the middle: clear, then what is left.
    expect(roomOps("0,0", [a, b, c], [a, c]).map((m) => m.type)).toEqual([
      "draw:clear",
      "draw",
      "draw",
    ]);
    // A stroke cut in place keeps its id but not its points: it is said again.
    const a2 = { ...a, points: [[5, 5]] as [number, number][] };
    expect(roomOps("0,0", [a], [a2]).map((m) => m.type)).toEqual(["draw:clear", "draw"]);
  });

  test("RoomSender keeps to the room's pace and order", () => {
    const sent: string[] = [];
    let t = 0;
    const s = new RoomSender(
      (m) => sent.push(m.type),
      3,
      1000,
      () => t,
    );
    s.push([
      { type: "draw:clear", slide: "0,0" },
      ...[1, 2, 3, 4].map((i) => ({
        type: "draw" as const,
        slide: "0,0",
        stroke: stroke(`s${i}`, [[0, 0]]),
      })),
    ]);
    expect(sent).toEqual(["draw:clear", "draw", "draw"]);
    expect(s.pending).toBe(2);
    s.dispose();
  });
});

describe("drawing files", () => {
  const size = { width: 1920, height: 1080 };

  test("strokes round-trip through the file, by click step", () => {
    const pen = stroke(
      "s_1",
      [
        [10, 20],
        [30, 40.25],
        [50, 60],
      ],
      { color: "#22c55e", size: 8 },
    );
    const hi = stroke(
      "s_2",
      [
        [0, 0],
        [100, 0],
      ],
      { tool: "highlighter", size: 16 },
    );
    const arrow = shapeStroke(stroke("s_3", [], { size: 6 }), "arrow", [100, 100], [400, 300]);
    const svg = toSvg({ 0: [pen, hi], 2: [arrow] }, 1920, 1080);
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg).toContain('<g data-click="2">');
    const back = parseSvg(svg, size, "3");
    expect(back[0]!.map((s) => s.id)).toEqual(["s_1", "s_2"]);
    expect(back[0]![0]!.points[1]).toEqual([30, 40.3]);
    expect(back[0]![1]!.tool).toBe("highlighter");
    expect(back[0]![1]!.size).toBe(16);
    expect(back[2]![0]!.shape).toBe("arrow");
    expect(back[2]![0]!.anchor).toEqual([
      [100, 100],
      [400, 300],
    ]);
    expect(back[2]![0]!.points).toEqual(arrow.points);
  });

  test("fading scribbles are never written; an empty drawing is no file", () => {
    expect(
      toSvg(
        {
          0: [
            stroke(
              "f",
              [
                [0, 0],
                [1, 1],
              ],
              { fade: true },
            ),
          ],
        },
        100,
        100,
      ),
    ).toBe("");
    expect(toSvg({}, 100, 100)).toBe("");
  });

  test("markup from elsewhere loads as shapes, scaled from its own viewBox", () => {
    // drauu's markup as Slidev writes it, at Slidev's 980×552 canvas.
    const svg = `<svg viewBox="0 0 980 552"><g>
      <line x1="0" y1="0" x2="490" y2="276" stroke="red" stroke-width="2" marker-end="url(#m)"/>
      <rect x="98" y="55.2" width="98" height="55.2" stroke="#000" fill="none"/>
      <ellipse cx="490" cy="276" rx="49" ry="27.6" style="stroke: blue; stroke-width: 4"/>
      <path d="M 0 0 L 98 0 l 0 55.2 Z" stroke="green"/>
      <script>alert(1)</script>
    </g></svg>`;
    const layers = parseSvg(svg, size, "4");
    const list = layers[0]!;
    expect(list.map((s) => s.shape ?? "path")).toEqual(["arrow", "rect", "ellipse", "path"]);
    expect(list[0]!.anchor![1]).toEqual([960, 540]);
    expect(list[0]!.color).toBe("red");
    expect(list[2]!.color).toBe("blue");
    expect(list[3]!.points).toEqual([
      [0, 0],
      [192, 0],
      [192, 108],
      [0, 0],
    ]);
    // Ids are stable, so every screen that reads the file agrees on them.
    expect(parseSvg(svg, size, "4")[0]!.map((s) => s.id)).toEqual(list.map((s) => s.id));
  });

  test("path data: relative commands, curves by their ends, several subpaths", () => {
    expect(pathPoints("m10 10 l5 0 h5 v5 c1 1 2 2 3 3 M0 0 L1 1")).toEqual([
      [
        [10, 10],
        [15, 10],
        [20, 10],
        [20, 15],
        [23, 18],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ]);
  });

  test("a stroke's path in the file is the one the slide draws", () => {
    const rect = shapeStroke(stroke("r", []), "rect", [0, 0], [10, 10]);
    expect(strokePath(rect)).toBe("M 0 0 L 10 0 L 10 10 L 0 10 L 0 0");
    const ell = shapeStroke(stroke("e", []), "ellipse", [0, 0], [10, 10]);
    expect(strokePath(ell)).toContain("Q");
  });

  test("file names: the slide's id, else its number from 1; nothing that walks paths", () => {
    expect(drawingFile({ index: 2, frontmatter: {} })).toBe("3");
    expect(drawingFile({ index: 2, frontmatter: { id: "intro slide!" } })).toBe("intro-slide");
    expect(drawingFile({ index: 0, frontmatter: { id: "../../x" } })).toBe("x");
    expect(isDrawingFile("intro-slide")).toBe(true);
    expect(isDrawingFile("../x")).toBe(false);
    expect(isDrawingFile("a/b")).toBe(false);
  });

  test("layer keys carry the click step, short enough for the room", () => {
    expect(layerKey(3, 1)).toBe("3,1");
    expect(layerKey(3, 1, 4)).toBe("3,1@4");
    expect(parseLayerKey("3,1@4")).toEqual({ slide: "3,1", click: 4 });
    expect(parseLayerKey("3,1")).toEqual({ slide: "3,1", click: 0 });
    expect(layerKey(999, 99, 99).length).toBeLessThanOrEqual(12);
  });

  test("a deck compiled in the browser carries its drawing files", async () => {
    const { compileDeck } = await import("../runtime/compile.ts");
    const svg = toSvg({ 0: [stroke("s_9", [[1, 2], [3, 4]])] }, 1920, 1080);
    const { manifest } = await compileDeck("# One\n\n---\n\n# Two\n", {
      files: { "drawings/2.svg": svg },
    });
    expect(await manifest.drawings!.load()).toEqual({ "2": svg });
    expect((await compileDeck("# One\n")).manifest.drawings).toBeNull();
  });

  test("the runtime compiler's files give a source of drawings", async () => {
    expect(sourceFromFiles({ "deck.mdx": "# x" })).toBeNull();
    const src = sourceFromFiles({ "drawings/2.svg": "<svg/>", "drawings/../x.svg": "<svg/>" })!;
    expect(await src.load()).toEqual({ "2": "<svg/>" });
  });
});

/** Two windows' buses joined in memory, as a BroadcastChannel would. */
function pairBuses(): [WindowBus<DrawBusMessage>, WindowBus<DrawBusMessage>] {
  const make = (): WindowBus<DrawBusMessage> & {
    peer?: WindowBus<DrawBusMessage>;
    hear: (m: DrawBusMessage) => void;
  } => {
    const listeners = new Set<(m: BusMessage<DrawBusMessage>) => void>();
    const bus = {
      peer: undefined as WindowBus<DrawBusMessage> | undefined,
      post(data: DrawBusMessage) {
        (bus.peer as unknown as { hear: (m: DrawBusMessage) => void })?.hear(structuredClone(data));
      },
      hear(data: DrawBusMessage) {
        for (const l of listeners) l({ data, via: "channel" });
      },
      subscribe(l: (m: BusMessage<DrawBusMessage>) => void) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      adopt() {},
      close() {
        listeners.clear();
      },
    };
    return bus as never;
  };
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

describe("the shared drawing", () => {
  test("a change in one window shows in the other; undo is the drawer's own", () => {
    const [busA, busB] = pairBuses();
    const sent: string[] = [];
    const a = new DrawingDoc({ windowId: "a", room: (m) => sent.push(m.type) });
    const b = new DrawingDoc({ windowId: "b" });
    a.attach(busA);
    b.attach(busB);
    const s1 = stroke("s1", [
      [0, 0],
      [10, 10],
    ]);
    a.change({ "0,0": [s1] });
    expect(b.get("0,0").map((s) => s.id)).toEqual(["s1"]);
    expect(sent).toEqual(["draw"]);
    expect(a.canUndo("0,0")).toBe(true);
    expect(b.canUndo("0,0")).toBe(false);
    a.change({ "0,0": [s1, stroke("s2", [[5, 5]])] });
    a.undo("0,0");
    expect(b.get("0,0").map((s) => s.id)).toEqual(["s1"]);
    expect(sent).toEqual(["draw", "draw", "draw:undo"]);
    a.undo("0,0");
    expect(b.get("0,0")).toEqual([]);
    expect(sent.at(-1)).toBe("draw:clear");
    a.redo("0,0");
    expect(b.get("0,0").map((s) => s.id)).toEqual(["s1"]);
  });

  test("a window that opens late is given what the others have", () => {
    const [busA, busB] = pairBuses();
    const a = new DrawingDoc({ windowId: "a", initial: { "1,0@2": [stroke("k", [[1, 1]])] } });
    a.attach(busA);
    const b = new DrawingDoc({ windowId: "b" });
    b.attach(busB);
    expect(b.get("1,0@2").map((s) => s.id)).toEqual(["k"]);
  });

  test("undo of a multi-layer clear restores every layer; faded strokes stay gone", () => {
    const gone = new Set(["f"]);
    const d = new DrawingDoc({ windowId: "a", alive: (s) => !gone.has(s.id) });
    d.change(
      { "0,0": [stroke("a", [[0, 0]]), stroke("f", [[1, 1]], { fade: true })] },
      { history: false },
    );
    d.change({ "0,0@1": [stroke("b", [[2, 2]])] }, { history: false });
    d.change({ "0,0": [], "0,0@1": [] });
    d.undo("0,0");
    expect(d.get("0,0").map((s) => s.id)).toEqual(["a"]);
    expect(d.get("0,0@1").map((s) => s.id)).toEqual(["b"]);
  });

  test("strokes from another window are checked before they are drawn", () => {
    expect(cleanStrokes("nope")).toBeNull();
    const out = cleanStrokes([
      {
        id: "ok",
        tool: "pen",
        color: "red",
        size: 400,
        points: [
          [1, 2],
          ["x", 3],
          [4, 5],
        ],
        shape: "rect",
      },
      { id: 5, points: [[0, 0]] },
      { id: "nopoints", points: [] },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0]!.size).toBe(80);
    expect(out[0]!.points).toEqual([
      [1, 2],
      [4, 5],
    ]);
    expect(out[0]!.shape).toBe("rect");
  });
});
