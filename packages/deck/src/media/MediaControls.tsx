import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { readItem, writeItem } from "../core/storage.ts";
import { useStore } from "../core/store.ts";
import { useCommand } from "../react/commands.ts";
import { useDeck } from "../react/context.ts";
import { useActions } from "../react/hooks.ts";
import { Listbox } from "../react/Listbox.tsx";
import { useCameraCommand } from "./CameraBubble.tsx";
import { cameraState, devices, listDevices, setDevicePrefs } from "./camera-state.ts";
import {
  clock,
  formatsSupported,
  type RecordFormat,
  type RecordMode,
  Recorder,
} from "./recorder.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRESENTER'S CAMERA AND RECORDER CONTROLS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Camera     shows or hides the camera bubble on the slide — in every window of the deck, so
 *              the audience's screen has it too (CameraBubble.tsx); the arrow beside it picks
 *              the camera and microphone and the bubble's shape
 *   Record     opens the recorder: the screen with your voice, the camera alone, or both as two
 *              files; which camera, which microphone, WebM or MP4, a label for the file names.
 *              While it records: the time, pause/resume, stop.
 *
 * The choices are remembered in this browser. The panels are portalled to the page, so the
 * presenter's toolbar styles never reach them, and close on Escape or a click elsewhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A panel under (or over) the button that opened it, kept on screen. */
function usePanel(anchor: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    const below = window.innerHeight - r.bottom;
    setPos(
      below > 320 || below > r.top
        ? { left, top: r.bottom + 6 }
        : { left, bottom: window.innerHeight - r.top + 6 },
    );
  }, [open, anchor]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      // A listbox's list is portalled too; a choice in it is not a click away.
      if ((t as Element).closest?.("[role=listbox]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !(e.target as Element)?.closest?.("[role=listbox],[aria-expanded=true]")
      ) {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, anchor, close]);
  return { panel, style: { left: pos.left, top: pos.top, bottom: pos.bottom } };
}

/** The cameras and microphones, named once any has been allowed; a button to ask. */
function useDeviceList(open: boolean) {
  const [list, setList] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({
    cameras: [],
    mics: [],
  });
  const refresh = () => void listDevices().then(setList, () => {});
  useEffect(() => {
    if (!open) return;
    refresh();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    md?.addEventListener?.("devicechange", refresh);
    return () => md?.removeEventListener?.("devicechange", refresh);
  }, [open]);
  const named = [...list.cameras, ...list.mics].some((d) => d.label);
  const ask = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      for (const t of s.getTracks()) t.stop();
    } catch {
      /* the names stay hidden; the default devices still work */
    }
    refresh();
  };
  return { ...list, named, ask };
}

function DeviceFields({ open, camera = true }: { open: boolean; camera?: boolean }) {
  const prefs = useStore(devices);
  const list = useDeviceList(open);
  const name = (d: MediaDeviceInfo, i: number, what: string) => d.label || `${what} ${i + 1}`;
  return (
    <>
      {camera ? (
        <div className="deck-record-row">
          <span>Camera</span>
          <Listbox
            label="Camera"
            value={prefs.camera}
            onChange={(camera) => setDevicePrefs({ camera })}
            groups={[
              {
                options: [
                  { value: "", label: "Default camera" },
                  ...list.cameras
                    .filter((d) => d.deviceId)
                    .map((d, i) => ({ value: d.deviceId, label: name(d, i, "Camera") })),
                ],
              },
            ]}
          />
        </div>
      ) : null}
      <div className="deck-record-row">
        <span>Microphone</span>
        <Listbox
          label="Microphone"
          value={prefs.mic}
          onChange={(mic) => setDevicePrefs({ mic })}
          groups={[
            {
              options: [
                { value: "", label: "Default microphone" },
                ...list.mics
                  .filter((d) => d.deviceId)
                  .map((d, i) => ({ value: d.deviceId, label: name(d, i, "Microphone") })),
                { value: "none", label: "No microphone" },
              ],
            },
          ]}
        />
      </div>
      {list.named ? null : (
        <p className="deck-record-note">
          Device names show once the browser has been allowed to use them.{" "}
          <button type="button" className="deck-record-link" onClick={() => void list.ask()}>
            Allow and show names
          </button>
        </p>
      )}
    </>
  );
}

