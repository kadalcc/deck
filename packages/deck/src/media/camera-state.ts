import { readItem, writeItem } from "../core/storage.ts";
import { createStore, type Store } from "../core/store.ts";
import { createWindowBus, type WindowBus } from "../core/windows.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CAMERA BUBBLE'S STATE  —  one per deck, the same in every window
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Whether the camera is showing, where it sits on the slide, how big, what shape, mirrored or
 * not, and which camera. Kept in fractions of the slide, so it sits on the same spot of the slide
 * in the presenter's preview, the play view and a shared window whatever their sizes; posted on
 * the window bus so the presenter turning it on (or dragging it) moves it on the audience's
 * screen too; remembered per deck (all but on/off) so it comes back where it was left.
 *
 * Which camera and microphone, like the recorder's format, is the browser's, not the deck's:
 * `devicePrefs` keeps it once for every deck.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CameraShape = "circle" | "rounded" | "rect";
export const CAMERA_SHAPES: CameraShape[] = ["circle", "rounded", "rect"];

export interface CameraState {
  on: boolean;
  shape: CameraShape;
  mirror: boolean;
  /** Top-left corner, as fractions of the slide's width and height. */
  x: number;
  y: number;
  /** Width as a fraction of the slide's width. */
  size: number;
}

export const DEFAULT_CAMERA: CameraState = {
  on: false,
  shape: "circle",
  mirror: true,
  x: 0.79,
  y: 0.6,
  size: 0.18,
};

export const MIN_SIZE = 0.06;
export const MAX_SIZE = 0.6;

/** Height over width: a circle is round, the others are a camera's 4:3. */
export const aspectOf = (shape: CameraShape) => (shape === "circle" ? 1 : 3 / 4);

/**
 * Keep the bubble whole and on the slide: its size within bounds, its corner where the whole of
 * it shows. `ratio` is the slide's height over its width.
 */
export function clampCamera(s: CameraState, ratio: number): CameraState {
  const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number.isFinite(s.size) ? s.size : 0.18));
  const h = (size * aspectOf(s.shape)) / ratio;
  const x = Math.min(1 - size, Math.max(0, Number.isFinite(s.x) ? s.x : 0));
  const y = Math.min(Math.max(0, 1 - h), Math.max(0, Number.isFinite(s.y) ? s.y : 0));
  return { ...s, size, x, y };
}

function parse(raw: string | null): Partial<CameraState> {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Partial<CameraState> = {};
    if (typeof v.shape === "string" && (CAMERA_SHAPES as string[]).includes(v.shape))
      out.shape = v.shape as CameraShape;
    if (typeof v.mirror === "boolean") out.mirror = v.mirror;
    for (const k of ["x", "y", "size"] as const)
      if (typeof v[k] === "number" && Number.isFinite(v[k])) out[k] = v[k] as number;
    if (typeof v.on === "boolean") out.on = v.on;
    return out;
  } catch {
    return {};
  }
}

type CameraMessage =
  | { type: "camera"; state: CameraState; from: string }
  | { type: "hello"; from: string };

interface Entry {
  store: Store<CameraState>;
  bus: WindowBus<CameraMessage> | null;
  /** A change from this window: set it, keep it, tell the others. */
  set: (patch: Partial<CameraState>) => void;
}

const entries = new Map<string, Entry>();

/**
 * The camera state for a deck in this window, shared with its other windows. One per deck slug,
 * made on first use; every component that reads or moves the bubble goes through it.
 */
export function cameraState(slug: string): Entry {
  const hit = entries.get(slug);
  if (hit) return hit;
  const key = `deck.camera.${slug}`;
  const me = Math.random().toString(36).slice(2, 10);
  const { on: _on, ...kept } = parse(readItem(key));
  const store = createStore<CameraState>({ ...DEFAULT_CAMERA, ...kept, on: false });
  let bus: WindowBus<CameraMessage> | null = null;
  try {
    if (typeof window !== "undefined") bus = createWindowBus<CameraMessage>(`${slug}:camera`);
  } catch {
    bus = null;
  }
  const remember = (s: CameraState) => {
    const { on: _o, ...rest } = s;
    writeItem(key, JSON.stringify(rest));
  };
  bus?.subscribe(({ data: m }) => {
    if (!m || typeof m !== "object" || m.from === me) return;
    if (m.type === "hello") {
      bus?.post({ type: "camera", state: store.get(), from: me });
      return;
    }
    if (m.type !== "camera") return;
    const next = { ...store.get(), ...parse(JSON.stringify(m.state)) };
    store.set(next);
  });
  bus?.post({ type: "hello", from: me });
  const entry: Entry = {
    store,
    bus,
    set(patch) {
      const next = { ...store.get(), ...patch };
      store.set(next);
      remember(next);
      bus?.post({ type: "camera", state: next, from: me });
    },
  };
  entries.set(slug, entry);
  return entry;
}

/* ── devices ─────────────────────────────────────────────────────────────── */

export interface DevicePrefs {
  /** A camera's deviceId, "" for the browser's default. */
  camera: string;
  /** A microphone's deviceId, "" for the default, "none" for no sound. */
  mic: string;
}

const DEVICES_KEY = "deck.media.devices";

export function devicePrefs(): DevicePrefs {
  try {
    const v = JSON.parse(readItem(DEVICES_KEY) ?? "{}") as Partial<DevicePrefs>;
    return {
      camera: typeof v.camera === "string" ? v.camera : "",
      mic: typeof v.mic === "string" ? v.mic : "",
    };
  } catch {
    return { camera: "", mic: "" };
  }
}

export const devices = createStore<DevicePrefs>(devicePrefs());

export function setDevicePrefs(patch: Partial<DevicePrefs>) {
  const next = { ...devices.get(), ...patch };
  devices.set(next);
  writeItem(DEVICES_KEY, JSON.stringify(next));
}

/** The cameras and microphones this browser has; names appear once one has been allowed. */
export async function listDevices(): Promise<{
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices)
    return { cameras: [], mics: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === "videoinput"),
    mics: all.filter((d) => d.kind === "audioinput"),
  };
}

/** A video constraint for the chosen camera: that one if it is still here, else any. */
export const videoFor = (id: string): MediaTrackConstraints | boolean =>
  id
    ? { deviceId: { ideal: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 } };

/** An audio constraint for the chosen microphone; false for none. */
export const audioFor = (id: string): MediaTrackConstraints | boolean =>
  id === "none" ? false : id ? { deviceId: { ideal: id } } : true;
