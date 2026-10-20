/**
 * The narrator's voices behind one interface. An engine says one piece of text and reports when
 * it has finished; everything else — what to say next, when to turn the page — is the player's.
 *
 *   baked    pre-rendered files from `kadal-deck narrate` (`narration.json`), an <audio> element
 *   kokoro   Kokoro-82M in a Web Worker (kokoro-js), downloaded on first use, played by WebAudio
 *   browser  the browser's own speechSynthesis: instant, no download, varies by system
 *   silent   says nothing, takes as long as saying it would: pacing without sound
 */
export type EngineId = "baked" | "kokoro" | "browser" | "silent";
/** `narration.engine`: one engine, or "auto" — baked when a clip exists, else Kokoro once it is ready, else the browser. */
export type EngineChoice = "auto" | EngineId;

export const ENGINE_CHOICES: EngineChoice[] = ["auto", "baked", "kokoro", "browser", "silent"];

export interface SpeakOptions {
  /** A Kokoro voice id (`af_heart`), which is also what baked clips are keyed by. */
  voice: string;
  /** The browser engine's voice, by name; null for the system default. */
  browserVoice: string | null;
  rate: number;
  volume: number;
  muted: boolean;
}

/** One piece of speech in flight. */
export interface Utterance {
  /** Resolves when it ends by itself, or is cancelled; rejects when it cannot be said at all. */
  done: Promise<"ended" | "cancelled">;
  cancel(): void;
  /** Change the speed while it plays, where the engine can (an <audio> element can). */
  setRate?(rate: number): void;
  /** Milliseconds said so far, where the engine knows. */
  position?(): number;
}

export interface Engine {
  id: EngineId;
  speak(text: string, options: SpeakOptions): Utterance;
  /** Get this text ready to say (synthesize it, fetch its file) while something else is said. */
  prepare?(text: string, options: SpeakOptions): void;
  /** Volume and mute, live, for whatever is playing. */
  setVolume?(volume: number, muted: boolean): void;
}

/** Download / readiness of the Kokoro model, for the bar's status line. */
export interface KokoroStatus {
  state: "unavailable" | "idle" | "loading" | "ready" | "error";
  /** 0–1 while loading. */
  progress: number;
  device: "webgpu" | "wasm" | null;
  error: string | null;
}

/** What "auto" picks for one segment, given what is available right now. */
export function chooseEngine(
  choice: EngineChoice,
  have: { baked: boolean; kokoro: KokoroStatus["state"]; browser: boolean },
): { engine: EngineId; loadKokoro: boolean } {
  const kokoroUsable = have.kokoro !== "unavailable" && have.kokoro !== "error";
  const fallback: EngineId = have.browser ? "browser" : "silent";
  switch (choice) {
    case "baked":
      return { engine: have.baked ? "baked" : fallback, loadKokoro: false };
    case "browser":
      return { engine: fallback, loadKokoro: false };
    case "silent":
      return { engine: "silent", loadKokoro: false };
    case "kokoro":
      if (have.kokoro === "ready") return { engine: "kokoro", loadKokoro: false };
      return { engine: fallback, loadKokoro: kokoroUsable && have.kokoro === "idle" };
    default:
      if (have.baked) return { engine: "baked", loadKokoro: false };
      if (have.kokoro === "ready") return { engine: "kokoro", loadKokoro: false };
      return { engine: fallback, loadKokoro: kokoroUsable && have.kokoro === "idle" };
  }
}

/**
 * The silent engine: an utterance that lasts as long as `ms(text)` and makes no sound. What
 * rehearsing without speakers sounds like, what the browser check drives, and the last resort
 * where a browser has no speechSynthesis at all.
 */
export function silentEngine(
  ms: (text: string, rate: number) => number,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void } = {
    set: (fn, t) => setTimeout(fn, t),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): Engine {
  return {
    id: "silent",
    speak(text, o) {
      let handle: unknown = null;
      let settle: (v: "ended" | "cancelled") => void = () => {};
      const started = Date.now();
      const done = new Promise<"ended" | "cancelled">((resolve) => {
        settle = resolve;
        handle = timers.set(() => resolve("ended"), ms(text, o.rate));
      });
      return {
        done,
        cancel() {
          timers.clear(handle);
          settle("cancelled");
        },
        position: () => Date.now() - started,
      };
    },
  };
}
