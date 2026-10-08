import { useEffect, useRef } from "react";

/** What every component background receives: whether its slide is showing, plus its own props. */
export interface BgProps {
  active?: boolean;
  [key: string]: unknown;
}

/**
 * A canvas that fills its layer, redraws at the device's pixel ratio, and animates only while
 * the slide is showing — or never, when the viewer asked for reduced motion (one still frame).
 */
export function useCanvas(
  active: boolean | undefined,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const animating = active !== false && !still;
    /**
     * Draw in the canvas's own units, but only buy the pixels it is actually shown at.
     *
     * A background inside a mirror or a preview is laid out at the deck's full stage size — 1920 ×
     * 1080 — while being displayed, after its ancestors' transform, at a few hundred pixels. Sized
     * off the layout box alone, every one of those asked for a 3840 × 2160 bitmap: 31 MB each,
     * two of them mounted at once the moment the join page is expanded, on top of whatever the
     * slide's embedded pages are holding. A phone does not have that to give — iOS caps what a
     * page may keep in canvas backing store and then clamps or drops the allocation, which is how
     * a background ends up stretched out of the deck's ratio, or the tab ends up gone.
     *
     * So the drawing stays in layout units (every background looks the same everywhere) and the
     * bitmap follows what is on screen: `shown` is the ancestors' scale, read from the rendered
     * box. A full-size stage has shown ≈ 1 and is unchanged.
     */
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      const rect = c.getBoundingClientRect();
      const shown = w > 0 && rect.width > 0 ? rect.width / w : 1;
      // Never more than the device's own pixels, never so few that a background turns to mush.
      const scale = Math.min(dpr, Math.max(0.35, shown * dpr));
      c.width = Math.max(1, Math.floor(w * scale));
      c.height = Math.max(1, Math.floor(h * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      // Setting the size wipes the bitmap; a canvas that is not animating paints its one frame again.
      if (!animating) draw(ctx, w, h, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    // A ResizeObserver watches the layout box, which does not move when only an ancestor's
    // transform does — turning a phone sideways and opening the full mirror are exactly that.
    window.addEventListener("resize", size);
    window.addEventListener("orientationchange", size);
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      draw(ctx, w, h, t / 1000, dt);
      raf = requestAnimationFrame(tick);
    };
    if (animating) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", size);
      window.removeEventListener("orientationchange", size);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
  return ref;
}

export const asList = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v)
    ? v.map(String)
    : typeof v === "string"
      ? v.split(",").map((s) => s.trim())
      : fallback;
export const asNum = (v: unknown, fallback: number): number =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : fallback;
export const asStr = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim() ? v : fallback;

/** A small value-noise, enough for waves and lines. */
export function noise2(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
export function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = noise2(ix, iy);
  const b = noise2(ix + 1, iy);
  const c = noise2(ix, iy + 1);
  const d = noise2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
