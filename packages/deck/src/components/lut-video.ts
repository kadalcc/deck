import { type RefObject, useEffect, useState } from "react";

import { useStillHold } from "../react/still-holds.ts";

/**
 * A `<Video lut>`'s grade: a canvas over the video, drawn by components/lut-gl.ts (loaded only
 * here) each frame while it plays and once after it loads, seeks or pauses. Only the copy that
 * plays (`live`) or prints draws — an overview tile or the presenter's next box shows the graded
 * poster and holds no GPU context. The canvas is made here, in `host` next to the video, and
 * dropped with its context when the video stops drawing (a lost context can't be had again).
 *
 * "on" once a graded frame is on the canvas (the video under it is hidden), "off" when it can't
 * be — no WebGL2, a video without CORS, a LUT that won't read, the context lost — and the video
 * shows ungraded; null with no LUT or where nothing draws.
 */
export function useVideoLut(
  video: RefObject<HTMLVideoElement | null>,
  host: RefObject<HTMLElement | null>,
  o: { lut?: string; strength: number; live: boolean; print: boolean; poster: boolean },
): "on" | "off" | "pending" | null {
  const { lut, strength, live, print } = o;
  // In print a poster that stands in (`poster`) is graded as an image; a frame is drawn here.
  const draws = !!lut && strength > 0 && (live || (print && !o.poster));
  const [state, setState] = useState<"on" | "off" | "pending">("pending");
  useEffect(() => {
    const v = video.current;
    const box = host.current;
    if (!draws || !v || !box) return;
    const c = document.createElement("canvas");
    c.className = "deck-video-lut";
    c.setAttribute("aria-hidden", "true");
    // The video's own fit, so the graded frame lands where the video's would.
    c.style.objectFit = getComputedStyle(v).objectFit || "contain";
    box.appendChild(c);
    let alive = true;
    let raf = 0;
    let grader: import("./lut-gl.ts").Grader | null = null;
    setState("pending");
    const fail = (why: unknown) => {
      if (!alive) return;
      console.warn(`[kadal-deck] lut: ${lut} not applied to the video:`, why);
      setState("off");
      stop();
    };
    const draw = () => {
      if (!grader || grader.lost || v.readyState < 2 || !v.videoWidth) return;
      try {
        grader.draw(v, v.videoWidth, v.videoHeight);
        setState("on");
      } catch (e) {
        fail(e);
      }
    };
    const loop = () => {
      draw();
      if (!v.paused && !v.ended) raf = requestAnimationFrame(loop);
    };
    const play = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const events = ["loadeddata", "seeked", "pause", "timeupdate"] as const;
    function stop() {
      cancelAnimationFrame(raf);
      for (const e of events) v!.removeEventListener(e, draw);
      v!.removeEventListener("play", play);
    }
    const lost = (e: Event) => {
      e.preventDefault();
      setState("off");
    };
    // The GPU came back (a driver reset, a tab woken up): everything on it is rebuilt.
    const restored = () => {
      stop();
      void start();
    };
    async function start() {
      try {
        const gl = await import("./lut-gl.ts");
        const cube = await gl.loadLut(lut!);
        if (!alive) return;
        grader = new gl.Grader(c, cube, strength);
      } catch (e) {
        fail(e);
        return;
      }
      for (const e of events) v!.addEventListener(e, draw);
      v!.addEventListener("play", play);
      if (!v!.paused) play();
      else draw();
    }
    c.addEventListener("webglcontextlost", lost);
    c.addEventListener("webglcontextrestored", restored);
    void start();
    return () => {
      alive = false;
      stop();
      c.removeEventListener("webglcontextlost", lost);
      c.removeEventListener("webglcontextrestored", restored);
      grader?.dispose();
      c.remove();
    };
  }, [draws, lut, strength, video, host]);
  useStillHold(print, draws && state === "pending");
  return draws ? state : null;
}
