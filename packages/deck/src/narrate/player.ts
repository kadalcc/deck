import type { CommandResult } from "../core/commands.ts";
import { createStore, type Store } from "../core/store.ts";
import type { EngineChoice, EngineId, KokoroStatus, SpeakOptions, Utterance } from "./engine.ts";
import type { Engine } from "./engine.ts";
import {
  type NarratableSlide,
  type SilentPolicy,
  segmentPartIndexes,
  segmentPartsAt,
  silentMs,
  slideSegments,
} from "./text.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NARRATOR — autoplay rehearsal
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Says the notes of the step on screen, waits `gap`, turns the page with `nav.next` (one click or
 * one slide, exactly what a person pressing Space gets), and says the next. It drives the deck
 * only through commands, so the presenter window, the projector and the room follow as they
 * would follow a person. Nothing here touches the DOM: the engines and the deck come in through
 * `NarratorHost`, which the tests fake.
 *
 *   follow on   the narrator turns the pages (the default)
 *   follow off  it reads on by itself and leaves the deck where it is
 *
 * Pausing stops the voice at once; play says the current step again from its start. Navigating by
 * hand while it plays jumps the narration to wherever the deck went.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Phase = "idle" | "loading" | "speaking" | "gap" | "dwell" | "paused" | "ended";

export interface NarrationState {
  playing: boolean;
  phase: Phase;
  /** The flat slide index and click step being narrated. */
  slide: number;
  segment: number;
  /**
   * The segment (index among the slide's segments) being said, or last said, on this step; -1
   * before the step has said anything. On a slide's last step several segments are said in turn,
   * so the click alone does not say where in the notes the voice is.
   */
  part: number;
  rate: number;
  volume: number;
  muted: boolean;
  /** Kokoro / baked voice id. */
  voice: string;
  /** The browser engine's voice name; null = the system's default. */
  browserVoice: string | null;
  /** The configured choice, and the engine that said (or is saying) the current segment. */
  engine: EngineChoice;
  using: EngineId | null;
  kokoro: KokoroStatus;
  follow: boolean;
  /** When the current segment (or wait) began, and how long it is expected to last. */
  startedAt: number;
  expectedMs: number;
  error: string | null;
}

export interface Position {
  index: number;
  click: number;
  /** The slide's click steps; null until the slide has mounted and counted them. */
  clicks: number | null;
}

