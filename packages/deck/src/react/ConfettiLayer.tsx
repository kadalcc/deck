import { useEffect, useRef } from "react";

/**
 * A burst of confetti on a canvas, shared by the `<Confetti>` slide component and the layers
 * that answer the presenter's Confetti button (the play stage, the presenter's current-slide
 * card, the audience mirror). Returns a stop function.
 */
export function burstConfetti(
  c: HTMLCanvasElement,
  { count = 140, duration = 2200 }: { count?: number; duration?: number } = {},
): () => void {
  const ctx = c.getContext("2d");
  if (!ctx) return () => {};
  const W = (c.width = c.offsetWidth || c.clientWidth || 1);
  const H = (c.height = c.offsetHeight || c.clientHeight || 1);
  const colors = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
  const parts = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.4,
    vx: (Math.random() - 0.5) * 18,
    vy: -Math.random() * 18 - 6,
    r: Math.random() * 6 + 3,
    c: colors[Math.floor(Math.random() * colors.length)]!,
    a: Math.random() * Math.PI,
    s: (Math.random() - 0.5) * 0.3,
  }));
  const start = performance.now();
  let raf = 0;
  const tick = (t: number) => {
    const p = (t - start) / duration;
    ctx.clearRect(0, 0, W, H);
    for (const q of parts) {
      q.x += q.vx;
      q.y += q.vy;
      q.vy += 0.5;
      q.vx *= 0.99;
      q.a += q.s;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a);
      ctx.fillStyle = q.c;
      ctx.fillRect(-q.r / 2, -q.r, q.r, q.r * 2);
      ctx.restore();
    }
    if (p < 1) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
  };
}

/**
 * Listens for `deck:confetti` (the presenter's button, relayed by the room) and bursts over
 * whatever it is mounted in: the viewport (play view) or a scaled stage canvas (`inCanvas`).
 */
export function ConfettiLayer({ inCanvas = false }: { inCanvas?: boolean } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | null = null;
    const fire = () => {
      stop?.();
      if (canvas.current) stop = burstConfetti(canvas.current, { count: 180 });
    };
    window.addEventListener("deck:confetti", fire);
    return () => {
      window.removeEventListener("deck:confetti", fire);
      stop?.();
    };
  }, []);
  return (
    <canvas
      ref={canvas}
      className={["deck-confetti-layer", inCanvas ? "in-canvas" : ""].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}
