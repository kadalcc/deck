import type { NarrationConfig } from "../core/model.ts";
import { createStore, type Store } from "../core/store.ts";
import { type BakedClip, EMPTY_INDEX, lookup, type NarrationIndex, parseIndex } from "./baked.ts";
import type { Engine, KokoroStatus, SpeakOptions, Utterance } from "./engine.ts";
import type { KokoroRequest, KokoroResponse } from "./kokoro-protocol.ts";

/** The browser engines: the DOM half of engine.ts. */

const gainOf = (o: Pick<SpeakOptions, "volume" | "muted">) => (o.muted ? 0 : o.volume);

// ── browser: speechSynthesis ──────────────────────────────────────────────

export const hasSpeechSynthesis = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** The system's voices; they arrive late in Chrome, so this waits briefly for them. */
export function browserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!hasSpeechSynthesis()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 1500);
  });
}

/**
 * Sentences, packed up to ~220 characters: Chrome stops a long utterance after about 15 seconds,
 * and a short one is quicker to cancel.
 */
export function chunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function browserEngine(estimate: (text: string, rate: number) => number): Engine {
  return {
    id: "browser",
    speak(text, o): Utterance {
      let cancelled = false;
      let settle: (v: "ended" | "cancelled") => void = () => {};
      let fail: (e: Error) => void = () => {};
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const done = new Promise<"ended" | "cancelled">((resolve, reject) => {
        settle = resolve;
        fail = reject;
      });
      const parts = chunks(text);
      void browserVoices().then((voices) => {
        const voice = o.browserVoice ? voices.find((v) => v.name === o.browserVoice) : undefined;
        const sayPart = (i: number) => {
          if (cancelled) return;
          if (i >= parts.length) return settle("ended");
          const u = new SpeechSynthesisUtterance(parts[i]!);
          u.rate = Math.min(10, Math.max(0.1, o.rate));
          u.volume = gainOf(o);
          if (voice) u.voice = voice;
          let over = false;
          const next = () => {
            if (over) return;
            over = true;
            if (watchdog) clearTimeout(watchdog);
            sayPart(i + 1);
          };
          u.onend = next;
          u.onerror = (e) => {
            if (over) return;
            over = true;
            if (watchdog) clearTimeout(watchdog);
            if (cancelled || e.error === "interrupted" || e.error === "canceled") settle("cancelled");
            else fail(new Error(`The browser's voice failed (${e.error}).`));
          };
          // Some systems never say "end" (no voices installed, a stalled engine): move on anyway.
          watchdog = setTimeout(next, estimate(parts[i]!, o.rate) * 2 + 4000);
          speechSynthesis.speak(u);
        };
        speechSynthesis.cancel();
        sayPart(0);
      });
      return {
        done,
        cancel() {
          cancelled = true;
          if (watchdog) clearTimeout(watchdog);
          if (hasSpeechSynthesis()) speechSynthesis.cancel();
          settle("cancelled");
        },
      };
    },
  };
}

// ── shared <audio> playback ───────────────────────────────────────────────

