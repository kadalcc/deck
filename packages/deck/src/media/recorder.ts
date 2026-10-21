import { createStore, type Store } from "../core/store.ts";
import { audioFor, videoFor } from "./camera-state.ts";
import { fixWebmDuration } from "./webm-duration.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RECORDER  —  the screen, the camera, or both as two files
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What to record (`RecordMode`):
 *
 *   screen   a screen, window or tab you pick, with the microphone (and the tab's own sound if
 *            you share it) — show the camera bubble on the slide and the face is in it
 *   camera   the camera alone, with the microphone
 *   both     the screen and the camera as two separate files, started and stopped together, so
 *            an editor can lay the face over the slides wherever it likes (Slidev's "separate")
 *
 * Pause and resume act on both recorders at once; the clock counts recorded time only. When it
 * stops, each file is downloaded under a name that says what it is and when:
 * `<deck>-<label>-screen-2026-10-22-1430.webm`. WebM files get their duration written in
 * (webm-duration.ts) so players can show the length and seek; MP4 is offered where the browser's
 * MediaRecorder can write it.
 *
 * Stopping the screen share from the browser's own bar stops the recording too.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RecordMode = "screen" | "camera" | "both";
export type RecordFormat = "webm" | "mp4";

/** MediaRecorder types to try, best first, for each format. */
const MIME: Record<RecordFormat, string[]> = {
  webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
  mp4: ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"],
};

/** The first type the browser can record for a format, or null. */
export function mimeFor(
  format: RecordFormat,
  supported: (t: string) => boolean = (t) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
): string | null {
  return MIME[format].find((t) => supported(t)) ?? null;
}

/** The formats this browser can record. */
export function formatsSupported(supported?: (t: string) => boolean): RecordFormat[] {
  return (["webm", "mp4"] as const).filter((f) => mimeFor(f, supported) !== null);
}

/** A name for a file: the deck, what it is, when — safe on every file system. */
export function fileName(
  parts: { deck: string; label?: string; what: "screen" | "camera"; ext: RecordFormat },
  at: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const clean = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  return `${[clean(parts.deck) || "deck", clean(parts.label ?? ""), parts.what, stamp].filter(Boolean).join("-")}.${parts.ext}`;
}

/** Recorded time as m:ss (h:mm:ss past an hour). */
export function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export interface RecordOptions {
  mode: RecordMode;
  format: RecordFormat;
  /** Camera deviceId ("" = default). */
  camera: string;
  /** Microphone deviceId ("" = default, "none" = no microphone). */
  mic: string;
  /** Also record the sound of the shared tab or screen. */
  systemAudio: boolean;
  /** The deck's slug, for the file names. */
  deck: string;
  /** Optional words for the file names ("dry-run", "take 2"). */
  label: string;
}

export interface RecorderState {
  status: "idle" | "starting" | "recording" | "paused";
  /** Recorded ms, paused time left out. */
  elapsed: number;
  mode: RecordMode | null;
}

interface Track {
  what: "screen" | "camera";
  recorder: MediaRecorder;
  chunks: Blob[];
  done: Promise<Blob>;
}

/**
 * One recording session at a time. `start` asks for what it needs (a screen pick, the camera,
 * the microphone); `stop` ends it and hands each file to `save` (by default, a download).
 */
export class Recorder {
  readonly state: Store<RecorderState> = createStore<RecorderState>({
    status: "idle",
    elapsed: 0,
    mode: null,
  });
  private tracks: Track[] = [];
  private streams: MediaStream[] = [];
  private startedAt = 0;
  private pausedAt = 0;
  private pausedFor = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private options: RecordOptions | null = null;

  constructor(
    private readonly save: (name: string, blob: Blob) => void = download,
    private readonly media: Pick<
      MediaDevices,
      "getUserMedia" | "getDisplayMedia"
    > | null = typeof navigator !== "undefined" ? navigator.mediaDevices : null,
  ) {}

  elapsed(now = performance.now()): number {
    const s = this.state.get().status;
    if (s === "idle" || s === "starting") return 0;
    const pausing = s === "paused" ? now - this.pausedAt : 0;
    return now - this.startedAt - this.pausedFor - pausing;
  }

  async start(o: RecordOptions): Promise<void> {
    if (this.state.get().status !== "idle") return;
    if (!this.media) throw new Error("This browser cannot record.");
    const mime = mimeFor(o.format);
    if (!mime) throw new Error(`This browser cannot record ${o.format.toUpperCase()}.`);
    this.state.set({ status: "starting", elapsed: 0, mode: o.mode });
    this.options = o;
    try {
      let screen: MediaStream | null = null;
      if (o.mode !== "camera") {
        screen = await this.media.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: o.systemAudio,
          // Offer this tab first: a deck is usually recorded from the window it runs in.
          ...({ preferCurrentTab: false, selfBrowserSurface: "include" } as object),
        } as DisplayMediaStreamOptions);
        this.streams.push(screen);
      }
      const wantCamera = o.mode !== "screen";
      const wantMic = o.mic !== "none";
      let user: MediaStream | null = null;
      if (wantCamera || wantMic) {
        try {
          user = await this.media.getUserMedia({
            video: wantCamera ? videoFor(o.camera) : false,
            audio: audioFor(o.mic),
          });
          this.streams.push(user);
        } catch (err) {
          // Without a camera there is nothing to record in camera modes; without a microphone
          // the screen still records, silent.
          if (wantCamera) throw err;
        }
      }
      const mic = user?.getAudioTracks() ?? [];
      if (screen) {
        const audio = mixAudio([...screen.getAudioTracks(), ...mic]);
        const s = new MediaStream([...screen.getVideoTracks(), ...audio]);
        this.tracks.push(this.track("screen", s, mime));
        // The browser's own "Stop sharing" ends the recording, every file of it.
        screen.getVideoTracks()[0]?.addEventListener("ended", () => void this.stop());
      }
      if (wantCamera && user) {
        const c = new MediaStream([...user.getVideoTracks(), ...mic.map((t) => t.clone())]);
        this.streams.push(c);
        this.tracks.push(this.track("camera", c, mime));
      }
      for (const t of this.tracks) t.recorder.start(1000);
      this.startedAt = performance.now();
      this.pausedFor = 0;
      this.state.set({ status: "recording", elapsed: 0, mode: o.mode });
      this.ticker = setInterval(
        () => this.state.update((st) => ({ ...st, elapsed: this.elapsed() })),
        250,
      );
    } catch (err) {
      this.cleanup();
      this.state.set({ status: "idle", elapsed: 0, mode: null });
      throw err;
    }
  }

  private track(what: "screen" | "camera", stream: MediaStream, mime: string): Track {
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
    });
    return { what, recorder, chunks, done };
  }

  pause() {
    if (this.state.get().status !== "recording") return;
    for (const t of this.tracks) if (t.recorder.state === "recording") t.recorder.pause();
    this.pausedAt = performance.now();
    this.state.update((s) => ({ ...s, status: "paused", elapsed: this.elapsed() }));
  }

  resume() {
    if (this.state.get().status !== "paused") return;
    for (const t of this.tracks) if (t.recorder.state === "paused") t.recorder.resume();
    this.pausedFor += performance.now() - this.pausedAt;
    this.state.update((s) => ({ ...s, status: "recording" }));
  }

  /** Stop and save every file. Resolves with their names once they are saved. */
  async stop(): Promise<string[]> {
    const status = this.state.get().status;
    if (status !== "recording" && status !== "paused") return [];
    const ms = this.elapsed();
    const o = this.options!;
    const tracks = this.tracks;
    this.tracks = [];
    for (const t of tracks) if (t.recorder.state !== "inactive") t.recorder.stop();
    this.state.set({ status: "idle", elapsed: 0, mode: null });
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    const at = new Date();
    const names: string[] = [];
    for (const t of tracks) {
      let blob = await t.done;
      if (o.format === "webm") blob = await fixWebmDuration(blob, ms);
      const name = fileName({ deck: o.deck, label: o.label, what: t.what, ext: o.format }, at);
      this.save(name, blob);
      names.push(name);
    }
    this.cleanup();
    return names;
  }

  private cleanup() {
    for (const s of this.streams) for (const t of s.getTracks()) t.stop();
    this.streams = [];
    for (const t of this.tracks) if (t.recorder.state !== "inactive") t.recorder.stop();
    this.tracks = [];
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    closeMixer();
  }
}

/* ── sound ───────────────────────────────────────────────────────────────── */

let mixer: AudioContext | null = null;
function closeMixer() {
  void mixer?.close().catch(() => {});
  mixer = null;
}

/**
 * One audio track from several: a MediaRecorder records only the first audio track it is given,
 * so the tab's sound and the microphone are mixed into one. A single track passes as it is.
 */
function mixAudio(tracks: MediaStreamTrack[]): MediaStreamTrack[] {
  if (tracks.length <= 1 || typeof AudioContext === "undefined") return tracks.slice(0, 1);
  try {
    mixer = new AudioContext();
    const out = mixer.createMediaStreamDestination();
    for (const t of tracks) mixer.createMediaStreamSource(new MediaStream([t])).connect(out);
    return out.stream.getAudioTracks();
  } catch {
    return tracks.slice(0, 1);
  }
}

/** Save a file from the page: a download link, clicked. */
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