export interface NarratorHost {
  /** Every visible slide, in flat order. */
  slides: NarratableSlide[];
  /** Where the deck is. */
  where(): Position;
  /** Run a deck command (`nav.next`, `nav.goto`…). */
  run(id: string, params?: unknown): Promise<CommandResult>;
  /** Called whenever the deck moves, by anyone. Returns the unsubscribe. */
  onMove(listener: () => void): () => void;
  /** The engine to say this text with now (and the host may start Kokoro loading). */
  engineFor(text: string, state: NarrationState): Promise<Engine>;
  /** An estimate of how long `text` takes, for the progress bar. */
  estimate(text: string, rate: number): number;
  gap: number;
  silent: SilentPolicy;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface NarratorOptions {
  voice: string;
  rate: number;
  engine: EngineChoice;
  volume?: number;
  muted?: boolean;
  browserVoice?: string | null;
  follow?: boolean;
}

export const RATES = [0.8, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export class Narrator {
  readonly state: Store<NarrationState>;
  private readonly host: NarratorHost;
  private readonly segments: string[][];
  /** Bumped by every interruption; a continuation holding an older token stops. */
  private token = 0;
  private utterance: Utterance | null = null;
  private timer: unknown = null;
  /**
   * Set while the narrator's own command is moving the deck: the next move the deck reports is
   * that one, not a person's jump. A view-transition applies a move a frame later, so this is
   * a "the next move is mine" latch rather than a flag around the call.
   */
  private expecting: (() => void) | null = null;
  private off: (() => void) | null = null;

  constructor(host: NarratorHost, options: NarratorOptions) {
    this.host = host;
    this.segments = host.slides.map(slideSegments);
    const at = host.where();
    this.state = createStore<NarrationState>({
      playing: false,
      phase: "idle",
      slide: at.index,
      segment: at.click,
      part: -1,
      rate: options.rate,
      volume: options.volume ?? 1,
      muted: options.muted ?? false,
      voice: options.voice,
      browserVoice: options.browserVoice ?? null,
      engine: options.engine,
      using: null,
      kokoro: { state: "unavailable", progress: 0, device: null, error: null },
      follow: options.follow ?? true,
      startedAt: 0,
      expectedMs: 0,
      error: null,
    });
    this.attach();
  }

  /** Listen to the deck (done by the constructor; again after `detach`). */
  attach(): () => void {
    this.off ??= this.host.onMove(() => this.deckMoved());
    return () => this.detach();
  }

  /** Stop and let go of the deck. */
  detach(): void {
    this.interrupt();
    this.off?.();
    this.off = null;
    if (this.state.get().playing) this.set({ playing: false, phase: "paused" });
  }

  private get now() {
    return this.host.now?.() ?? Date.now();
  }
  private set(patch: Partial<NarrationState>) {
    // A new step has said nothing yet — and while it gets ready (its click count, its voice) it is
    // loading, not still in the last step's gap: a stale, finished gap read against the new step
    // put the timeline at that step's end, and the bar then held there until the step caught up.
    const moved = ("slide" in patch || "segment" in patch) && !("part" in patch);
    this.state.update((s) => {
      const busy = s.phase === "gap" || s.phase === "speaking" || s.phase === "dwell";
      const ready =
        moved && busy && !("phase" in patch)
          ? { phase: "loading" as const, startedAt: this.now, expectedMs: 0 }
          : {};
      return { ...s, ...patch, ...(moved ? { part: -1 } : {}), ...ready };
    });
  }

  /** The segments of a slide, as spoken. */
  segmentsOf(index: number): string[] {
    return this.segments[index] ?? [];
  }

  /** Start (or resume) narrating — from the start of slide `from` when given. */
  async play(from?: number): Promise<void> {
    this.interrupt();
    if (from !== undefined) {
      const index = clamp(Math.round(from), 0, Math.max(0, this.host.slides.length - 1));
      if (this.state.get().follow) await this.move("nav.goto", { index });
      else this.set({ slide: index, segment: 0 });
    } else if (this.state.get().phase === "ended") {
      // Play after the end starts over.
      if (this.state.get().follow) await this.move("nav.first");
      else this.set({ slide: 0, segment: 0 });
    }
    this.set({ playing: true, error: null });
    void this.sayHere();
  }

  /**
   * Go to the start of slide `index` and leave playing alone: playing plays on from there; idle or
   * paused waits there, and play starts from there. Only play and pause start and stop the voice;
   * the timeline used to play from wherever it was clicked, so looking around while paused talked.
   */
  async seek(index: number): Promise<void> {
    const to = clamp(Math.round(index), 0, Math.max(0, this.host.slides.length - 1));
    const playing = this.state.get().playing;
    if (playing) this.interrupt();
    if (this.state.get().follow) {
      const at = this.host.where();
      // Already there: a goto that moves nothing would wait out move()'s transition grace.
      if (at.index !== to || at.click !== 0) await this.move("nav.goto", { index: to });
      this.syncToDeck();
    } else this.set({ slide: to, segment: 0 });
    // The end is behind us now: play goes on from here rather than starting the talk over.
    if (this.state.get().phase === "ended") this.set({ phase: "idle" });
    if (playing && this.state.get().playing) void this.sayHere();
  }

  pause(): void {
    this.interrupt();
    if (this.state.get().playing || this.state.get().phase !== "idle")
      this.set({ playing: false, phase: "paused" });
  }

  toggle(): Promise<void> | void {
    return this.state.get().playing ? this.pause() : this.play();
  }

  /** Stop, and forget the place: the next play starts where the deck is. */
  stop(): void {
    this.interrupt();
    const at = this.host.where();
    this.set({
      playing: false,
      phase: "idle",
      slide: at.index,
      segment: at.click,
      using: null,
      startedAt: 0,
      expectedMs: 0,
    });
  }

  /** On to the next step now, without waiting for this one to finish. */
  async next(): Promise<void> {
    this.interrupt();
    await this.advance();
  }

  /** Back one step. */
  async prev(): Promise<void> {
    this.interrupt();
    const s = this.state.get();
    if (s.follow) {
      await this.move("nav.prev");
      this.syncToDeck();
    } else if (s.segment > 0) this.set({ segment: s.segment - 1 });
    else if (s.slide > 0) this.set({ slide: s.slide - 1, segment: 0 });
    if (this.state.get().playing) void this.sayHere();
  }

  setRate(rate: number): void {
    const r = clamp(rate, 0.5, 3);
    this.set({ rate: r });
    if (this.utterance?.setRate) this.utterance.setRate(r);
    else this.restartIfSpeaking();
  }

  setVolume(volume: number, muted?: boolean): void {
    this.set({ volume: clamp(volume, 0, 1), ...(muted === undefined ? {} : { muted }) });
  }

  setVoice(voice: string, browser = false): void {
    this.set(browser ? { browserVoice: voice || null } : { voice });
    this.restartIfSpeaking();
  }

  setEngine(engine: EngineChoice): void {
    this.set({ engine });
    this.restartIfSpeaking();
  }

  setFollow(follow: boolean): void {
    this.set({ follow });
    // Turning follow back on brings the deck to the narrator.
    if (follow && this.state.get().playing) {
      const s = this.state.get();
      const at = this.host.where();
      if (at.index !== s.slide || at.click !== s.segment) {
        this.interrupt();
        void this.move("nav.goto", { index: s.slide, click: s.segment }).then(() => this.sayHere());
      }
    }
  }

  setKokoro(kokoro: KokoroStatus): void {
    this.set({ kokoro });
  }

  /** The options an engine needs now. */
  speakOptions(): SpeakOptions {
    const s = this.state.get();
    return {
      voice: s.voice,
      browserVoice: s.browserVoice,
      rate: s.rate,
      volume: s.volume,
      muted: s.muted,
    };
  }

  destroy(): void {
    this.detach();
  }

  // ── the loop ───────────────────────────────────────────────────────────────

  private interrupt() {
    this.token++;
    this.unschedule(this.timer);
    this.timer = null;
    const u = this.utterance;
    this.utterance = null;
    u?.cancel();
  }

  private restartIfSpeaking() {
    if (!this.state.get().playing) return;
    this.interrupt();
    void this.sayHere();
  }

  private wait(ms: number, token: number): Promise<boolean> {
    if (ms <= 0) return Promise.resolve(token === this.token);
    return new Promise((resolve) => {
      this.timer = this.schedule(() => {
        this.timer = null;
        resolve(token === this.token);
      }, ms);
    });
  }

  private async move(id: string, params: unknown = {}): Promise<CommandResult> {
    const before = this.host.where();
    let landed: () => void = () => {};
    const arrived = new Promise<void>((resolve) => (landed = resolve));
    this.expecting = landed;
    const res = await this.host.run(id, params);
    const after = this.host.where();
    // deckMoved() clears the latch when the move lands (during run(), for an ordinary move).
    const stillWaiting = (this.expecting as (() => void) | null) !== null;
    if (res.ok && stillWaiting && after.index === before.index && after.click === before.click) {
      // Not moved yet: a transition may still be applying it. Wait for it, briefly.
      let handle: unknown = null;
      await Promise.race([
        arrived,
        new Promise<void>((resolve) => {
          handle = this.schedule(resolve, 1200);
        }),
      ]);
      this.unschedule(handle);
    }
    this.expecting = null;
    return res;
  }

  private schedule(fn: () => void, ms: number): unknown {
    return (this.host.setTimer ?? ((f: () => void, t: number) => setTimeout(f, t)))(fn, ms);
  }
  private unschedule(handle: unknown) {
    if (handle !== null) (this.host.clearTimer ?? clearTimeout)(handle as never);
  }

  /** Until the slide on screen has counted its clicks (at most ~2 s), so the right words are said. */
  private async counted(token: number): Promise<boolean> {
    for (let i = 0; i < 40 && this.host.where().clicks === null; i++) {
      await new Promise<void>((resolve) => this.schedule(resolve, 50));
      if (token !== this.token) return false;
    }
    return token === this.token;
  }

  private syncToDeck() {
    const at = this.host.where();
    this.set({ slide: at.index, segment: at.click });
  }

  private deckMoved() {
    const ours = this.expecting;
    if (ours) {
      this.expecting = null;
      ours();
      return;
    }
    const s = this.state.get();
    const at = this.host.where();
    if (at.index === s.slide && at.click === s.segment) return;
    if (!s.follow && s.playing) return;
    this.set({ slide: at.index, segment: at.click });
    if (s.playing) {
      this.interrupt();
      void this.sayHere();
    }
  }

  /** Clicks of the slide being narrated: the deck's count when it is that slide, else the notes'. */
  private clicksOf(index: number): number {
    const at = this.host.where();
    if (this.state.get().follow && at.index === index && at.clicks !== null) return at.clicks;
    return Math.max(0, this.segmentsOf(index).length - 1);
  }

  /** What to say at a step: usually one segment, none for a silent step, the rest on the last. */
  partsAt(index: number, click: number): string[] {
    return segmentPartsAt(this.segmentsOf(index), click, this.clicksOf(index));
  }

  private async sayHere(): Promise<void> {
    const token = ++this.token;
    const s0 = this.state.get();
    if (s0.follow) {
      if (!(await this.counted(token))) return;
      this.syncToDeck();
    }
    const { slide, segment } = this.state.get();
    const segs = this.segmentsOf(slide);
    const parts = this.partsAt(slide, segment);
    const which = segmentPartIndexes(segs, segment, this.clicksOf(slide));
    if (!parts.length) {
      // A silent slide dwells (once, on its first step); a silent step just pauses for the gap.
      const ms =
        !segs.length && segment === 0
          ? silentMs(this.host.silent, this.host.slides[slide]?.text, s0.rate)
          : this.host.gap;
      this.set({ phase: "dwell", using: null, startedAt: this.now, expectedMs: ms });
      if (!(await this.wait(ms, token))) return;
      return this.advance(token);
    }
    for (let i = 0; i < parts.length; i++) {
      const text = parts[i]!;
      this.set({
        phase: "loading",
        part: which[i] ?? segment,
        startedAt: this.now,
        expectedMs: this.host.estimate(text, s0.rate),
      });
      let engine: Engine;
      try {
        engine = await this.host.engineFor(text, this.state.get());
      } catch (err) {
        return this.fail(err, token);
      }
      if (token !== this.token) return;
      const options = this.speakOptions();
      const u = engine.speak(text, options);
      this.utterance = u;
      this.set({
        phase: "speaking",
        using: engine.id,
        startedAt: this.now,
        expectedMs: this.host.estimate(text, options.rate),
      });
      // While this plays, the next clip gets made.
      const ahead = parts[i + 1] ?? this.lookAhead();
      if (ahead && engine.prepare) engine.prepare(ahead, options);
      let result: "ended" | "cancelled";
      try {
        result = await u.done;
      } catch (err) {
        return this.fail(err, token);
      }
      if (token !== this.token || result === "cancelled") return;
      this.utterance = null;
    }
    this.set({ phase: "gap", startedAt: this.now, expectedMs: this.host.gap });
    if (!(await this.wait(this.host.gap, token))) return;
    return this.advance(token);
  }

  private fail(err: unknown, token: number) {
    if (token !== this.token) return;
    this.utterance = null;
    this.set({
      playing: false,
      phase: "paused",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  /** The text of the step after the current one, for prefetching. */
  private lookAhead(): string {
    const { slide, segment } = this.state.get();
    const clicks = this.clicksOf(slide);
    if (segment < clicks) return this.partsAt(slide, segment + 1)[0] ?? "";
    for (let i = slide + 1; i < this.host.slides.length && i < slide + 3; i++) {
      const t = this.partsAt(i, 0)[0];
      if (t) return t;
    }
    return "";
  }

  private async advance(token = this.token): Promise<void> {
    const s = this.state.get();
    if (s.follow) {
      const before = this.host.where();
      const res = await this.move("nav.next");
      if (token !== this.token) return;
      const after = this.host.where();
      if (!res.ok || (after.index === before.index && after.click === before.click))
        return this.finish();
      this.set({ slide: after.index, segment: after.click });
    } else {
      const clicks = this.clicksOf(s.slide);
      if (s.segment < clicks) this.set({ segment: s.segment + 1 });
      else if (s.slide + 1 < this.host.slides.length) this.set({ slide: s.slide + 1, segment: 0 });
      else return this.finish();
    }
    if (this.state.get().playing) void this.sayHere();
  }

  private finish() {
    this.utterance = null;
    this.set({ playing: false, phase: "ended", using: null });
  }
}
