/**
 * kokoro-js is an optional peer: the engine builds and typechecks without it installed. The
 * worker uses this much of it; the real package's types are a superset.
 */
declare module "kokoro-js" {
  export class KokoroTTS {
    static from_pretrained(
      model_id: string,
      options?: {
        dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
        device?: "wasm" | "webgpu" | "cpu" | null;
        progress_callback?: (info: Record<string, unknown>) => void;
      },
    ): Promise<KokoroTTS>;
    generate(
      text: string,
      options?: { voice?: string; speed?: number },
    ): Promise<{ audio: Float32Array; sampling_rate: number }>;
  }
}
