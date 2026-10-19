/**
 * Kokoro-82M in a Web Worker, so synthesis never blocks the slides. The deck's Vite build bundles
 * this file as a worker only when the deck has `kokoro-js` installed (see `virtual:deck/kokoro` in
 * vite/index.ts); the weights come from the Hugging Face Hub at the first play and are kept in the
 * browser's Cache Storage by transformers.js, so the second visit starts at once.
 *
 *   → { type: "load", model, dtype, device }        ← progress… then ready | error
 *   → { type: "generate", id, text, voice, speed }  ← audio (Float32 PCM, transferred) | error
 */
import { KokoroTTS } from "kokoro-js";

import type { KokoroRequest, KokoroResponse } from "./kokoro-protocol.ts";

type Device = "webgpu" | "wasm";
type Dtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
interface Tts {
  generate(
    text: string,
    options: { voice: string; speed: number },
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

const scope = self as unknown as {
  postMessage(message: KokoroResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<KokoroRequest>) => void) | null;
  navigator: { gpu?: unknown };
};
const post = (m: KokoroResponse, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

let tts: Promise<Tts> | null = null;
/** One synthesis at a time: the model is one session. */
let queue: Promise<unknown> = Promise.resolve();

async function load(model: string, dtype: Dtype | "auto", device: Device | "auto"): Promise<Tts> {
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (!p.file || (p.status !== "progress" && p.status !== "done" && p.status !== "initiate")) return;
    const f = files.get(p.file) ?? { loaded: 0, total: 0 };
    if (typeof p.total === "number" && p.total > 0) f.total = p.total;
    if (typeof p.loaded === "number") f.loaded = p.loaded;
    if (p.status === "done") f.loaded = f.total;
    files.set(p.file, f);
    let loaded = 0;
    let total = 0;
    for (const v of files.values()) {
      loaded += v.loaded;
      total += v.total;
    }
    post({ type: "progress", progress: total ? loaded / total : 0, file: p.file });
  };
  const gpu = device === "webgpu" || (device === "auto" && !!scope.navigator.gpu);
  const attempts: Array<{ device: Device; dtype: Dtype }> = gpu
    ? [
        { device: "webgpu", dtype: dtype === "auto" ? "fp32" : dtype },
        { device: "wasm", dtype: dtype === "auto" ? "q8" : dtype },
      ]
    : [{ device: "wasm", dtype: dtype === "auto" ? "q8" : dtype }];
  let last: unknown = null;
  for (const a of attempts) {
    try {
      const model_ = (await KokoroTTS.from_pretrained(model, {
        dtype: a.dtype,
        device: a.device,
        progress_callback,
      })) as unknown as Tts;
      post({ type: "ready", device: a.device, dtype: a.dtype });
      return model_;
    } catch (err) {
      // A GPU that announces WebGPU but cannot run the graph falls back to WebAssembly.
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") {
    tts ??= load(m.model, m.dtype, m.device);
    tts.catch((err: unknown) => {
      tts = null;
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  if (m.type === "generate") {
    queue = queue.then(async () => {
      try {
        if (!tts) throw new Error("Kokoro is not loaded");
        const model = await tts;
        const out = await model.generate(m.text, { voice: m.voice, speed: m.speed });
        const samples = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
        post({ type: "audio", id: m.id, samples, sampleRate: out.sampling_rate }, [samples.buffer]);
      } catch (err) {
        post({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
      }
    });
  }
};
