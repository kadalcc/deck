/** The messages between the deck and its Kokoro worker (types only). */
export type KokoroRequest =
  | {
      type: "load";
      model: string;
      dtype: "auto" | "fp32" | "fp16" | "q8" | "q4" | "q4f16";
      device: "auto" | "webgpu" | "wasm";
    }
  | { type: "generate"; id: number; text: string; voice: string; speed: number };

export type KokoroResponse =
  | { type: "progress"; progress: number; file: string }
  | { type: "ready"; device: "webgpu" | "wasm"; dtype: string }
  | { type: "audio"; id: number; samples: Float32Array; sampleRate: number }
  | { type: "error"; id?: number; message: string };

/** Kokoro's voices (kokoro-js 1.2), so the voice menu can list them before the model loads. */
export const KOKORO_VOICES: Array<{ id: string; name: string; lang: "en-us" | "en-gb"; gender: "F" | "M" }> = [
  ["af_heart", "Heart"],
  ["af_alloy", "Alloy"],
  ["af_aoede", "Aoede"],
  ["af_bella", "Bella"],
  ["af_jessica", "Jessica"],
  ["af_kore", "Kore"],
  ["af_nicole", "Nicole"],
  ["af_nova", "Nova"],
  ["af_river", "River"],
  ["af_sarah", "Sarah"],
  ["af_sky", "Sky"],
  ["am_adam", "Adam"],
  ["am_echo", "Echo"],
  ["am_eric", "Eric"],
  ["am_fenrir", "Fenrir"],
  ["am_liam", "Liam"],
  ["am_michael", "Michael"],
  ["am_onyx", "Onyx"],
  ["am_puck", "Puck"],
  ["am_santa", "Santa"],
  ["bf_emma", "Emma"],
  ["bf_isabella", "Isabella"],
  ["bf_alice", "Alice"],
  ["bf_lily", "Lily"],
  ["bm_george", "George"],
  ["bm_lewis", "Lewis"],
  ["bm_daniel", "Daniel"],
  ["bm_fable", "Fable"],
].map(([id, name]) => ({
  id: id!,
  name: name!,
  lang: id!.startsWith("b") ? "en-gb" : "en-us",
  gender: id![1] === "f" ? "F" : "M",
}));

export const isKokoroVoice = (v: string) => KOKORO_VOICES.some((k) => k.id === v);
