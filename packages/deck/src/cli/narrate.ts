import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { splitDeck } from "../compiler/index.ts";
import { plainText } from "../compiler/plain-text.ts";
import {
  DEFAULT_CONFIG,
  DEFAULT_NARRATION,
  type NarrationConfig,
  resolveSlideOptions,
} from "../core/model.ts";
import { type BakedClip, clipKey, type NarrationIndex, parseIndex } from "../narrate/baked.ts";
import { isKokoroVoice } from "../narrate/kokoro-protocol.ts";
import { slideSegments } from "../narrate/text.ts";
import { UsageError } from "./args.ts";
import { detectPackageManager, type PackageManager } from "./new.ts";
import { openProject } from "./project.ts";
import { MissingDependencyError } from "./vite.ts";

/**
 * `kadal-deck narrate` — bake the narration. Every segment of every slide's notes is spoken once by
 * Kokoro-82M (on the CPU, through kokoro-js) into `public/narration/<sha256>.<ext>`, and indexed in
 * `public/narration.json`, which the deck reads to play the files instead of synthesizing. A clip
 * already on disk is skipped, so re-running after editing one slide speaks only what changed.
 *
 * kokoro-js is an optional peer of @kadal/deck — with transformers.js and the ONNX runtime it is
 * hundreds of megabytes — so `--setup` installs it into the deck with the deck's package manager.
 */

export const NARRATE_FLAGS = {
  voice: { kind: "string" },
  dtype: { kind: "string" },
  force: { kind: "boolean" },
  setup: { kind: "boolean" },
} as const;

const DTYPES = ["fp32", "fp16", "q8", "q4", "q4f16"] as const;
type Dtype = (typeof DTYPES)[number];
export const KOKORO_JS = "kokoro-js@^1.2.1";

export interface NarrateResult {
  voice: string;
  dtype: Dtype;
  format: "mp3" | "ogg" | "wav";
  /** Segments in the deck, clips made now, clips already there. */
  segments: number;
  made: number;
  skipped: number;
  bytes: number;
  index: string;
}

/** The deck's package manager, from its lockfile (else whoever is running us). */
export function packageManagerOf(dir: string): PackageManager {
  if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) return "bun";
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "package-lock.json"))) return "npm";
  return detectPackageManager();
}

/** `kadal-deck narrate --setup`: add kokoro-js to the deck. */
export function setupKokoro(dir: string, quiet: boolean): Promise<{ packageManager: PackageManager }> {
  const pm = packageManagerOf(dir);
  const args = pm === "npm" ? ["install", KOKORO_JS] : ["add", KOKORO_JS];
  return new Promise((ok, fail) => {
    const child = spawn(pm, args, {
      cwd: dir,
      stdio: quiet ? ["ignore", process.stderr, process.stderr] : "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? ok({ packageManager: pm }) : fail(new Error(`${pm} ${args.join(" ")} failed (exit ${code})`)),
    );
  });
}

/** Where the deck's kokoro-js is. */
function kokoroEntry(dir: string): string {
  try {
    return createRequire(join(dir, "package.json")).resolve("kokoro-js");
  } catch {
    throw new MissingDependencyError(
      `kokoro-js isn't installed in ${dir}. Run \`kadal-deck narrate --setup\` (it adds ${KOKORO_JS}), then try again.`,
    );
  }
}

type ChildMessage =
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "done"; key: string; ms: number }
  | { type: "error"; message: string }
  | { type: "end" };

/** Speak `jobs` to WAV files in kokoro-child.ts, reporting each as it lands. */
function synthesize(
  entry: string,
  model: string,
  dtype: Dtype,
  jobs: Array<{ key: string; text: string; voice: string; out: string }>,
  on: (m: ChildMessage) => Promise<void> | void,
): Promise<void> {
  const js = fileURLToPath(new URL("./kokoro-child.js", import.meta.url));
  const script = existsSync(js) ? js : fileURLToPath(new URL("./kokoro-child.ts", import.meta.url));
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [script, entry, model, dtype], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Its stderr is the model's chatter, passed on — minus the abort at exit it is there to absorb.
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      const keep = d
        .split("\n")
        .filter((l) => l && !/mutex lock failed|terminating due to uncaught exception/.test(l));
      if (keep.length) process.stderr.write(`${keep.join("\n")}\n`);
    });
    let ended = false;
    let failure: string | null = null;
    let chain = Promise.resolve();
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      buffer += d;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        let m: ChildMessage;
        try {
          m = JSON.parse(line) as ChildMessage;
        } catch {
          continue;
        }
        if (m.type === "end") ended = true;
        if (m.type === "error") failure = m.message;
        chain = chain.then(() => on(m));
      }
    });
    child.on("error", fail);
    // The exit status after "end" is not ours to judge (see kokoro-child.ts).
    child.on("close", (code) =>
      chain.then(() =>
        ended ? ok() : fail(new Error(failure ?? `Kokoro stopped early (exit ${code}).`)),
      ),
    );
    child.stdin.end(JSON.stringify(jobs));
  });
}

