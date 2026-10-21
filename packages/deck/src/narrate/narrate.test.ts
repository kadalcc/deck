import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { z } from "zod";

import { createCommandRegistry } from "../core/commands.ts";
import { clipKey, lookup, parseIndex, sha256 } from "./baked.ts";
import { chooseEngine, type Engine, silentEngine } from "./engine.ts";
import { Narrator, type NarratorHost, type Position } from "./player.ts";
import { narrationPosition } from "./progress.ts";
import {
  dwellMs,
  segmentAt,
  segmentPartsAt,
  segmentsOf,
  silentMs,
  slideSegments,
  speakable,
  speechMs,
  timelineOf,
} from "./text.ts";

describe("text", () => {
  test("segments split at [click], segment 0 before the first marker", () => {
    expect(segmentsOf("Hello. [click] One. [click] Two.")).toEqual(["Hello.", "One.", "Two."]);
    expect(segmentsOf("[click] One")).toEqual(["", "One"]);
    expect(segmentsOf(null)).toEqual([]);
    expect(segmentsOf("   ")).toEqual([]);
  });

  test("speakable strips markup and addresses", () => {
    expect(speakable("Use `<Toc />` and **bold** — see [the docs](https://x.y) at https://a.b/c ."))
      .toBe("Use and bold — see the docs at.");
    expect(speakable("a {1+1} b")).toBe("a 1+1 b");
  });

  test("frontmatter: narration false silences, say replaces", () => {
    expect(slideSegments({ notesText: "Hi", frontmatter: { narration: false } })).toEqual([]);
    expect(slideSegments({ notesText: "Hi", frontmatter: { say: "Hello [click] there" } })).toEqual([
      "Hello",
      "there",
    ]);
    // A headmatter-style object is not an override.
    expect(slideSegments({ notesText: "Hi", frontmatter: { narration: { voice: "x" } } })).toEqual(["Hi"]);
    expect(slideSegments({ notesText: "[click] [click]" })).toEqual([]);
  });

  test("estimates scale with words and rate", () => {
    const ten = "one two three four five six seven eight nine ten";
    expect(speechMs("")).toBe(0);
    expect(speechMs(ten, 1)).toBe(Math.round((10 / 165) * 60_000));
    expect(speechMs(ten, 2)).toBeLessThan(speechMs(ten, 1));
    expect(speechMs("hi")).toBe(700);
    expect(dwellMs("")).toBe(2000);
    expect(dwellMs("word ".repeat(5000))).toBe(20_000);
    expect(silentMs("skip", "anything")).toBe(0);
    expect(silentMs(1500, "anything")).toBe(1500);
  });

  test("the last step says whatever is left", () => {
    const segs = ["a", "b", "c", "d"];
    expect(segmentAt(segs, 0, 2)).toBe("a");
    expect(segmentAt(segs, 2, 2)).toBe("c d");
    expect(segmentAt(segs, 0, 0)).toBe("a b c d");
    expect(segmentAt(["a"], 1, 3)).toBe("");
    expect(segmentPartsAt(segs, 2, 2)).toEqual(["c", "d"]);
    expect(segmentPartsAt(["a", "", "c"], 1, 2)).toEqual([]);
  });

  test("timeline: starts accumulate, silent slides dwell", () => {
    const t = timelineOf(
      [{ notesText: "one two [click] three" }, { text: "" }, { notesText: "four" }],
      { rate: 1, gap: 100, silent: 1000 },
    );
    expect(t.slides.map((s) => s.start)).toEqual([0, t.slides[0]!.duration, t.slides[0]!.duration + 1100]);
    expect(t.slides[1]!.ms).toEqual([1000]);
    expect(t.total).toBe(t.slides.reduce((n, s) => n + s.duration, 0));
    const measured = timelineOf([{ notesText: "four" }], {
      rate: 2,
      gap: 0,
      silent: "skip",
      measured: () => 4000,
    });
    expect(measured.total).toBe(2000);
  });
});

