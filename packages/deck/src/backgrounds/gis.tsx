import { useEffect, useRef, useState } from "react";

import { registerBackground } from "../react/Backgrounds.tsx";
import { type BgProps, asNum, asStr, smoothNoise, useCanvas } from "./shared.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GIS BACKGROUNDS  —  the map room's furniture
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   globe       a wire globe off to one side, turning slowly about a tilted axis, with a day
 *               side and a night side                                    (color, x, y, radius, tilt, speed, step)
 *   lattice     a grid that keeps zooming into one of its cells, three levels deep — the
 *               nested address                                           (color, accent, size, sub, period)
 *   thiessen    seeds drifting under their Voronoi (Thiessen) polygons   (color, accent, count, speed)
 *   cells       a lattice where reports land: cells light up, ripple, and go dark again;
 *               a few neighbours at once make an outage                  (color, accent, size, rate, life)
 *   compass     a compass rose with its degree ring turning              (color, accent, x, y, radius, speed)
 *   neatline    a map sheet's frame: double neatline, coordinate ticks, north arrow, scale bar
 *                                                                        (color, inset, step, lat, lon)
 *   scan        a graticule swept by a satellite pass                    (color, accent, size, major, speed)
 *   track       a GPS trail wandering with a pulsing head                (color, accent, speed, width)
 *   raster      a choropleth: cells classed by a slowly drifting field, like a population
 *               raster with its legend                                    (color, size, classes, speed)
 *   plane       a dotted ground plane in oblique projection — the lattice a figure stands on —
 *               with registration tics and one slow sweep of light; it locks onto a figure that
 *               marks its own origin            (color, accent, size, shear, rise, major, x, y, horizon, focus, speed)
 *
 * All canvas, all calm: a turn of the globe takes about a minute. Colours are given as CSS
 * strings (`rgba(...)` is the usual way to set their weight), motion pauses off-slide and is a
 * still frame under prefers-reduced-motion (see `useCanvas`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

/* ── globe ────────────────────────────────────────────────────────────────── */

export function Globe({ active, color, x, y, radius, tilt, speed, step, opacity }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.55)");
  const cx = asNum(x, 0.82);
  const cy = asNum(y, 0.45);
  const rr = asNum(radius, 0.62);
  const tl = asNum(tilt, 23) * RAD;
  const sp = asNum(speed, 6) * RAD; // degrees per second
  const st = asNum(step, 15);
  const op = asNum(opacity, 1);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const R = rr * h;
      const X = cx * w;
      const Y = cy * h;
      const spin = t * sp;
      const ct = Math.cos(tl);
      const stl = Math.sin(tl);
      // A point on the unit sphere → screen, after the spin (about the pole) and the tilt.
      const project = (lat: number, lon: number) => {
        const lo = lon + spin;
        const px = Math.cos(lat) * Math.sin(lo);
        const py = Math.sin(lat);
        const pz = Math.cos(lat) * Math.cos(lo);
        const y2 = py * ct - pz * stl;
        const z2 = py * stl + pz * ct;
        return { sx: X + R * px, sy: Y - R * y2, z: z2 };
      };
      const line = (
        points: { sx: number; sy: number; z: number }[],
        widthFront: number,
        alphaFront: number,
      ) => {
        // Front and back are drawn separately: the back at a whisper, the front fading to the limb.
        for (const side of [false, true]) {
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i < points.length; i++) {
            const p = points[i]!;
            const front = p.z > 0;
            if (front !== side || (i > 0 && points[i - 1]!.z > 0 !== side)) {
              pen = false;
              continue;
            }
            if (!pen) {
              ctx.moveTo(p.sx, p.sy);
              pen = true;
            } else ctx.lineTo(p.sx, p.sy);
          }
          ctx.lineWidth = side ? widthFront : Math.max(0.5, widthFront * 0.6);
          ctx.globalAlpha = (side ? alphaFront : 0.12) * op;
          ctx.stroke();
        }
      };
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      // the night side: a soft shade across the disc
      ctx.save();
      ctx.beginPath();
      ctx.arc(X, Y, R, 0, TAU);
      ctx.clip();
      const g = ctx.createLinearGradient(X - R * 0.9, Y - R * 0.6, X + R * 0.9, Y + R * 0.6);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.55, "rgba(0,0,0,0)");
      g.addColorStop(1, c);
      ctx.globalAlpha = 0.28 * op;
      ctx.fillStyle = g;
      ctx.fillRect(X - R, Y - R, R * 2, R * 2);
      ctx.restore();
      ctx.fillStyle = c;
      // parallels
      for (let latDeg = -90 + st; latDeg < 90; latDeg += st) {
        const lat = latDeg * RAD;
        const pts = [];
        for (let lonDeg = 0; lonDeg <= 360; lonDeg += 3) pts.push(project(lat, lonDeg * RAD));
        const special = latDeg === 0 ? 1.8 : Math.abs(Math.abs(latDeg) - 23.4) < st / 2 ? 1.3 : 0.9;
        line(pts, special, latDeg === 0 ? 1 : 0.7);
      }
      // the tropics and the polar circles, where they fall between the steps
      for (const latDeg of [23.44, -23.44, 66.56, -66.56]) {
        const pts = [];
        for (let lonDeg = 0; lonDeg <= 360; lonDeg += 3)
          pts.push(project(latDeg * RAD, lonDeg * RAD));
        ctx.setLineDash([4, 6]);
        line(pts, 1, 0.55);
        ctx.setLineDash([]);
      }
      // meridians
      for (let lonDeg = 0; lonDeg < 360; lonDeg += st) {
        const pts = [];
        for (let latDeg = -90; latDeg <= 90; latDeg += 3)
          pts.push(project(latDeg * RAD, lonDeg * RAD));
        line(pts, lonDeg % 90 === 0 ? 1.3 : 0.9, lonDeg % 90 === 0 ? 0.9 : 0.6);
      }
      // the limb and the poles
      ctx.globalAlpha = op;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(X, Y, R, 0, TAU);
      ctx.stroke();
      for (const lat of [90, -90]) {
        const p = project(lat * RAD, 0);
        if (p.z > 0) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
    [c, cx, cy, rr, tl, sp, st, op],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── lattice ──────────────────────────────────────────────────────────────── */

export function Lattice({ active, color, accent, size, sub, period }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.35)");
  const a = asStr(accent, "rgba(124,58,237,0.9)");
  const cell = asNum(size, 96);
  const n = Math.max(2, Math.round(asNum(sub, 4)));
  const per = asNum(period, 9);
  const pick = useRef<{
    i: number;
    j: number;
    si: number;
    sj: number;
    ti: number;
    tj: number;
    at: number;
  } | null>(null);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const rnd = (m: number) => Math.floor(Math.random() * m);
      if (!pick.current || t - pick.current.at > per)
        pick.current = {
          i: 1 + rnd(Math.max(1, cols - 2)),
          j: 1 + rnd(Math.max(1, rows - 2)),
          si: rnd(n),
          sj: rnd(n),
          ti: rnd(n),
          tj: rnd(n),
          at: t,
        };
      const pk = pick.current;
      const phase = (t - pk.at) / per;
      const fade = phase < 0.12 ? phase / 0.12 : phase > 0.88 ? (1 - phase) / 0.12 : 1;
      // the coarse grid
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        ctx.moveTo(i * cell + 0.5, 0);
        ctx.lineTo(i * cell + 0.5, h);
      }
      for (let j = 0; j <= rows; j++) {
        ctx.moveTo(0, j * cell + 0.5);
        ctx.lineTo(w, j * cell + 0.5);
      }
      ctx.stroke();
      // level 1: the chosen cell, subdivided
      const x1 = pk.i * cell;
      const y1 = pk.j * cell;
      ctx.globalAlpha = 0.1 * fade;
      ctx.fillStyle = a;
      ctx.fillRect(x1, y1, cell, cell);
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = a;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1 + 0.5, y1 + 0.5, cell, cell);
      const s1 = cell / n;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.55 * fade;
      ctx.beginPath();
      for (let k = 1; k < n; k++) {
        ctx.moveTo(x1 + k * s1, y1);
        ctx.lineTo(x1 + k * s1, y1 + cell);
        ctx.moveTo(x1, y1 + k * s1);
        ctx.lineTo(x1 + cell, y1 + k * s1);
      }
      ctx.stroke();
      // level 2: one sub-cell, subdivided again
      const x2 = x1 + pk.si * s1;
      const y2 = y1 + pk.sj * s1;
      ctx.globalAlpha = 0.2 * fade;
      ctx.fillRect(x2, y2, s1, s1);
      ctx.globalAlpha = 0.9 * fade;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x2 + 0.5, y2 + 0.5, s1, s1);
      const s2 = s1 / n;
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = 0.5 * fade;
      ctx.beginPath();
      for (let k = 1; k < n; k++) {
        ctx.moveTo(x2 + k * s2, y2);
        ctx.lineTo(x2 + k * s2, y2 + s1);
        ctx.moveTo(x2, y2 + k * s2);
        ctx.lineTo(x2 + s1, y2 + k * s2);
      }
      ctx.stroke();
      // level 3: the spot
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillRect(x2 + pk.ti * s2, y2 + pk.tj * s2, s2, s2);
      // a leader from the coarse cell's corner out to the spot, like a callout
      ctx.globalAlpha = 0.5 * fade;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(x1 + cell, y1);
      ctx.lineTo(x2 + pk.ti * s2 + s2 / 2, y2 + pk.tj * s2 + s2 / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    [c, a, cell, n, per],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── thiessen ─────────────────────────────────────────────────────────────── */

type Pt = [number, number];

/** Clip a polygon to the half-plane of points nearer `a` than `b` (Sutherland–Hodgman). */
function nearerHalf(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const side = (p: Pt) => (p[0] - mx) * dx + (p[1] - my) * dy;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const u = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
    }
  }
  return out;
}