/** The best encoder this machine's ffmpeg has, or null for none (or no ffmpeg). */
export function pickEncoder(): { format: "mp3" | "ogg"; args: string[] } | null {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  if (/\blibmp3lame\b/.test(r.stdout)) return { format: "mp3", args: ["-c:a", "libmp3lame", "-q:a", "5"] };
  if (/\blibopus\b/.test(r.stdout)) return { format: "ogg", args: ["-c:a", "libopus", "-b:a", "48k"] };
  return null;
}

function ffmpeg(input: string, output: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, ...args, output], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", fail);
    child.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg failed: ${err.trim().slice(0, 300)}`))));
  });
}

/** Every distinct text the deck's narrator can ask for, in deck order. */
export function deckSegments(entry: string): { texts: string[]; headmatter: Record<string, unknown> } {
  const split = splitDeck(readFileSync(entry, "utf8"), {
    file: entry,
    resolveInclude: (path, from) => {
      const file = resolve(dirname(from), path);
      return existsSync(file) ? { file, text: readFileSync(file, "utf8") } : null;
    },
  });
  const texts = new Set<string>();
  split.slides.forEach((s, i) => {
    if (resolveSlideOptions(s.frontmatter, DEFAULT_CONFIG, i === 0).hidden) return;
    // The same text the Vite plugin puts in the manifest (`notesText`), so the hashes agree.
    const notesText = s.notes ? plainText(s.notes) : null;
    for (const t of slideSegments({ notesText, frontmatter: s.frontmatter })) if (t) texts.add(t);
  });
  return { texts: [...texts], headmatter: split.headmatter };
}

export async function narrate(
  dir: string,
  flags: { voice?: string; dtype?: string; force?: boolean },
  log: (line: string) => void,
): Promise<NarrateResult> {
  const project = openProject(dir);
  const { texts, headmatter } = deckSegments(project.entry);
  const fromDeck = (
    headmatter.narration && typeof headmatter.narration === "object" ? headmatter.narration : {}
  ) as Partial<NarrationConfig>;
  const voice = flags.voice ?? fromDeck.voice ?? DEFAULT_NARRATION.voice;
  if (!isKokoroVoice(voice)) throw new UsageError(`--voice: "${voice}" is not a Kokoro voice (af_heart, af_bella, bm_george…).`);
  const want = flags.dtype ?? (fromDeck.dtype && fromDeck.dtype !== "auto" ? fromDeck.dtype : "fp32");
  if (!(DTYPES as readonly string[]).includes(want)) throw new UsageError(`--dtype must be one of ${DTYPES.join(", ")}`);
  const dtype = want as Dtype;
  const model = fromDeck.model ?? DEFAULT_NARRATION.model;

  const publicDir = join(project.dir, "public");
  const clipDir = join(publicDir, "narration");
  const indexPath = join(publicDir, "narration.json");
  let index: NarrationIndex = { version: 1, clips: {} };
  try {
    index = parseIndex(JSON.parse(await readFile(indexPath, "utf8")));
  } catch {
    // No index yet.
  }
  // Keep only entries whose file is still there.
  const clips: Record<string, BakedClip> = {};
  for (const [k, c] of Object.entries(index.clips)) if (existsSync(join(publicDir, c.src))) clips[k] = c;

  const todo = texts.filter((t) => flags.force || !clips[clipKey(voice, t)]);
  const encoder = pickEncoder();
  const format = encoder?.format ?? "wav";
  const result: NarrateResult = {
    voice,
    dtype,
    format,
    segments: texts.length,
    made: 0,
    skipped: texts.length - todo.length,
    bytes: 0,
    index: indexPath,
  };
  if (!todo.length) {
    log(`Nothing to say: all ${texts.length} segments are baked for ${voice}.`);
    return result;
  }
  if (!encoder) log("ffmpeg (with libmp3lame or libopus) not found: writing WAV, about 10× the size of MP3.");

  const entry = kokoroEntry(project.dir);
  log(`Loading Kokoro (${model}, ${dtype}, CPU)…`);
  await mkdir(clipDir, { recursive: true });
  const jobs = todo.map((text) => {
    const key = clipKey(voice, text);
    return { key, text, voice, out: join(clipDir, `${key}.tmp.wav`) };
  });
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  let shown = -1;
  await synthesize(entry, model, dtype, jobs, async (m) => {
    if (m.type === "progress") {
      const pct = Math.floor(m.progress * 10) * 10;
      if (pct !== shown) log(`  downloading the model: ${(shown = pct)}%`);
      return;
    }
    if (m.type !== "done") return;
    const job = byKey.get(m.key)!;
    const name = `${m.key}.${format}`;
    const file = join(clipDir, name);
    try {
      if (encoder) await ffmpeg(job.out, file, encoder.args);
      else await writeFile(file, await readFile(job.out));
    } finally {
      await rm(job.out, { force: true });
    }
    const previous = clips[m.key];
    if (previous && previous.src !== `narration/${name}`)
      await rm(join(publicDir, previous.src), { force: true });
    clips[m.key] = { src: `narration/${name}`, ms: m.ms };
    result.made++;
    result.bytes += statSync(file).size;
    const text = job.text;
    log(`  ${result.made}/${jobs.length}  ${(m.ms / 1000).toFixed(1)} s  ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);
    // Written as it goes: an interrupted run keeps what it made.
    await writeFile(indexPath, `${JSON.stringify({ version: 1, clips }, null, 2)}\n`);
  });
  return result;
}