describe("narration.json", () => {
  test("sha256 matches node's", () => {
    for (const s of ["", "abc", "af_heart|Hello, world.", "é ✓ 日本".repeat(40)])
      expect(sha256(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });

  test("lookup by voice|text, and only safe paths survive parsing", () => {
    const key = clipKey("af_heart", "Hello.");
    const index = parseIndex({
      version: 1,
      clips: {
        [key]: { src: "narration/a.mp3", ms: 1200 },
        [clipKey("af_heart", "x")]: { src: "https://evil.example/a.mp3" },
        [clipKey("af_heart", "y")]: { src: "../secret" },
        nothex: { src: "narration/b.mp3" },
      },
    });
    expect(Object.keys(index.clips)).toEqual([key]);
    expect(lookup(index, "af_heart", "Hello.")).toEqual({ src: "narration/a.mp3", ms: 1200 });
    expect(lookup(index, "af_bella", "Hello.")).toBeNull();
    expect(parseIndex("nonsense").clips).toEqual({});
  });
});

describe("engine choice", () => {
  test("auto: baked, then kokoro when ready, else the browser while kokoro loads", () => {
    const have = { baked: false, kokoro: "idle" as const, browser: true };
    expect(chooseEngine("auto", { ...have, baked: true })).toEqual({ engine: "baked", loadKokoro: false });
    expect(chooseEngine("auto", have)).toEqual({ engine: "browser", loadKokoro: true });
    expect(chooseEngine("auto", { ...have, kokoro: "loading" })).toEqual({ engine: "browser", loadKokoro: false });
    expect(chooseEngine("auto", { ...have, kokoro: "ready" }).engine).toBe("kokoro");
    expect(chooseEngine("auto", { ...have, kokoro: "unavailable" })).toEqual({ engine: "browser", loadKokoro: false });
    expect(chooseEngine("auto", { ...have, browser: false, kokoro: "error" }).engine).toBe("silent");
    expect(chooseEngine("browser", { ...have, baked: true }).engine).toBe("browser");
    expect(chooseEngine("baked", have).engine).toBe("browser");
  });
});

// ── the autoplay state machine, against a fake deck ─────────────────────────

/** A deck of slides with this many clicks each, driven through a real command registry. */
function fakeDeck(clicks: number[]) {
  const nav = { index: 0, click: 0 };
  const listeners = new Set<() => void>();
  const moved = () => listeners.forEach((l) => l());
  const registry = createCommandRegistry();
  const log: string[] = [];
  const reg = (id: string, run: (p: { index?: number; click?: number }) => void) =>
    registry.register({
      id,
      title: id,
      description: id,
      group: "navigate",
      params: z.object({ index: z.number(), click: z.number() }).partial(),
      run: (p) => run(p as never),
    } as never);
  reg("nav.next", () => {
    if (nav.click < clicks[nav.index]!) nav.click++;
    else if (nav.index < clicks.length - 1) {
      nav.index++;
      nav.click = 0;
    } else return;
    moved();
  });
  reg("nav.prev", () => {
    if (nav.click > 0) nav.click--;
    else if (nav.index > 0) {
      nav.index--;
      nav.click = clicks[nav.index]!;
    } else return;
    moved();
  });
  reg("nav.first", () => {
    nav.index = 0;
    nav.click = 0;
    moved();
  });
  reg("nav.goto", (p) => {
    nav.index = p.index ?? 0;
    nav.click = p.click ?? 0;
    moved();
  });
  registry.subscribe((e) => log.push(e.id));
  /** A person pressing a key: the deck moves without the narrator asking. */
  const press = (index: number, click = 0) => {
    nav.index = index;
    nav.click = click;
    moved();
  };
  return {
    nav,
    log,
    press,
    where: (): Position => ({ index: nav.index, click: nav.click, clicks: clicks[nav.index]! }),
    run: (id: string, params?: unknown) => registry.run(id, params, "api"),
    onMove: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** An engine that records what it was asked to say, and finishes when told to. */
function fakeEngine() {
  const said: string[] = [];
  const pending: Array<(v: "ended") => void> = [];
  const engine: Engine = {
    id: "browser",
    speak(text) {
      said.push(text);
      let settle: (v: "ended" | "cancelled") => void = () => {};
      const done = new Promise<"ended" | "cancelled">((r) => (settle = r));
      pending.push(settle);
      return { done, cancel: () => settle("cancelled") };
    },
  };
  return { engine, said, finish: () => pending.shift()?.("ended") };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean, ms = 1000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await tick();
  }
}

function narrator(
  slides: NarratorHost["slides"],
  clicks: number[],
  over: Partial<NarratorHost> = {},
) {
  const deck = fakeDeck(clicks);
  const voice = fakeEngine();
  const host: NarratorHost = {
    slides,
    where: deck.where,
    run: deck.run,
    onMove: deck.onMove,
    engineFor: async () => voice.engine,
    estimate: () => 1000,
    gap: 0,
    silent: "skip",
    ...over,
  };
  const n = new Narrator(host, { voice: "af_heart", rate: 1, engine: "auto" });
  return { n, deck, voice };
}

describe("narrator", () => {
  test("says each step, advances clicks then slides, and ends", async () => {
    const { n, deck, voice } = narrator(
      [{ notesText: "Intro [click] first [click] second" }, { notesText: "Next slide" }],
      [2, 0],
    );
    await n.play();
    await until(() => voice.said.length === 1);
    expect(voice.said).toEqual(["Intro"]);
    expect(n.state.get().phase).toBe("speaking");
    voice.finish();
    await until(() => voice.said.length === 2);
    expect(deck.nav).toEqual({ index: 0, click: 1 });
    voice.finish();
    await until(() => voice.said.length === 3);
    voice.finish();
    await until(() => voice.said.length === 4);
    expect(voice.said).toEqual(["Intro", "first", "second", "Next slide"]);
    expect(deck.nav).toEqual({ index: 1, click: 0 });
    voice.finish();
    await until(() => n.state.get().phase === "ended", 3000);
    expect(n.state.get().playing).toBe(false);
    // Every move went through nav.* commands.
    expect(deck.log.filter((id) => id === "nav.next").length).toBe(4);
  });

  test("each state it passes through puts the timeline further on, never back", async () => {
    // The real clock: every state is read at the moment it is published, as the bar reads it.
    const slides = [{ notesText: "one two [click] three" }, { notesText: "four" }, { notesText: "five six" }];
    const { n, voice } = narrator(slides, [1, 0, 0], { gap: 20, estimate: () => 30 });
    const timeline = timelineOf(slides, { rate: 1, gap: 20, silent: "skip", measured: () => 30 });
    const seen: number[] = [];
    n.state.subscribe((s) => seen.push(narrationPosition(timeline, 20, s, Date.now())));
    await n.play();
    for (let i = 0; i < 4; i++) {
      await until(() => voice.said.length === i + 1);
      await new Promise((r) => setTimeout(r, 30));
      voice.finish();
    }
    await until(() => n.state.get().phase === "ended", 3000);
    const back = seen.filter((at, i) => i > 0 && at < seen[i - 1]! - 1);
    expect(back).toEqual([]);
    expect(seen.at(-1)).toBe(timeline.total);
  });

  test("pause stops at once; play says the step again", async () => {
    const { n, voice } = narrator([{ notesText: "A [click] B" }], [1]);
    await n.play();
    await until(() => voice.said.length === 1);
    n.pause();
    expect(n.state.get()).toMatchObject({ playing: false, phase: "paused" });
    voice.finish(); // the cancelled utterance finishing changes nothing
    await tick();
    expect(voice.said).toEqual(["A"]);
    await n.play();
    await until(() => voice.said.length === 2);
    expect(voice.said).toEqual(["A", "A"]);
  });

  test("a hand on the keys while it plays jumps the narration there", async () => {
    const { n, deck, voice } = narrator(
      [{ notesText: "zero" }, { notesText: "one" }, { notesText: "two" }],
      [0, 0, 0],
    );
    await n.play();
    await until(() => voice.said.length === 1);
    deck.press(2);
    await until(() => voice.said.length === 2);
    expect(voice.said).toEqual(["zero", "two"]);
    expect(n.state.get().slide).toBe(2);
  });

  test("play from a slide goes there first; silent slides dwell (or skip)", async () => {
    const dwells: number[] = [];
    const { n, deck, voice } = narrator([{ notesText: "a" }, { text: "no notes" }, { notesText: "c" }], [0, 0, 0], {
      silent: 5,
      setTimer: (fn, ms) => {
        dwells.push(ms);
        return setTimeout(fn, 0);
      },
      clearTimer: (h) => clearTimeout(h as never),
    });
    await n.play(1);
    expect(deck.nav.index).toBe(1);
    await until(() => voice.said.length === 1);
    expect(voice.said).toEqual(["c"]);
    expect(dwells).toContain(5);
  });

  test("notes with more steps than the slide: the last step says the rest, clip by clip", async () => {
    const { n, voice } = narrator([{ notesText: "a [click] b [click] c" }], [1]);
    await n.play();
    await until(() => voice.said.length === 1);
    voice.finish();
    await until(() => voice.said.length === 2);
    voice.finish();
    await until(() => voice.said.length === 3);
    expect(voice.said).toEqual(["a", "b", "c"]);
  });

  test("follow off reads on without moving the deck", async () => {
    const { n, deck, voice } = narrator([{ notesText: "a [click] b" }, { notesText: "c" }], [1, 0]);
    n.setFollow(false);
    await n.play();
    await until(() => voice.said.length === 1);
    voice.finish();
    await until(() => voice.said.length === 2);
    voice.finish();
    await until(() => voice.said.length === 3);
    expect(voice.said).toEqual(["a", "b", "c"]);
    expect(deck.nav).toEqual({ index: 0, click: 0 });
    expect(n.state.get().slide).toBe(1);
  });

  test("next / prev skip a step; rate and volume land in the state", async () => {
    const { n, deck, voice } = narrator([{ notesText: "a [click] b [click] c" }], [2]);
    await n.play();
    await until(() => voice.said.length === 1);
    await n.next();
    await until(() => voice.said.length === 2);
    expect(voice.said.at(-1)).toBe("b");
    await n.prev();
    await until(() => voice.said.length === 3);
    expect(voice.said.at(-1)).toBe("a");
    expect(deck.nav.click).toBe(0);
    n.setRate(1.5);
    await until(() => voice.said.length === 4); // restarted at the new rate
    expect(n.state.get().rate).toBe(1.5);
    n.setVolume(0.4, true);
    expect(n.state.get()).toMatchObject({ volume: 0.4, muted: true });
    n.stop();
    expect(n.state.get()).toMatchObject({ playing: false, phase: "idle" });
  });

  test("an engine that fails pauses with the reason", async () => {
    const { n } = narrator([{ notesText: "a" }], [0], {
      engineFor: async () => {
        throw new Error("no voice");
      },
    });
    await n.play();
    await until(() => n.state.get().error !== null);
    expect(n.state.get()).toMatchObject({ playing: false, error: "no voice" });
  });

  test("the silent engine takes as long as the estimate", async () => {
    const e = silentEngine(() => 5);
    const u = e.speak("hello", { voice: "v", browserVoice: null, rate: 1, volume: 1, muted: false });
    expect(await u.done).toBe("ended");
    const v = e.speak("hello", { voice: "v", browserVoice: null, rate: 1, volume: 1, muted: false });
    v.cancel();
    expect(await v.done).toBe("cancelled");
  });
});

describe("kadal-deck narrate", () => {
  test("encodes 16-bit mono WAV", async () => {
    const { encodeWav } = await import("./wav.ts");
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 24_000);
    const v = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(24_000);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32768]);
  });

  test("lists the texts the deck will ask for: includes, say:, hidden and silent slides", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { deckSegments } = await import("../cli/narrate.ts");
    const dir = mkdtempSync(join(tmpdir(), "narrate-"));
    writeFileSync(
      join(dir, "deck.mdx"),
      [
        "---\ntitle: T\n---\n\n# One\n\n<Notes>\nHello **there**. [click] Next [link](https://a.b).\n</Notes>",
        "---\nhide: true\n---\n\n# Hidden\n\n<Notes>Never said.</Notes>",
        "---\nsay: Custom words.\n---\n\n# Two",
        "---\nnarration: false\n---\n\n# Quiet\n\n<Notes>Not this.</Notes>",
        "---\nsrc: ./more.mdx\n---\n",
      ].join("\n\n---\n"),
    );
    writeFileSync(join(dir, "more.mdx"), "# Three\n\n<Notes>Included. [click] Hello there.</Notes>\n");
    const { texts } = deckSegments(join(dir, "deck.mdx"));
    expect(texts).toEqual(["Hello there.", "Next link.", "Custom words.", "Included."]);
  });

  test("without kokoro-js it says how to get it (exit 4)", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { main } = await import("../cli/index.ts");
    const dir = mkdtempSync(join(tmpdir(), "narrate-"));
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "deck.mdx"), "# One\n\n<Notes>Say this.</Notes>\n");
    const errors: string[] = [];
    const original = { log: console.log, error: console.error };
    console.log = console.error = (...a: unknown[]) => void errors.push(a.join(" "));
    try {
      expect(await main(["narrate", "--json"], dir)).toBe(4);
    } finally {
      Object.assign(console, original);
    }
    expect(errors.join("\n")).toContain("kadal-deck narrate --setup");
  });
});