/** The camera toggle, with its settings beside it. */
export function CameraControl() {
  const deck = useDeck();
  const cam = cameraState(deck.config.slug || deck.base);
  const on = useStore(cam.store, (s) => s.on);
  const shape = useStore(cam.store, (s) => s.shape);
  const mirror = useStore(cam.store, (s) => s.mirror);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  const { panel, style } = usePanel(anchor, open, close);
  useCameraCommand();
  return (
    <span ref={anchor} className="deck-record">
      <button
        type="button"
        className={on ? "is-on" : ""}
        onClick={() => cam.set({ on: !on })}
        title="Your camera, on the slide every window shows (V)"
        aria-pressed={on}
      >
        <Icon name="video" /> Camera
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Camera, microphone and bubble"
        aria-label="Camera settings"
        aria-expanded={open}
      >
        <Icon name="chevron-down" />
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              className="deck-record-panel"
              style={style}
              role="dialog"
              aria-label="Camera settings"
              data-deck-own-keys
            >
              <h3>Camera</h3>
              <DeviceFields open={open} />
              <div className="deck-record-row">
                <span>Shape</span>
                <Listbox
                  label="Shape"
                  value={shape}
                  onChange={(s) => cam.set({ shape: s })}
                  groups={[
                    {
                      options: [
                        { value: "circle", label: "Circle" },
                        { value: "rounded", label: "Rounded" },
                        { value: "rect", label: "Rectangle" },
                      ],
                    },
                  ]}
                />
              </div>
              <label className="deck-record-check">
                <input
                  type="checkbox"
                  checked={mirror}
                  onChange={(e) => cam.set({ mirror: e.target.checked })}
                />
                Mirror (as in a mirror)
              </label>
              <p className="deck-record-note">
                Drag the bubble on the slide to move it, its corner to resize it. It shows in the
                play view and any shared window, never in print.
              </p>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

interface RecordPrefs {
  mode: RecordMode;
  format: RecordFormat;
  systemAudio: boolean;
  label: string;
}

const RECORD_KEY = "deck.media.record";

function readRecordPrefs(): RecordPrefs {
  const fallback: RecordPrefs = { mode: "screen", format: "webm", systemAudio: true, label: "" };
  try {
    const v = JSON.parse(readItem(RECORD_KEY) ?? "{}") as Partial<RecordPrefs>;
    return {
      mode: v.mode === "camera" || v.mode === "both" ? v.mode : "screen",
      format: v.format === "mp4" ? "mp4" : "webm",
      systemAudio: typeof v.systemAudio === "boolean" ? v.systemAudio : true,
      label: typeof v.label === "string" ? v.label.slice(0, 60) : "",
    };
  } catch {
    return fallback;
  }
}

const MODES: { mode: RecordMode; title: string; detail: string }[] = [
  {
    mode: "screen",
    title: "Screen and voice",
    detail:
      "A screen, window or tab you pick, with the microphone. Show the camera bubble to have your face in it.",
  },
  { mode: "camera", title: "Camera only", detail: "Your camera and microphone, one file." },
  {
    mode: "both",
    title: "Screen and camera, separately",
    detail:
      "Two files started together — the screen, and the camera on its own — to lay out later.",
  },
];

/** Record, and while recording: the time, pause and stop. */
export function RecordControl() {
  const deck = useDeck();
  const actions = useActions();
  const [recorder] = useState(() => new Recorder());
  const rec = useStore(recorder.state);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefsState] = useState(readRecordPrefs);
  const setPrefs = (p: Partial<RecordPrefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      writeItem(RECORD_KEY, JSON.stringify(next));
      return next;
    });
  const anchor = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  const { panel, style } = usePanel(anchor, open, close);
  const formats = formatsSupported();
  const format = formats.includes(prefs.format) ? prefs.format : (formats[0] ?? "webm");
  useEffect(() => () => void recorder.stop(), [recorder]);

  const start = async () => {
    setOpen(false);
    const d = devices.get();
    try {
      await recorder.start({
        mode: prefs.mode,
        format,
        camera: d.camera,
        mic: d.mic,
        systemAudio: prefs.systemAudio,
        deck: deck.config.slug || "deck",
        label: prefs.label,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      actions.toast(
        name === "NotAllowedError"
          ? "Recording was not allowed"
          : err instanceof Error
            ? err.message
            : "Recording could not start",
      );
    }
  };
  const stop = async () => {
    const names = await recorder.stop();
    if (names.length) actions.toast(`Saved ${names.join(" and ")}`);
  };
  const busy = rec.status === "recording" || rec.status === "paused";

  useCommand({
    id: "media.record",
    title: "Record",
    description:
      "Start recording with the last choices (the browser asks which screen to share), or stop and save the files.",
    group: "present",
    params: z.object({ stop: z.boolean().optional() }),
    run: async (p) => {
      if (busy || p.stop) return { saved: await recorder.stop() };
      await start();
      return { recording: recorder.state.get().status };
    },
  });
  useCommand(
    busy
      ? {
          id: "media.recordPause",
          title: rec.status === "paused" ? "Resume recording" : "Pause recording",
          description: "Pause the recording, or resume it.",
          group: "present",
          run: () => {
            if (recorder.state.get().status === "paused") recorder.resume();
            else recorder.pause();
            return { status: recorder.state.get().status };
          },
        }
      : null,
  );

  if (busy)
    return (
      <span
        className={["deck-record", "is-recording", rec.status === "paused" ? "is-paused" : ""].join(
          " ",
        )}
        role="group"
        aria-label="Recording"
      >
        <span className="deck-record-dot" aria-hidden />
        <span className="deck-record-time" aria-live="off">
          {clock(rec.elapsed)}
        </span>
        <button
          type="button"
          onClick={() => (rec.status === "paused" ? recorder.resume() : recorder.pause())}
          title={rec.status === "paused" ? "Resume" : "Pause"}
          aria-label={rec.status === "paused" ? "Resume recording" : "Pause recording"}
        >
          <Icon name={rec.status === "paused" ? "play" : "pause"} />
        </button>
        <button
          type="button"
          className="is-on is-rec"
          onClick={() => void stop()}
          title="Stop and save"
        >
          <Icon name="square" /> Stop
        </button>
      </span>
    );

  return (
    <span ref={anchor} className="deck-record">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Record the screen, the camera, or both"
        aria-expanded={open}
        disabled={rec.status === "starting"}
      >
        <Icon name="circle" /> Record
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              className="deck-record-panel"
              style={style}
              role="dialog"
              aria-label="Record"
              data-deck-own-keys
            >
              <h3>Record</h3>
              <fieldset>
                <legend>What to record</legend>
                {MODES.map((m) => (
                  <label
                    key={m.mode}
                    className={["deck-record-choice", prefs.mode === m.mode ? "is-on" : ""].join(
                      " ",
                    )}
                  >
                    <input
                      type="radio"
                      name="deck-record-mode"
                      checked={prefs.mode === m.mode}
                      onChange={() => setPrefs({ mode: m.mode })}
                    />
                    <span>
                      {m.title}
                      <small>{m.detail}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Devices</legend>
                <DeviceFields open={open} camera={prefs.mode !== "screen"} />
              </fieldset>
              <div className="deck-record-row">
                <span>Format</span>
                <Listbox
                  label="Format"
                  value={format}
                  onChange={(f) => setPrefs({ format: f })}
                  groups={[
                    {
                      options: (["webm", "mp4"] as const).map((f) => ({
                        value: f,
                        label: f === "webm" ? "WebM" : "MP4",
                        detail: formats.includes(f) ? undefined : "not in this browser",
                        disabled: !formats.includes(f),
                      })),
                    },
                  ]}
                />
              </div>
              <label className="deck-record-row">
                <span>Name</span>
                <input
                  type="text"
                  value={prefs.label}
                  maxLength={60}
                  placeholder="e.g. dry run"
                  onChange={(e) => setPrefs({ label: e.target.value })}
                />
              </label>
              {prefs.mode !== "camera" ? (
                <label className="deck-record-check">
                  <input
                    type="checkbox"
                    checked={prefs.systemAudio}
                    onChange={(e) => setPrefs({ systemAudio: e.target.checked })}
                  />
                  Include the shared tab's sound
                </label>
              ) : null}
              <p className="deck-record-note">
                Files are saved as {deck.config.slug || "deck"}
                {prefs.label
                  ? `-${prefs.label
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`
                  : ""}
                -{prefs.mode === "both" ? "screen / -camera" : prefs.mode}-&lt;date&gt;.{format}
              </p>
              <div className="deck-record-actions">
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button type="button" className="is-primary" onClick={() => void start()}>
                  Start recording
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