export function Thiessen({ active, color, accent, count, speed }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.5)");
  const a = asStr(accent, "rgba(13,148,136,0.9)");
  const n = Math.max(3, Math.round(asNum(count, 22)));
  const sp = asNum(speed, 5);
  const seeds = useRef<{ x: number; y: number; vx: number; vy: number; hue: number }[] | null>(
    null,
  );
  const ref = useCanvas(
    active,
    (ctx, w, h, t, dt) => {
      seeds.current ??= Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 2 * sp,
        vy: (Math.random() - 0.5) * 2 * sp,
        hue: Math.random(),
      }));
      const s = seeds.current;
      for (const q of s) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.x < 0 || q.x > w) q.vx *= -1;
        if (q.y < 0 || q.y > h) q.vy *= -1;
      }
      ctx.clearRect(0, 0, w, h);
      const m = Math.max(w, h);
      for (let i = 0; i < s.length; i++) {
        let poly: Pt[] = [
          [-m, -m],
          [w + m, -m],
          [w + m, h + m],
          [-m, h + m],
        ];
        const si: Pt = [s[i]!.x, s[i]!.y];
        for (let j = 0; j < s.length && poly.length; j++) {
          if (j === i) continue;
          poly = nearerHalf(poly, si, [s[j]!.x, s[j]!.y]);
        }
        if (poly.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0]![0], poly[0]![1]);
        for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k]![0], poly[k]![1]);
        ctx.closePath();
        // a slow breath of fill per cell, so the mosaic is alive without a single thing moving fast
        ctx.fillStyle = a;
        ctx.globalAlpha = 0.04 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.4 + s[i]!.hue * TAU));
        ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        // the seed: a substation — a dot in a ring
        ctx.fillStyle = a;
        ctx.strokeStyle = a;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(si[0], si[1], 2.6, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(si[0], si[1], 7, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [c, a, n, sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── cells ────────────────────────────────────────────────────────────────── */

interface Report {
  i: number;
  j: number;
  at: number;
  big: boolean;
}

export function Cells({ active, color, accent, size, rate, life }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.3)");
  const a = asStr(accent, "rgba(219,39,119,0.9)");
  const cell = asNum(size, 30);
  const rt = asNum(rate, 0.9); // reports per second
  const lf = asNum(life, 7); // seconds a report stays lit
  const reports = useRef<Report[]>([]);
  const ref = useCanvas(
    active,
    (ctx, w, h, t, dt) => {
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const list = reports.current;
      // new reports: usually one cell, now and then a small cluster — an outage
      if (Math.random() < rt * dt) {
        const i = Math.floor(Math.random() * cols);
        const j = Math.floor(Math.random() * rows);
        const big = Math.random() < 0.22;
        list.push({ i, j, at: t, big });
        if (big)
          for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++)
            list.push({
              i: i + Math.floor(Math.random() * 3) - 1,
              j: j + Math.floor(Math.random() * 3) - 1,
              at: t + k * 0.35,
              big: true,
            });
      }
      while (list.length && t - list[0]!.at > lf + 1) list.shift();
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = c;
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        ctx.moveTo(i * cell + 0.5, 0);
        ctx.lineTo(i * cell + 0.5, h);
      }
      for (let j = 0; j <= rows; j++) {
        ctx.moveTo(0, j * cell + 0.5);
        ctx.lineTo(w, j * cell + 0.5);
      }
      ctx.stroke();
      for (const r of list) {
        const age = t - r.at;
        if (age < 0) continue;
        const x = r.i * cell;
        const y = r.j * cell;
        const fade =
          age < 0.4 ? age / 0.4 : age > lf ? Math.max(0, 1 - (age - lf)) : 1 - (age / lf) * 0.5;
        ctx.fillStyle = a;
        ctx.globalAlpha = (r.big ? 0.75 : 0.5) * fade;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        // the ripple a fresh report sends out
        if (age < 1.4) {
          const rr = (age / 1.4) * cell * 2.2;
          ctx.strokeStyle = a;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = (1 - age / 1.4) * 0.8;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, rr, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },
    [c, a, cell, rt, lf],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── compass ──────────────────────────────────────────────────────────────── */

export function Compass({ active, color, accent, x, y, radius, speed }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.5)");
  const a = asStr(accent, "rgba(220,38,38,0.85)");
  const cx = asNum(x, 0.84);
  const cy = asNum(y, 0.52);
  const rr = asNum(radius, 0.42);
  const sp = asNum(speed, 3) * RAD;
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const R = rr * h;
      const X = cx * w;
      const Y = cy * h;
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      // the degree ring, turning
      const rot = t * sp;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(X, Y, R, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X, Y, R * 0.86, 0, TAU);
      ctx.stroke();
      for (let d = 0; d < 360; d += 5) {
        const ang = d * RAD - Math.PI / 2 + rot;
        const major = d % 30 === 0;
        const len = major ? R * 0.07 : d % 10 === 0 ? R * 0.045 : R * 0.025;
        ctx.lineWidth = major ? 1.6 : 0.8;
        ctx.globalAlpha = major ? 0.9 : 0.5;
        ctx.beginPath();
        ctx.moveTo(X + Math.cos(ang) * R, Y + Math.sin(ang) * R);
        ctx.lineTo(X + Math.cos(ang) * (R - len), Y + Math.sin(ang) * (R - len));
        ctx.stroke();
        if (major) {
          ctx.globalAlpha = 0.75;
          ctx.font = `${Math.max(10, R * 0.05)}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(d), X + Math.cos(ang) * R * 0.93, Y + Math.sin(ang) * R * 0.93);
        }
      }
      // the rose: eight points, alternating filled and open
      const rose = (
        points: number,
        outer: number,
        inner: number,
        offset: number,
        fill: boolean,
      ) => {
        for (let k = 0; k < points; k++) {
          const ang = (k / points) * TAU - Math.PI / 2 + offset;
          const mid = ang + Math.PI / points;
          const mid2 = ang - Math.PI / points;
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.lineTo(X + Math.cos(mid2) * inner, Y + Math.sin(mid2) * inner);
          ctx.lineTo(X + Math.cos(ang) * outer, Y + Math.sin(ang) * outer);
          ctx.lineTo(X + Math.cos(mid) * inner, Y + Math.sin(mid) * inner);
          ctx.closePath();
          ctx.globalAlpha = fill ? 0.35 : 0.9;
          ctx.lineWidth = 1;
          if (fill && k % 2 === 0) ctx.fill();
          else ctx.stroke();
        }
      };
      rose(8, R * 0.62, R * 0.18, Math.PI / 8, true);
      rose(4, R * 0.8, R * 0.22, 0, true);
      // the needle, wandering a little and settling on north
      const wander = (smoothNoise(t * 0.15, 3.7) - 0.5) * 14 * RAD;
      const nd = -Math.PI / 2 + wander;
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(X + Math.cos(nd) * R * 0.7, Y + Math.sin(nd) * R * 0.7);
      ctx.lineTo(
        X + Math.cos(nd + Math.PI / 2) * R * 0.04,
        Y + Math.sin(nd + Math.PI / 2) * R * 0.04,
      );
      ctx.lineTo(
        X + Math.cos(nd - Math.PI / 2) * R * 0.04,
        Y + Math.sin(nd - Math.PI / 2) * R * 0.04,
      );
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(X - Math.cos(nd) * R * 0.7, Y - Math.sin(nd) * R * 0.7);
      ctx.lineTo(
        X + Math.cos(nd + Math.PI / 2) * R * 0.04,
        Y + Math.sin(nd + Math.PI / 2) * R * 0.04,
      );
      ctx.lineTo(
        X + Math.cos(nd - Math.PI / 2) * R * 0.04,
        Y + Math.sin(nd - Math.PI / 2) * R * 0.04,
      );
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(X, Y, R * 0.03, 0, TAU);
      ctx.fill();
      // N
      ctx.font = `bold ${Math.max(12, R * 0.11)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.9;
      ctx.fillText("N", X, Y - R * 0.72);
      ctx.globalAlpha = 1;
    },
    [c, a, cx, cy, rr, sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── neatline ─────────────────────────────────────────────────────────────── */

export function Neatline({ color, inset, step, lat, lon }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.55)");
  const ins = asNum(inset, 0.045);
  const st = asNum(step, 48);
  const lat0 = asNum(lat, 13.0);
  const lon0 = asNum(lon, 80.1);
  const ref = useCanvas(
    false,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const m = Math.min(w, h) * ins;
      const x0 = m;
      const y0 = m;
      const x1 = w - m;
      const y1 = h - m;
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(x0 + 8.5, y0 + 8.5, x1 - x0 - 16, y1 - y0 - 16);
      // ticks and coordinates along every edge
      ctx.font = "10px ui-monospace, monospace";
      ctx.textBaseline = "middle";
      let k = 0;
      for (let x = x0; x <= x1; x += st, k++) {
        const major = k % 5 === 0;
        const len = major ? 10 : 5;
        ctx.lineWidth = major ? 1.2 : 0.7;
        ctx.globalAlpha = major ? 0.9 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y0);
        ctx.lineTo(x + 0.5, y0 - len);
        ctx.moveTo(x + 0.5, y1);
        ctx.lineTo(x + 0.5, y1 + len);
        ctx.stroke();
        if (major && x > x0 + st && x < x1 - st) {
          ctx.textAlign = "center";
          const label = `${(lon0 + (k / 5) * 0.05).toFixed(2)}°E`;
          ctx.fillText(label, x, y0 - 18);
          ctx.fillText(label, x, y1 + 18);
        }
      }
      k = 0;
      for (let y = y1; y >= y0; y -= st, k++) {
        const major = k % 5 === 0;
        const len = major ? 10 : 5;
        ctx.lineWidth = major ? 1.2 : 0.7;
        ctx.globalAlpha = major ? 0.9 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x0, y + 0.5);
        ctx.lineTo(x0 - len, y + 0.5);
        ctx.moveTo(x1, y + 0.5);
        ctx.lineTo(x1 + len, y + 0.5);
        ctx.stroke();
        if (major && y < y1 - st && y > y0 + st) {
          ctx.save();
          ctx.translate(x0 - 18, y);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = "center";
          ctx.fillText(`${(lat0 + (k / 5) * 0.05).toFixed(2)}°N`, 0, 0);
          ctx.restore();
          ctx.save();
          ctx.translate(x1 + 18, y);
          ctx.rotate(Math.PI / 2);
          ctx.textAlign = "center";
          ctx.fillText(`${(lat0 + (k / 5) * 0.05).toFixed(2)}°N`, 0, 0);
          ctx.restore();
        }
      }
      // north arrow, top right inside the frame
      const ax = x1 - 44;
      const ay = y0 + 60;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 26);
      ctx.lineTo(ax + 9, ay + 10);
      ctx.lineTo(ax, ay + 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax, ay - 26);
      ctx.lineTo(ax - 9, ay + 10);
      ctx.lineTo(ax, ay + 2);
      ctx.closePath();
      ctx.stroke();
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", ax, ay - 36);
      // scale bar, bottom left inside the frame
      const sx = x0 + 28;
      const sy = y1 - 30;
      const unit = st * 2;
      ctx.font = "10px ui-monospace, monospace";
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 0.85;
        if (i % 2 === 0) ctx.fillRect(sx + i * unit, sy, unit, 5);
        else ctx.strokeRect(sx + i * unit + 0.5, sy + 0.5, unit, 5);
        ctx.textAlign = "center";
        ctx.fillText(String(i * 5), sx + i * unit, sy - 8);
      }
      ctx.fillText("20 km", sx + 4 * unit, sy - 8);
      ctx.globalAlpha = 1;
    },
    [c, ins, st, lat0, lon0],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── scan ─────────────────────────────────────────────────────────────────── */

export function Scan({ active, color, accent, size, major, speed }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.35)");
  const a = asStr(accent, "rgba(59,130,246,0.9)");
  const s = asNum(size, 48);
  const m = asNum(major, 5);
  const sp = asNum(speed, 40); // px per second
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = c;
      for (let x = 0, i = 0; x <= w; x += s, i++) {
        ctx.globalAlpha = i % m === 0 ? 0.9 : 0.4;
        ctx.lineWidth = i % m === 0 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0, j = 0; y <= h; y += s, j++) {
        ctx.globalAlpha = j % m === 0 ? 0.9 : 0.4;
        ctx.lineWidth = j % m === 0 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
      // two passes: a meridian sweeping east, a parallel sweeping south, on different periods
      const px = ((t * sp) % (w + 240)) - 120;
      const py = ((t * sp * 0.61) % (h + 240)) - 120;
      const band = (x: number, y: number, vertical: boolean) => {
        const g = vertical
          ? ctx.createLinearGradient(x - 90, 0, x + 30, 0)
          : ctx.createLinearGradient(0, y - 90, 0, y + 30);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.8, a);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.16;
        if (vertical) ctx.fillRect(x - 90, 0, 120, h);
        else ctx.fillRect(0, y - 90, w, 120);
        ctx.strokeStyle = a;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        } else {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      };
      band(px, 0, true);
      band(0, py, false);
      // the cell the two passes cross lights up
      const ci = Math.floor(px / s);
      const cj = Math.floor(py / s);
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(ci * s, cj * s, s, s);
      ctx.globalAlpha = 1;
    },
    [c, a, s, m, sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── track ────────────────────────────────────────────────────────────────── */

export function Track({ active, color, accent, speed, width }: BgProps) {
  const c = asStr(color, "rgba(127,127,127,0.6)");
  const a = asStr(accent, "rgba(5,150,105,0.9)");
  const sp = asNum(speed, 1);
  const lw = asNum(width, 2);
  const trail = useRef<{ pts: Pt[]; marks: Pt[]; lastMark: number }>({
    pts: [],
    marks: [],
    lastMark: 0,
  });
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      const tr = trail.current;
      const u = t * 0.06 * sp;
      const x = w * (0.1 + 0.8 * smoothNoise(u, 11.3));
      const y = h * (0.1 + 0.8 * smoothNoise(u + 5.2, 27.9));
      tr.pts.push([x, y]);
      if (tr.pts.length > 900) tr.pts.shift();
      if (t - tr.lastMark > 4) {
        tr.marks.push([x, y]);
        if (tr.marks.length > 12) tr.marks.shift();
        tr.lastMark = t;
      }
      ctx.clearRect(0, 0, w, h);
      // the trail, fading behind the head
      const n = tr.pts.length;
      for (let i = 1; i < n; i++) {
        ctx.strokeStyle = c;
        ctx.lineWidth = lw;
        ctx.globalAlpha = (i / n) * 0.9;
        ctx.beginPath();
        ctx.moveTo(tr.pts[i - 1]![0], tr.pts[i - 1]![1]);
        ctx.lineTo(tr.pts[i]![0], tr.pts[i]![1]);
        ctx.stroke();
      }
      // waypoints
      ctx.strokeStyle = a;
      ctx.lineWidth = 1.2;
      for (const [mx, my] of tr.marks) {
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, TAU);
        ctx.stroke();
      }
      // the head and its pulse
      ctx.fillStyle = a;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
      const pulse = (t * 0.8) % 1;
      ctx.globalAlpha = (1 - pulse) * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 6 + pulse * 22, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    [c, a, sp, lw],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── raster ───────────────────────────────────────────────────────────────── */

export function Raster({ active, color, size, classes, speed, opacity }: BgProps) {
  const c = asStr(color, "rgba(5,150,105,1)");
  const cell = asNum(size, 40);
  const k = Math.max(3, Math.round(asNum(classes, 6)));
  const sp = asNum(speed, 0.05);
  const op = asNum(opacity, 0.55);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const z = t * sp;
      ctx.fillStyle = c;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          // two octaves: broad districts with a finer grain, like settlement density
          const v =
            smoothNoise(i * 0.07 + z, j * 0.07 + z * 0.6) * 0.65 +
            smoothNoise(i * 0.21 - z * 0.4, j * 0.21 + z * 0.2) * 0.35;
          const cls = Math.min(k - 1, Math.floor(Math.pow(v, 1.6) * k));
          if (cls === 0) continue;
          ctx.globalAlpha = (cls / (k - 1)) * op;
          ctx.fillRect(i * cell, j * cell, cell, cell);
        }
      // the lattice over it
      ctx.strokeStyle = c;
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        ctx.moveTo(i * cell + 0.5, 0);
        ctx.lineTo(i * cell + 0.5, h);
      }
      for (let j = 0; j <= rows; j++) {
        ctx.moveTo(0, j * cell + 0.5);
        ctx.lineTo(w, j * cell + 0.5);
      }
      ctx.stroke();
      // a legend, bottom right, as on a sheet
      const lx = w - 24 - k * 22;
      const ly = h - 44;
      for (let q = 0; q < k; q++) {
        ctx.globalAlpha = (q / (k - 1)) * op;
        ctx.fillRect(lx + q * 22, ly, 20, 12);
        ctx.globalAlpha = 0.7;
        ctx.strokeRect(lx + q * 22 + 0.5, ly + 0.5, 20, 12);
      }
      ctx.globalAlpha = 0.8;
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("people / cell", lx, ly - 6);
      ctx.globalAlpha = 1;
    },
    [c, cell, k, sp, op],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── plane ────────────────────────────────────────────────────────────────── */

/**
 * The floor under an exploded figure: lattice points in the same oblique projection the figure
 * is drawn in (depth shears right by `shear` and rises by `rise`), so a stack of plates reads as
 * lifted off one endless grid.
 *
 * Three things keep it calm behind a slide that has words on it. Depth: dots shrink and fade
 * toward a `horizon`, so nothing reaches the title. Focus: the plane is strongest around `focus`
 * (a fraction of the width) and thins out sideways, so a legend beside the figure sits on nearly
 * clean paper. Motion: one soft band of light crosses the lattice every `speed` seconds, and that
 * is all that moves. Every `major`-th point is a control point — the surveyor's ring with a dot
 * at its centre — drawn as a circle lying in the plane, which is what makes the floor read as a
 * floor. (A cross lying in an oblique plane is a flattened ✕ and reads as a squiggle.)
 *
 * REGISTRATION. A figure can claim the floor: if the slide holds an element with
 * `data-plane="origin"` and one with `data-plane="unit"` (one cell along the front edge), the
 * lattice takes its origin and its cell size from them, every frame — so the figure's corners sit
 * on the floor's points in any theme, at any window size. Without them `x` and `y` (fractions of
 * the canvas) and `size` (the cell on a 1920-wide stage; it scales with the canvas) place it. A
 * canvas that is not animating paints one frame, usually before its slide has mounted — so it is
 * painted again a moment later, by which time the marks exist.
 */
export function Plane({
  active,
  color,
  accent,
  size,
  shear,
  rise,
  major,
  x,
  y,
  horizon,
  focus,
  speed,
}: BgProps) {
  const c = asStr(color, "rgba(100,116,139,0.55)");
  const a = asStr(accent, "rgba(13,148,136,0.9)");
  const cell = asNum(size, 36);
  const k = asNum(shear, 0.62);
  const m = asNum(rise, 0.3);
  const every = Math.max(2, Math.round(asNum(major, 4)));
  const fx = asNum(x, 0.05);
  const fy = asNum(y, 0.9);
  const hz = asNum(horizon, 0.24);
  const fc = asNum(focus, 0.3);
  const per = asNum(speed, 11);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // Two late repaints, for the still frame of a preview or of reduced motion (see REGISTRATION).
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    const timers = [350, 1400].map((ms) => window.setTimeout(() => setSettled((n) => n + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      let ox = fx * w;
      let oy = fy * h;
      let s = (cell * w) / 1920;

      // The figure's own datum, if the slide has one: the nearest container that holds both this
      // canvas and the marks (the stage, a mirror, a preview box — each keeps its own pair).
      const el = canvas.current;
      if (el) {
        let origin: Element | null = null;
        let unit: Element | null = null;
        for (let up = el.parentElement; up && !origin; up = up.parentElement) {
          origin = up.querySelector("[data-plane='origin']");
          unit = origin ? up.querySelector("[data-plane='unit']") : null;
        }
        const box = el.getBoundingClientRect();
        const scale = box.width / Math.max(1, w);
        if (origin && unit && scale > 0) {
          const o = origin.getBoundingClientRect();
          const u = unit.getBoundingClientRect();
          const step = (u.left + u.width / 2 - (o.left + o.width / 2)) / scale;
          if (step > 4) {
            ox = (o.left + o.width / 2 - box.left) / scale;
            oy = (o.top + o.height / 2 - box.top) / scale;
            s = step;
          }
        }
      }

      const dy = m * s; // a row's rise on screen
      const dx = k * s; // and its lean
      // Marks are sized against the cell, not the screen: on a phone the cell is a few pixels
      // wide, and dots that kept their size would close up into a carpet.
      const unit = Math.min(1.5, s / 36);
      const top = hz * h;
      const jMin = Math.floor((oy - h) / dy) - 1; // rows in front of the origin, down to the edge
      const jMax = Math.ceil((oy - top) / dy);
      const rows = jMax - jMin;
      // The sweep: a line of light that travels from the front-left to the back-right.
      const phase = per > 0 ? (t / per) % 1 : 0.42;
      const at = -0.25 + 1.5 * phase;

      for (let j = jMin; j <= jMax; j++) {
        const py = oy - j * dy;
        if (py < top - 2 || py > h + 4) continue;
        // 0 at the horizon, 1 at the front edge. The far rows melt in over the first eighth, then
        // the plane holds most of its weight all the way back: a floor, not a fringe.
        const near = Math.min(1, Math.max(0, (py - top) / (h - top)));
        const depth = Math.min(1, near / 0.125) * (0.42 + 0.58 * near);
        const iMin = Math.floor((0 - ox - j * dx) / s) - 1;
        const iMax = Math.ceil((w - ox - j * dx) / s) + 1;
        for (let i = iMin; i <= iMax; i++) {
          const px = ox + i * s + j * dx;
          if (px < -4 || px > w + 4) continue;
          const side = Math.abs(px / w - fc);
          const lateral = 0.16 + 0.84 * Math.exp(-((side / 0.34) ** 2));
          const n = ((j - jMin) / rows) * 0.7 + (px / w) * 0.3;
          // The sweep is a glint, not a band: the accent is laid over the dot in proportion to
          // the light (a hard switch of colour draws an edge the eye follows), the dot barely
          // grows, and it thins out sideways with the floor it belongs to.
          const lit = Math.exp(-(((n - at) / 0.05) ** 2)) * Math.sqrt(lateral);
          const alpha = depth * lateral;
          if (alpha < 0.02) continue;
          const isMajor = i % every === 0 && j % every === 0;
          const r = (1.05 + 1.5 * depth) * unit * (isMajor ? 1.15 : 1) * (1 + 0.22 * lit);
          ctx.globalAlpha = Math.min(1, alpha * 0.78);
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          if (lit > 0.04) {
            ctx.globalAlpha = Math.min(1, alpha * 0.85 * lit);
            ctx.fillStyle = a;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          }
          if (isMajor) {
            // A control point: a circle on the ground, so an ellipse under the plane's own shear.
            // The path is built inside the transform and stroked outside it, which keeps the
            // line an even width instead of thinning where the plane foreshortens it.
            const ring = s * (0.2 + 0.1 * depth);
            ctx.globalAlpha = Math.min(1, alpha * 0.9);
            ctx.strokeStyle = lit > 0.5 ? a : c;
            ctx.lineWidth = Math.max(0.5, 1.4 * unit);
            ctx.beginPath();
            ctx.save();
            ctx.transform(1, 0, k, -m, px, py);
            ctx.arc(0, 0, ring, 0, Math.PI * 2);
            ctx.restore();
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    },
    [c, a, cell, k, m, every, fx, fy, hz, fc, per, settled],
  );
  return (
    <canvas
      ref={(node) => {
        canvas.current = node;
        (ref as { current: HTMLCanvasElement | null }).current = node;
      }}
      className="deck-bg-canvas"
      data-bg="plane"
    />
  );
}

registerBackground("globe", Globe);
registerBackground("raster", Raster);
registerBackground("choropleth", Raster);
registerBackground("lattice", Lattice);
registerBackground("thiessen", Thiessen);
registerBackground("voronoi", Thiessen);
registerBackground("cells", Cells);
registerBackground("compass", Compass);
registerBackground("neatline", Neatline);
registerBackground("scan", Scan);
registerBackground("track", Track);
registerBackground("plane", Plane);
registerBackground("floor", Plane);