function playElement(audio: HTMLAudioElement, o: SpeakOptions): Utterance {
  let settle: (v: "ended" | "cancelled") => void = () => {};
  let fail: (e: Error) => void = () => {};
  const done = new Promise<"ended" | "cancelled">((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  audio.playbackRate = o.rate;
  audio.preservesPitch = true;
  audio.volume = gainOf(o);
  audio.onended = () => settle("ended");
  audio.onerror = () => fail(new Error(`Could not play ${audio.src}`));
  audio.currentTime = 0;
  audio.play().catch((err: unknown) => fail(err instanceof Error ? err : new Error(String(err))));
  return {
    done,
    cancel() {
      audio.pause();
      settle("cancelled");
    },
    setRate(rate) {
      audio.playbackRate = rate;
    },
    position: () => audio.currentTime * 1000,
  };
}

// ── baked: narration.json + files ─────────────────────────────────────────

export class BakedClips {
  private index: NarrationIndex | null = null;
  private loading: Promise<NarrationIndex> | null = null;
  private readonly elements = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;
  constructor(private readonly base: string) {}

  /** Fetch narration.json once; a deck without one simply has no baked clips. */
  load(): Promise<NarrationIndex> {
    this.loading ??= fetch(`${this.base}narration.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((raw) => (this.index = raw ? parseIndex(raw) : EMPTY_INDEX));
    return this.loading;
  }
  /** Synchronous lookup, once loaded. */
  get(voice: string, text: string): BakedClip | null {
    return this.index ? lookup(this.index, voice, text) : null;
  }

  private element(clip: BakedClip): HTMLAudioElement {
    const url = `${this.base}${clip.src}`;
    let a = this.elements.get(url);
    if (!a) {
      a = new Audio();
      a.preload = "auto";
      a.src = url;
      this.elements.set(url, a);
      // A handful of neighbours is plenty.
      if (this.elements.size > 8) this.elements.delete(this.elements.keys().next().value!);
    }
    return a;
  }

  engine(): Engine {
    return {
      id: "baked",
      speak: (text, o) => {
        const clip = this.get(o.voice, text);
        if (!clip) {
          return { done: Promise.reject(new Error("No baked clip for this text.")), cancel() {} };
        }
        const a = this.element(clip);
        this.current = a;
        return playElement(a, o);
      },
      prepare: (text, o) => {
        const clip = this.get(o.voice, text);
        if (clip) this.element(clip).load();
      },
      setVolume: (volume, muted) => {
        if (this.current) this.current.volume = muted ? 0 : volume;
      },
    };
  }
}

// ── kokoro: the worker, WebAudio playback ─────────────────────────────────

interface Clip {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * The deck's side of the Kokoro worker. Nothing is fetched until `load()` — the first press of
 * play — and the worker module itself is a separate chunk the deck's bundle only references.
 */
export class KokoroClient {
  readonly status: Store<KokoroStatus>;
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve: (c: Clip) => void; reject: (e: Error) => void }>();
  /** voice|speed|text → the clip, made or being made. */
  private readonly clips = new Map<string, Promise<Clip>>();
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;

  constructor(
    private readonly loader: (() => Promise<{ createWorker: () => Worker }>) | null | undefined,
    private readonly options: Pick<NarrationConfig, "model" | "dtype">,
  ) {
    this.status = createStore<KokoroStatus>({
      state: loader ? "idle" : "unavailable",
      progress: 0,
      device: null,
      error: null,
    });
  }

  private patch(p: Partial<KokoroStatus>) {
    this.status.update((s) => ({ ...s, ...p }));
  }

  /** Start downloading the model (once). */
  load(): void {
    if (!this.loader || this.status.get().state !== "idle") return;
    this.patch({ state: "loading", progress: 0, error: null });
    this.loader()
      .then(({ createWorker }) => {
        const w = createWorker();
        this.worker = w;
        w.onmessage = (e: MessageEvent<KokoroResponse>) => this.onMessage(e.data);
        w.onerror = (e) => this.broken(e.message || "The voice worker failed to start.");
        const msg: KokoroRequest = {
          type: "load",
          model: this.options.model,
          dtype: this.options.dtype,
          device: "auto",
        };
        w.postMessage(msg);
      })
      .catch((err: unknown) => this.broken(err instanceof Error ? err.message : String(err)));
  }

  private broken(message: string) {
    this.patch({ state: "error", error: message });
    for (const w of this.waiting.values()) w.reject(new Error(message));
    this.waiting.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private onMessage(m: KokoroResponse) {
    if (m.type === "progress") this.patch({ progress: m.progress });
    else if (m.type === "ready") this.patch({ state: "ready", progress: 1, device: m.device });
    else if (m.type === "audio") {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      w?.resolve({ samples: m.samples, sampleRate: m.sampleRate });
    } else if (m.type === "error") {
      if (m.id === undefined) this.broken(m.message);
      else {
        const w = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        w?.reject(new Error(m.message));
      }
    }
  }

  private clip(text: string, voice: string, speed: number): Promise<Clip> {
    const key = `${voice}|${speed}|${text}`;
    const have = this.clips.get(key);
    if (have) return have;
    const made = new Promise<Clip>((resolve, reject) => {
      if (!this.worker) return reject(new Error("Kokoro is not loaded."));
      const id = this.nextId++;
      this.waiting.set(id, { resolve, reject });
      const msg: KokoroRequest = { type: "generate", id, text, voice, speed };
      this.worker.postMessage(msg);
    });
    made.catch(() => this.clips.delete(key));
    this.clips.set(key, made);
    while (this.clips.size > 16) this.clips.delete(this.clips.keys().next().value!);
    return made;
  }

  private audio(o: SpeakOptions) {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    this.gain!.gain.value = gainOf(o);
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return { ctx: this.ctx, gain: this.gain! };
  }

  engine(): Engine {
    return {
      id: "kokoro",
      speak: (text, o) => {
        let cancelled = false;
        let source: AudioBufferSourceNode | null = null;
        let startedAt = 0;
        let settle: (v: "ended" | "cancelled") => void = () => {};
        const done = new Promise<"ended" | "cancelled">((resolve, reject) => {
          settle = resolve;
          // Speed is Kokoro's own `speed`, so a faster talk is faster speech, not a chipmunk.
          this.clip(text, o.voice, o.rate).then((c) => {
            if (cancelled) return;
            const { ctx, gain } = this.audio(o);
            const buffer = ctx.createBuffer(1, c.samples.length, c.sampleRate);
            buffer.copyToChannel(c.samples as Float32Array<ArrayBuffer>, 0);
            source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(gain);
            source.onended = () => resolve("ended");
            startedAt = ctx.currentTime;
            source.start();
          }, reject);
        });
        return {
          done,
          cancel() {
            cancelled = true;
            try {
              source?.stop();
            } catch {
              // Not started yet.
            }
            settle("cancelled");
          },
          position: () => (this.ctx && source ? (this.ctx.currentTime - startedAt) * 1000 : 0),
        };
      },
      prepare: (text, o) => {
        if (this.status.get().state === "ready") void this.clip(text, o.voice, o.rate).catch(() => {});
      },
      setVolume: (volume, muted) => {
        if (this.gain) this.gain.gain.value = muted ? 0 : volume;
      },
    };
  }

  /** Let go of the worker and the audio; a later `load()` starts afresh. */
  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
    this.clips.clear();
    for (const w of this.waiting.values()) w.reject(new Error("Narration closed."));
    this.waiting.clear();
    if (this.loader) this.status.set({ state: "idle", progress: 0, device: null, error: null });
  }
}
