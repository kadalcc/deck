import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { useStore } from "../core/store.ts";
import { useCommand } from "../react/commands.ts";
import { useDeck } from "../react/context.ts";
import { useActions, useLayout } from "../react/hooks.ts";
import {
  aspectOf,
  CAMERA_SHAPES,
  cameraState,
  clampCamera,
  devices,
  videoFor,
} from "./camera-state.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CAMERA BUBBLE  —  your face on the slide, where the audience sees it
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Slidev puts the camera view on the slides; so does this. It sits on the slide itself — in the
 * play view, in a shared window, and over the presenter's current-slide preview — so a recording
 * or a screen share of the audience's view has the speaker in it, and the presenter sees exactly
 * where. Drag it to move it; drag its corner to resize it (Shift keeps the corner's pace finer);
 * with it focused, the arrow keys move it and + and − resize it. A circle, a rounded box or a
 * plain one; mirrored like a mirror or as the room sees you. All of that is shared between the
 * deck's windows and remembered per deck (camera-state.ts).
 *
 * The camera is opened in each window that shows the bubble — a browser shares one camera between
 * them — and closed when it hides. It never prints (themes/media.css), and a shared window shows
 * it without its controls.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function CameraBubble({ inCanvas = false }: { inCanvas?: boolean }) {
  const deck = useDeck();
  const layout = useLayout();
  const actions = useActions();
  const cam = cameraState(deck.config.slug || deck.base);
  const state = useStore(cam.store);
  const device = useStore(devices, (d) => d.camera);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const W = deck.config.width;
  const H = deck.config.height;
  const ratio = H / W;
  const interactive = !deck.projector && deck.mode !== "print";

  useEffect(() => {
    if (!state.on) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setFailed("This browser has no camera access.");
      return;
    }
    let stream: MediaStream | null = null;
    let alive = true;
    setFailed(null);
    navigator.mediaDevices
      .getUserMedia({ video: videoFor(device), audio: false })
      .then((s) => {
        if (!alive) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const name = err instanceof DOMException ? err.name : "";
        setFailed(
          name === "NotAllowedError"
            ? "The camera was not allowed."
            : name === "NotFoundError"
              ? "No camera was found."
              : "The camera could not start.",
        );
      });
    return () => {
      alive = false;
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [state.on, device]);

  // Say it once in the window that asked, not in every window showing the bubble.
  useEffect(() => {
    if (failed && interactive) actions.toast(failed);
  }, [failed, interactive, actions]);

  if (!state.on) return null;
  const s = clampCamera(state, ratio);

  /** Fractions of the slide from a pointer position. */
  const frac = (clientX: number, clientY: number) => {
    const r = box.current?.parentElement?.getBoundingClientRect();
    const host = inCanvas
      ? r
      : { left: layout.left, top: layout.top, width: layout.width, height: layout.height };
    if (!host || !host.width || !host.height) return [0, 0] as const;
    return [(clientX - host.left) / host.width, (clientY - host.top) / host.height] as const;
  };

  const drag = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const [fx, fy] = frac(e.clientX, e.clientY);
    const start = { fx, fy, x: s.x, y: s.y, size: s.size };
    const move = (ev: PointerEvent) => {
      const [gx, gy] = frac(ev.clientX, ev.clientY);
      if (mode === "move")
        cam.set(
          clampCamera({ ...s, x: start.x + gx - start.fx, y: start.y + gy - start.fy }, ratio),
        );
      else {
        // The corner follows the pointer: the larger of the two directions decides the size.
        const dx = gx - start.fx;
        const dy = ((gy - start.fy) * ratio) / aspectOf(s.shape);
        cam.set(clampCamera({ ...s, size: start.size + Math.max(dx, dy) }, ratio));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    let next = null as null | typeof s;
    if (e.key === "ArrowLeft") next = { ...s, x: s.x - step };
    else if (e.key === "ArrowRight") next = { ...s, x: s.x + step };
    else if (e.key === "ArrowUp") next = { ...s, y: s.y - step / ratio };
    else if (e.key === "ArrowDown") next = { ...s, y: s.y + step / ratio };
    else if (e.key === "+" || e.key === "=") next = { ...s, size: s.size + step };
    else if (e.key === "-" || e.key === "_") next = { ...s, size: s.size - step };
    else if (e.key === "Escape") return cam.set({ on: false });
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    cam.set(clampCamera(next, ratio));
  };

  const style: React.CSSProperties = inCanvas
    ? { left: s.x * W, top: s.y * H, width: s.size * W, height: s.size * W * aspectOf(s.shape) }
    : {
        left: layout.left + s.x * layout.width,
        top: layout.top + s.y * layout.height,
        width: s.size * layout.width,
        height: s.size * layout.width * aspectOf(s.shape),
      };
  const nextShape = CAMERA_SHAPES[(CAMERA_SHAPES.indexOf(s.shape) + 1) % CAMERA_SHAPES.length]!;
  return (
    <div
      ref={box}
      className={[
        "deck-camera-bubble",
        `is-${s.shape}`,
        inCanvas ? "is-in-canvas" : "",
        interactive ? "is-interactive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role={interactive ? "group" : undefined}
      aria-label={
        interactive
          ? "Camera: drag to move, drag the corner to resize, arrows and + − with the keyboard"
          : undefined
      }
      aria-hidden={interactive ? undefined : true}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? onKey : undefined}
      onPointerDown={(e) => drag(e, "move")}
      data-export="skip"
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        style={s.mirror ? { transform: "scaleX(-1)" } : undefined}
      />
      {failed ? <span className="deck-camera-failed">{failed}</span> : null}
      {interactive ? (
        <>
          <div className="deck-camera-controls" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => cam.set({ shape: nextShape })}
              title={`Shape: ${s.shape} — click for ${nextShape}`}
              aria-label={`Camera shape ${s.shape}; switch to ${nextShape}`}
            >
              <Icon
                name={
                  s.shape === "circle"
                    ? "circle"
                    : s.shape === "rounded"
                      ? "square-round-corner"
                      : "square"
                }
              />
            </button>
            <button
              type="button"
              className={s.mirror ? "is-on" : ""}
              onClick={() => cam.set({ mirror: !s.mirror })}
              title={
                s.mirror
                  ? "Mirrored, as in a mirror — click to show it as others see you"
                  : "As others see you — click to mirror"
              }
              aria-label="Mirror the camera"
              aria-pressed={s.mirror}
            >
              <Icon name="flip-horizontal-2" />
            </button>
            <button
              type="button"
              onClick={() => cam.set({ on: false })}
              title="Hide the camera (V)"
              aria-label="Hide the camera"
            >
              <Icon name="x" />
            </button>
          </div>
          <span
            className="deck-camera-resize"
            onPointerDown={(e) => drag(e, "resize")}
            title="Drag to resize"
            aria-hidden
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * The play view's camera: the bubble over the slide, the V key's command, and — through the
 * shared state — whatever the presenter does with it. Mounted by the play view (react/Deck.tsx).
 */
export function CameraLayer() {
  useCameraCommand();
  return <CameraBubble />;
}

/** `media.camera`: show or hide the camera bubble on the slide, in every window of the deck. */
export function useCameraCommand() {
  const deck = useDeck();
  const cam = cameraState(deck.config.slug || deck.base);
  useCommand(
    deck.projector
      ? null
      : {
          id: "media.camera",
          title: "Camera",
          description:
            "Show or hide your camera in a bubble on the slide (every window of the deck shows it; drag to move, drag its corner to resize).",
          group: "present",
          keys: "V",
          params: z.object({ on: z.boolean().optional() }),
          run: (p) => {
            const on = p.on ?? !cam.store.get().on;
            cam.set({ on });
            return { camera: on };
          },
        },
  );
}
