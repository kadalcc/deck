/**
 * The speaking half of `kadal-deck narrate`, in a process of its own: onnxruntime-node can abort
 * while the process exits (macOS, "mutex lock failed"), after every clip is safely written. Here
 * that crash costs nothing — the parent has already heard "end" — and the CLI exits cleanly.
 *
 *   node kokoro-child.js <kokoro-js entry> <model> <dtype>
 *   stdin:  JSON [{ key, text, voice, out }]
 *   stdout: one JSON object per line: progress · ready · done { key, ms } · error · end
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { encodeWav } from "../narrate/wav.ts";

interface Job {
  key: string;
  text: string;
  voice: string;
  out: string;
}
const say = (o: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(o)}\n`);

async function main() {
  const [entry, model, dtype] = process.argv.slice(2);
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const jobs = JSON.parse(input) as Job[];
  const mod = (await import(pathToFileURL(entry!).href)) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const KokoroTTS = (mod.KokoroTTS ?? mod.default?.KokoroTTS) as {
    from_pretrained(id: string, o: Record<string, unknown>): Promise<{
      generate(t: string, o: { voice: string; speed: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
    }>;
  };
  if (!KokoroTTS) throw new Error(`${entry} does not export KokoroTTS`);
  const files = new Map<string, { loaded: number; total: number }>();
  const tts = await KokoroTTS.from_pretrained(model!, {
    dtype,
    device: "cpu",
    progress_callback: (p: Record<string, unknown>) => {
      if (p.status !== "progress" || typeof p.file !== "string") return;
      files.set(p.file, { loaded: Number(p.loaded) || 0, total: Number(p.total) || 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      say({ type: "progress", progress: total ? loaded / total : 0 });
    },
  });
  say({ type: "ready" });
  for (const job of jobs) {
    const out = await tts.generate(job.text, { voice: job.voice, speed: 1 });
    const samples = out.audio instanceof Float32Array ? out.audio : Float32Array.from(out.audio);
    await writeFile(job.out, encodeWav(samples, out.sampling_rate));
    say({ type: "done", key: job.key, ms: Math.round((samples.length / out.sampling_rate) * 1000) });
  }
  say({ type: "end" });
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    say({ type: "error", message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  },
);
