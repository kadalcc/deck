import { useRef } from "react";

import { registerBackground } from "../react/Backgrounds.tsx";
import { type BgProps, asList, asNum, smoothNoise, useCanvas } from "./shared.ts";
import "./gis.tsx";
import "./sign.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKGROUNDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Component backgrounds a slide picks by name — `background: aurora` in frontmatter, or
 * `<Background name="sparkles" />` inside a slide — and a couple of text effects. They are the
 * RLA deck's Aceternity-style layers rebuilt without dependencies: canvas where motion needs it,
 * CSS where it does not. Every one takes `active` (whether its slide is showing) and pauses when
 * it is not, so a deck full of them stays cheap.
 *
 *   gradient-mesh   slow drifting blurred blobs          (colors, speed)
 *   aurora          soft northern-lights bands            (colors, speed)
 *   waves           layered noise waves                   (colors, speed, blur)
 *   lines           flowing gradient lines                (colors, count, speed)
 *   beams           thin light beams falling              (color, count)
 *   sparkles        a particle field                      (color, density, size)
 *   starfield       stars with slow drift                 (color, count)
 *   grid            a fine grid with a vignette           (color, size)
 *   dots            a dot matrix                          (color, size)
 *   noise           film grain                            (opacity)
 *   spotlight       a soft radial glow                    (color, x, y)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function GradientMesh({ active, colors, speed }: BgProps) {
  const cs = asList(colors, ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b"]);
  const sp = asNum(speed, 1);
  return (
    <div
      className="deck-bg-mesh"
      data-active={active !== false || undefined}
      style={{ "--speed": `${40 / sp}s` } as React.CSSProperties}
    >
      {cs.map((c, i) => (
        <span
          key={i}
          style={{
            background: c,
            animationDelay: `${-i * 7}s`,
            left: `${15 + ((i * 37) % 60)}%`,
            top: `${20 + ((i * 53) % 50)}%`,
          }}
        />
      ))}
    </div>
  );
}

export function Aurora({ active, colors, speed }: BgProps) {
  const cs = asList(colors, ["#22d3ee", "#a78bfa", "#34d399"]);
  const sp = asNum(speed, 1);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      cs.forEach((c, i) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.5, c);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) {
          const y =
            h * 0.35 +
            Math.sin(x / (220 + i * 60) + t * sp * (0.4 + i * 0.15)) * 80 +
            smoothNoise(x / 300 + i, t * sp * 0.2) * 160 -
            80;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.filter = "blur(40px)";
        ctx.fill();
        ctx.filter = "none";
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },
    [cs.join(), sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

export function Waves({ active, colors, speed, blur }: BgProps) {
  const cs = asList(colors, ["#38bdf8", "#818cf8", "#c084fc", "#e879f9", "#22d3ee"]);
  const sp = asNum(speed, 1);
  const bl = asNum(blur, 10);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.filter = `blur(${bl}px)`;
      cs.forEach((c, i) => {
        ctx.beginPath();
        ctx.lineWidth = 50;
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.5;
        for (let x = 0; x < w + 5; x += 5) {
          const y = smoothNoise(x / 800, 0.3 * i + t * sp * 0.08) * 200 + h * 0.5 - 100;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    },
    [cs.join(), sp, bl],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

export function Lines({ active, colors, count, speed }: BgProps) {
  const cs = asList(colors, ["#1d4ed8", "#3b82f6", "#06b6d4"]);
  const n = asNum(count, 18);
  const sp = asNum(speed, 0.3);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, cs[i % cs.length]!);
        g.addColorStop(1, cs[(i + 1) % cs.length]!);
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.35 + 0.4 * ((i * 7) % 5) * 0.2;
        ctx.beginPath();
        const phase = i * 0.7;
        for (let x = 0; x <= w; x += 10) {
          const y =
            h * (0.15 + 0.7 * ((i + 0.5) / n)) +
            Math.sin(x / 260 + phase + t * sp) * 60 * Math.sin(phase + t * sp * 0.5) +
            smoothNoise(x / 500 + i, t * sp * 0.3) * 120 -
            60;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [cs.join(), n, sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

export function Beams({ active, color, count }: BgProps) {
  const c = typeof color === "string" ? color : "#60a5fa";
  const n = asNum(count, 7);
  const beams = useRef(
    Array.from({ length: n }, (_, i) => ({
      x: (i + 0.5) / n + (Math.random() - 0.5) * 0.08,
      y: -Math.random(),
      v: 0.15 + Math.random() * 0.25,
      len: 0.15 + Math.random() * 0.2,
    })),
  );
  const ref = useCanvas(
    active,
    (ctx, w, h, _t, dt) => {
      ctx.clearRect(0, 0, w, h);
      for (const b of beams.current) {
        b.y += b.v * dt;
        if (b.y > 1.2) b.y = -b.len - Math.random() * 0.5;
        const g = ctx.createLinearGradient(0, b.y * h, 0, (b.y + b.len) * h);
        g.addColorStop(0, "transparent");
        g.addColorStop(1, c);
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x * w, b.y * h);
        ctx.lineTo(b.x * w, (b.y + b.len) * h);
        ctx.stroke();
      }
    },
    [c, n],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

export function Sparkles({ active, color, density, size }: BgProps) {
  const c = typeof color === "string" ? color : "#3b82f6";
  const n = asNum(density, 400);
  const maxSize = asNum(size, 1.6);
  const parts = useRef<
    { x: number; y: number; r: number; a: number; s: number; vx: number; vy: number }[] | null
  >(null);
  const ref = useCanvas(
    active,
    (ctx, w, h, _t, dt) => {
      parts.current ??= Array.from({ length: n }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 0.4 + Math.random() * maxSize,
        a: Math.random(),
        s: 0.3 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.01,
        vy: (Math.random() - 0.5) * 0.01,
      }));
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = c;
      for (const p of parts.current) {
        p.a += p.s * dt;
        p.x = (p.x + p.vx * dt + 1) % 1;
        p.y = (p.y + p.vy * dt + 1) % 1;
        ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(p.a));
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [c, n, maxSize],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

export function Starfield({ active, color, count }: BgProps) {
  const c = typeof color === "string" ? color : "#ffffff";
  const n = asNum(count, 240);
  const stars = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const ref = useCanvas(
    active,
    (ctx, w, h, _t, dt) => {
      stars.current ??= Array.from({ length: n }, () => ({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random(),
      }));
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = c;
      for (const s of stars.current) {
        s.z -= dt * 0.08;
        if (s.z <= 0.02) {
          s.x = Math.random() * 2 - 1;
          s.y = Math.random() * 2 - 1;
          s.z = 1;
        }
        const px = w / 2 + (s.x / s.z) * w * 0.5;
        const py = h / 2 + (s.y / s.z) * h * 0.5;
        const r = (1 - s.z) * 2.2;
        if (px < 0 || px > w || py < 0 || py > h) continue;
        ctx.globalAlpha = 1 - s.z;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [c, n],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

export function GridBg({ color, size }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(127,127,127,0.25)";
  const s = asNum(size, 48);
  return (
    <div
      className="deck-bg-grid"
      style={{
        backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,
        backgroundSize: `${s}px ${s}px`,
      }}
    />
  );
}

export function DotsBg({ color, size }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(127,127,127,0.35)";
  const s = asNum(size, 28);
  return (
    <div
      className="deck-bg-grid"
      style={{
        backgroundImage: `radial-gradient(${c} 1.5px, transparent 1.5px)`,
        backgroundSize: `${s}px ${s}px`,
      }}
    />
  );
}

export function NoiseBg({ opacity }: BgProps) {
  const o = asNum(opacity, 0.12);
  return <div className="deck-bg-noise" style={{ opacity: o }} />;
}

export function SpotlightBg({ color, x, y }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(59,130,246,0.35)";
  return (
    <div
      className="deck-bg-spot"
      style={{
        background: `radial-gradient(circle at ${asNum(x, 50)}% ${asNum(y, 40)}%, ${c}, transparent 55%)`,
      }}
    />
  );
}

registerBackground("gradient-mesh", GradientMesh);
registerBackground("mesh", GradientMesh);
registerBackground("aurora", Aurora);
registerBackground("waves", Waves);
registerBackground("lines", Lines);
registerBackground("beams", Beams);
registerBackground("sparkles", Sparkles);
registerBackground("starfield", Starfield);
registerBackground("grid", GridBg);
registerBackground("dots", DotsBg);
registerBackground("noise", NoiseBg);
registerBackground("spotlight", SpotlightBg);

/** A split-flap departure board that flips to its text — the RLA deck's `TextFlippingBoard`. */
export function FlipBoard({
  text,
  rows,
  cols,
  className,
  flipDuration = 35,
  stagger = 15,
}: {
  text: string;
  rows?: number;
  cols?: number;
  className?: string;
  flipDuration?: number;
  stagger?: number;
}) {
  const lines = text.split("\n");
  const c = cols ?? Math.max(...lines.map((l) => l.length));
  const r = rows ?? lines.length;
  const cells: string[] = [];
  for (let i = 0; i < r; i++) {
    const line = (lines[i] ?? "").padEnd(c, " ");
    for (let j = 0; j < c; j++) cells.push(line[j] ?? " ");
  }
  return (
    <div
      className={["deck-flipboard", className].filter(Boolean).join(" ")}
      style={
        {
          gridTemplateColumns: `repeat(${c}, 1fr)`,
          "--flip": `${flipDuration}ms`,
          "--stagger": `${stagger}ms`,
        } as React.CSSProperties
      }
    >
      {cells.map((ch, i) => (
        <span
          key={i}
          className="deck-flip-cell"
          style={{ animationDelay: `${(i % c) * stagger + Math.floor(i / c) * stagger * 2}ms` }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

/* ── the second set: quieter, more designed ─────────────────────────────── */

/** Contour lines from a noise field — the map-sheet look. */
export function Topo({ active, color, levels, speed, spacing, width, index }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(127,127,127,0.5)";
  const n = asNum(levels, 14);
  const sp = asNum(speed, 0.15);
  const cell = asNum(spacing, 26);
  const lw = asNum(width, 1);
  const every = Math.max(2, asNum(index, 4));
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / cell) + 1;
      const rows = Math.ceil(h / cell) + 1;
      const f = new Float32Array(cols * rows);
      const z = t * sp;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++)
          f[j * cols + i] =
            smoothNoise(i * 0.09 + z * 0.3, j * 0.09 + z * 0.17) * 0.6 +
            smoothNoise(i * 0.03 - z * 0.1, j * 0.03) * 0.4;
      ctx.strokeStyle = c;
      for (let k = 1; k < n; k++) {
        const iso = k / n;
        // Index contours, as on a real sheet: every nth line heavier.
        const isIndex = k % every === 0;
        ctx.lineWidth = isIndex ? lw * 1.8 : lw;
        ctx.globalAlpha = isIndex ? 1 : 0.55;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++)
          for (let i = 0; i < cols - 1; i++) {
            const a = f[j * cols + i]!;
            const b = f[j * cols + i + 1]!;
            const d = f[(j + 1) * cols + i + 1]!;
            const e = f[(j + 1) * cols + i]!;
            const x = i * cell;
            const y = j * cell;
            const pts: [number, number][] = [];
            const lerp = (p: number, q: number) => (iso - p) / (q - p);
            if (a < iso !== b < iso) pts.push([x + lerp(a, b) * cell, y]);
            if (b < iso !== d < iso) pts.push([x + cell, y + lerp(b, d) * cell]);
            if (e < iso !== d < iso) pts.push([x + lerp(e, d) * cell, y + cell]);
            if (a < iso !== e < iso) pts.push([x, y + lerp(a, e) * cell]);
            if (pts.length >= 2) {
              ctx.moveTo(pts[0]![0], pts[0]![1]);
              ctx.lineTo(pts[1]![0], pts[1]![1]);
              if (pts.length === 4) {
                ctx.moveTo(pts[2]![0], pts[2]![1]);
                ctx.lineTo(pts[3]![0], pts[3]![1]);
              }
            }
          }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [c, n, sp, cell, lw, every],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/** A few large soft lights drifting — like mesh, but sparser and calmer. */
export function Glows({ active, colors, opacity, speed }: BgProps) {
  const cs = asList(colors, ["#059669", "#3b82f6", "#f59e0b"]);
  const op = asNum(opacity, 0.35);
  const sp = asNum(speed, 1);
  return (
    <div
      className="deck-bg-glows"
      data-active={active !== false || undefined}
      style={{ "--speed": `${60 / sp}s`, opacity: op } as React.CSSProperties}
    >
      {cs.map((c, i) => (
        <span
          key={i}
          style={{
            background: `radial-gradient(circle, ${c} 0, transparent 60%)`,
            left: `${10 + ((i * 41) % 70)}%`,
            top: `${10 + ((i * 59) % 60)}%`,
            animationDelay: `${-i * 9}s`,
          }}
        />
      ))}
    </div>
  );
}

/** A graticule: fine grid with major lines every n cells and ticks — the map-projection look. */
export function Graticule({ color, size, major }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(127,127,127,0.28)";
  const s = asNum(size, 40);
  const m = asNum(major, 5);
  const ref = useCanvas(
    false,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = c;
      for (let x = 0, i = 0; x <= w; x += s, i++) {
        ctx.globalAlpha = i % m === 0 ? 0.9 : 0.35;
        ctx.lineWidth = i % m === 0 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0, j = 0; y <= h; y += s, j++) {
        ctx.globalAlpha = j % m === 0 ? 0.9 : 0.35;
        ctx.lineWidth = j % m === 0 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = c;
      ctx.font = "10px ui-monospace, monospace";
      for (let x = 0, i = 0; x <= w; x += s * m, i++) ctx.fillText(String(i * m), x + 4, 12);
      for (let y = s * m, j = 1; y <= h; y += s * m, j++) ctx.fillText(String(j * m), 4, y - 4);
      ctx.globalAlpha = 1;
    },
    [c, s, m],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/** A honeycomb. */
export function Hex({ color, size }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(127,127,127,0.25)";
  const r = asNum(size, 28);
  const ref = useCanvas(
    false,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      const dx = r * Math.sqrt(3);
      const dy = r * 1.5;
      for (let j = -1; j * dy < h + r; j++)
        for (let i = -1; i * dx < w + dx; i++) {
          const cx = i * dx + (j % 2 ? dx / 2 : 0);
          const cy = j * dy;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k + Math.PI / 6;
            const px = cx + r * Math.cos(a);
            const py = cy + r * Math.sin(a);
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
    },
    [c, r],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/** Drifting points joined when close — a constellation / network. */
export function Constellation({ active, color, count, reach }: BgProps) {
  const c = typeof color === "string" ? color : "#3b82f6";
  const n = asNum(count, 70);
  const rr = asNum(reach, 140);
  const pts = useRef<{ x: number; y: number; vx: number; vy: number }[] | null>(null);
  const ref = useCanvas(
    active,
    (ctx, w, h, _t, dt) => {
      pts.current ??= Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
      }));
      const p = pts.current;
      ctx.clearRect(0, 0, w, h);
      for (const q of p) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.x < 0 || q.x > w) q.vx *= -1;
        if (q.y < 0 || q.y > h) q.vy *= -1;
      }
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) {
          const dx = p[i]!.x - p[j]!.x;
          const dy = p[i]!.y - p[j]!.y;
          const d = Math.hypot(dx, dy);
          if (d < rr) {
            ctx.globalAlpha = (1 - d / rr) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p[i]!.x, p[i]!.y);
            ctx.lineTo(p[j]!.x, p[j]!.y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(p[i]!.x, p[i]!.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [c, n, rr],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/** Darkened edges, so the middle glows. */
export function Vignette({ color, strength }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(0,0,0,1)";
  const s = asNum(strength, 0.35);
  return (
    <div
      className="deck-bg-vignette"
      style={{
        background: `radial-gradient(ellipse at center, transparent 45%, ${c} 130%)`,
        opacity: s,
      }}
    />
  );
}

/** Light rays from a corner, turning very slowly. */
export function Rays({ active, color, x, y, opacity }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(255,255,255,0.35)";
  return (
    <div
      className="deck-bg-rays"
      data-active={active !== false || undefined}
      style={
        {
          "--rays-x": `${asNum(x, 20)}%`,
          "--rays-y": `${asNum(y, -10)}%`,
          "--rays-c": c,
          opacity: asNum(opacity, 0.5),
        } as React.CSSProperties
      }
    />
  );
}

/** Fine diagonal stripes. */
export function Stripes({ color, size, angle }: BgProps) {
  const c = typeof color === "string" ? color : "rgba(127,127,127,0.12)";
  const s = asNum(size, 14);
  return (
    <div
      className="deck-bg-grid"
      style={{
        backgroundImage: `repeating-linear-gradient(${asNum(angle, 45)}deg, ${c} 0 1px, transparent 1px ${s}px)`,
      }}
    />
  );
}

/** A slow sweep across two or three colours — the classic animated gradient. */
export function GradientSweep({ active, colors, speed, angle }: BgProps) {
  const cs = asList(colors, ["#0f172a", "#1e3a8a", "#0f766e"]);
  return (
    <div
      className="deck-bg-sweep"
      data-active={active !== false || undefined}
      style={
        {
          backgroundImage: `linear-gradient(${asNum(angle, 120)}deg, ${cs.join(", ")}, ${cs[0]})`,
          "--speed": `${24 / asNum(speed, 1)}s`,
        } as React.CSSProperties
      }
    />
  );
}

registerBackground("topo", Topo);
registerBackground("contours", Topo);
registerBackground("glows", Glows);
registerBackground("graticule", Graticule);
registerBackground("hex", Hex);
registerBackground("constellation", Constellation);
registerBackground("vignette", Vignette);
registerBackground("rays", Rays);
registerBackground("stripes", Stripes);
registerBackground("sweep", GradientSweep);
