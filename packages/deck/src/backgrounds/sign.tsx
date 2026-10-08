import { registerBackground } from "../react/Backgrounds.tsx";
import { type BgProps, asNum, asStr, smoothNoise, useCanvas } from "./shared.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SIGN-LANGUAGE BACKGROUNDS  —  what a recogniser sees
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Drawn the way a landmark tracker draws a signer: bones, joint dots, fingertips in the accent.
 * Every motion here is PROCEDURAL — handshapes, signing locations and movement paths are
 * generated, never copied from a corpus — so a public deck carries no one's recorded signing.
 *
 *   signer      a landmark skeleton signing: the dominant hand travels to a location (forehead,
 *               chin, chest, neutral space), takes a handshape, makes a small movement, and a
 *               fading trail follows the wrist        (color, accent, x, y, scale, speed, zones, trail)
 *   variants    one signer drawn as several synthetic variants at once — turned, re-proportioned
 *                                                     (color, accent, x, y, scale, count, speed)
 *   handshapes  a calm field of hands, each morphing through handshapes (open 5, B, fist, 1, V,
 *               L, Y, C, O, I) at its own pace         (color, accent, cols, rows, size, speed)
 *   trails      wrist movement paths through signing space, with a tick per frame; `align` adds
 *               a time-warped copy joined to the first by alignment lines (what DTW does)
 *                                                     (color, accent, count, speed, align)
 *   window      the recogniser's view: frames scrolling past, a 64-frame window hopping forward
 *               by its stride, and the motion energy above it     (color, accent, speed, y)
 *   embedding   word clusters around their prototypes, and a query that finds its nearest
 *                                                     (color, accent, count, speed)
 *
 * The time-dependent drawings are pure functions of t (trails are re-sampled, not accumulated),
 * so the still frame shown under reduced motion, in previews and in print is complete.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
type P2 = [number, number];
type P3 = [number, number, number];

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* ── the hand ─────────────────────────────────────────────────────────────── */

/**
 * A hand in its own frame: wrist at the origin, fingers up (−y), palm facing the viewer, one unit
 * ≈ the palm's length. Each digit is a base joint plus three segments — the tracker's 21 points
 * (0 wrist · 1–4 thumb · 5–8 index · 9–12 middle · 13–16 ring · 17–20 little).
 */
const DIGITS: Array<{
  base: P2;
  dir: number;
  lens: [number, number, number];
  curl: [number, number, number];
}> = [
  { base: [-0.24, -0.22], dir: -142, lens: [0.3, 0.27, 0.23], curl: [25, 40, 45] }, // thumb
  { base: [-0.27, -0.9], dir: -99, lens: [0.44, 0.26, 0.2], curl: [75, 95, 65] },
  { base: [-0.08, -0.97], dir: -91, lens: [0.48, 0.29, 0.21], curl: [75, 95, 65] },
  { base: [0.11, -0.93], dir: -83, lens: [0.44, 0.27, 0.2], curl: [75, 95, 65] },
  { base: [0.28, -0.82], dir: -74, lens: [0.35, 0.21, 0.18], curl: [75, 95, 65] },
];

/** Flexion per digit (0 = straight, 1 = fully curled) and spread (1 = fingers fanned). */
interface Shape {
  f: [number, number, number, number, number];
  spread: number;
}
const SHAPES: Record<string, Shape> = {
  five: { f: [0, 0, 0, 0, 0], spread: 1.25 },
  flat: { f: [0.55, 0, 0, 0, 0], spread: 0.35 },
  fist: { f: [0.55, 1, 1, 1, 1], spread: 0.5 },
  one: { f: [0.9, 0, 1, 1, 1], spread: 0.6 },
  vee: { f: [0.9, 0, 0, 1, 1], spread: 1.35 },
  ell: { f: [0, 0, 1, 1, 1], spread: 1 },
  why: { f: [0, 1, 1, 1, 0], spread: 1.3 },
  cee: { f: [0.25, 0.42, 0.42, 0.42, 0.42], spread: 0.55 },
  oh: { f: [0.55, 0.62, 0.62, 0.62, 0.62], spread: 0.45 },
  eye: { f: [0.9, 1, 1, 1, 0], spread: 0.8 },
};
const SHAPE_ORDER = ["five", "flat", "fist", "one", "vee", "ell", "why", "cee", "oh", "eye"];

function mixShape(a: Shape, b: Shape, k: number): Shape {
  return {
    f: a.f.map((v, i) => lerp(v, b.f[i]!, k)) as Shape["f"],
    spread: lerp(a.spread, b.spread, k),
  };
}

/** The 21 points of a hand in its own frame (3-D, before the pose). */
function handLocal(shape: Shape): P3[] {
  const pts: P3[] = [[0, 0, 0]];
  DIGITS.forEach((d, i) => {
    const flex = shape.f[i]!;
    const dirDeg = -90 + (d.dir + 90) * shape.spread;
    const thumb = i === 0;
    let x = d.base[0];
    let y = d.base[1];
    let z = 0;
    pts.push([x, y, z]);
    let bend = 0;
    for (let s = 0; s < 3; s++) {
      bend += d.curl[s]! * flex * RAD;
      // Fingers curl toward the palm (toward the viewer, −z); the thumb swings across the palm.
      const a = (dirDeg + (thumb ? 70 * flex * (s + 1) * 0.45 : 0)) * RAD;
      const cz = thumb ? Math.cos(bend * 0.6) : Math.cos(bend);
      const sz = thumb ? Math.sin(bend * 0.6) : Math.sin(bend);
      x += Math.cos(a) * cz * d.lens[s]!;
      y += Math.sin(a) * cz * d.lens[s]!;
      z -= sz * d.lens[s]!;
      pts.push([x, y, z]);
    }
  });
  return pts;
}

/** Turn (yaw about y, pitch about x, roll in the picture), scale and place: 21 screen points. */
function poseHand(
  local: P3[],
  at: P2,
  scale: number,
  roll: number,
  yaw: number,
  pitch: number,
  mirror = false,
): P2[] {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const cr = Math.cos(roll),
    sr = Math.sin(roll);
  return local.map(([x0, y, z]) => {
    const x = mirror ? -x0 : x0;
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    return [at[0] + (x1 * cr - y2 * sr) * scale, at[1] + (x1 * sr + y2 * cr) * scale];
  });
}

const HAND_BONES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];
const TIPS = [4, 8, 12, 16, 20];

function drawHand(
  ctx: CanvasRenderingContext2D,
  p: P2[],
  color: string,
  accent: string,
  lw: number,
  dot: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of HAND_BONES) {
    ctx.moveTo(p[a]![0], p[a]![1]);
    ctx.lineTo(p[b]![0], p[b]![1]);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < p.length; i++) {
    if (TIPS.includes(i)) continue;
    ctx.beginPath();
    ctx.arc(p[i]![0], p[i]![1], dot, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = accent;
  for (const i of TIPS) {
    ctx.beginPath();
    ctx.arc(p[i]![0], p[i]![1], dot * 1.35, 0, TAU);
    ctx.fill();
  }
}

/** The handshape a clock shows: dwell on each shape, then ease into the next. */
function shapeAt(t: number, period: number, offset = 0, order = SHAPE_ORDER): Shape {
  const u = t / period + offset;
  const i = Math.floor(u);
  const k = ease((u - i - 0.55) / 0.45);
  const a = SHAPES[order[((i % order.length) + order.length) % order.length]!]!;
  const b = SHAPES[order[(((i + 1) % order.length) + order.length) % order.length]!]!;
  return mixShape(a, b, k);
}

/* ── the signer ───────────────────────────────────────────────────────────── */

/** Where a sign is made, in body units: the shoulders sit at (±1, 0), the face's centre at (0, −1). */
const LOCATIONS: Record<string, P2> = {
  forehead: [0.06, -1.24],
  eye: [0.22, -1.06],
  chin: [0.04, -0.66],
  cheek: [0.3, -0.9],
  chest: [0.1, 0.45],
  shoulder: [-0.72, 0.18],
  neutral: [0.22, 1.02],
  side: [1.18, 0.95],
};
interface Sign {
  at: keyof typeof LOCATIONS;
  shape: keyof typeof SHAPES;
  move: "circle" | "tap" | "arc" | "down" | "still";
  two?: boolean;
}
/** A loop of plausible signs — location, handshape, movement — not any particular word. */
const SIGNS: Sign[] = [
  { at: "chin", shape: "flat", move: "tap" },
  { at: "neutral", shape: "vee", move: "arc", two: true },
  { at: "forehead", shape: "one", move: "tap" },
  { at: "chest", shape: "five", move: "circle" },
  { at: "neutral", shape: "cee", move: "down", two: true },
  { at: "cheek", shape: "why", move: "arc" },
  { at: "eye", shape: "ell", move: "still" },
  { at: "chest", shape: "oh", move: "circle", two: true },
  { at: "side", shape: "fist", move: "down" },
];
const REST_L: P2 = [0.86, 1.3];
const SIGN_T = 2.9; // seconds per sign

function movement(kind: Sign["move"], k: number): P2 {
  switch (kind) {
    case "circle":
      return [Math.cos(k * TAU) * 0.16, Math.sin(k * TAU) * 0.12];
    case "tap":
      return [0, -Math.abs(Math.sin(k * TAU * 2)) * 0.12];
    case "arc":
      return [Math.sin(k * Math.PI) * 0.35 - 0.17, -Math.sin(k * Math.PI) * 0.12];
    case "down":
      return [0, k * 0.35 - 0.17];
    default:
      return [0, 0];
  }
}

/** The dominant hand's target, handshape and two-handedness at time t. */
function signState(t: number): { dom: P2; shape: Shape; twoK: number; base: P2 } {
  const u = t / SIGN_T;
  const i = Math.floor(u);
  const k = u - i;
  const cur = SIGNS[((i % SIGNS.length) + SIGNS.length) % SIGNS.length]!;
  const prev = SIGNS[(((i - 1) % SIGNS.length) + SIGNS.length) % SIGNS.length]!;
  // 0–0.3 travel from the last sign's end, 0.3–0.9 the movement, 0.9–1 hold
  const travel = ease(k / 0.3);
  const from = add(LOCATIONS[prev.at]!, movement(prev.move, 1));
  const mk = Math.min(1, Math.max(0, (k - 0.3) / 0.6));
  const to = add(LOCATIONS[cur.at]!, movement(cur.move, ease(mk)));
  const dom: P2 = travel < 1 ? [lerp(from[0], to[0], travel), lerp(from[1], to[1], travel)] : to;
  const shape = mixShape(SHAPES[prev.shape]!, SHAPES[cur.shape]!, ease(k / 0.25));
  const twoCur = cur.two ? 1 : 0;
  const twoPrev = prev.two ? 1 : 0;
  const twoK = lerp(twoPrev, twoCur, ease(k / 0.3));
  const base: P2 = [-(to[0] * 0.6) - 0.15, to[1] + 0.12];
  return { dom, shape, twoK, base };
}
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];

/**
 * Shoulder → elbow → wrist as a camera sees it. A true 2-D two-bone solve cannot raise a hand to
 * the forehead with the elbow down — in a frontal view the forearm foreshortens toward the lens —
 * so the elbow is placed where the projection puts it: below the shoulder–wrist line, bowed out
 * by whatever arm length is left over (capped), the wrist exactly on target when in reach.
 */
function reach(
  sh: P2,
  target: P2,
  l1: number,
  l2: number,
  outward: number,
): { elbow: P2; wrist: P2 } {
  let dx = target[0] - sh[0];
  let dy = target[1] - sh[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.98;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
  }
  const dd = Math.min(d, max);
  const wrist: P2 = [sh[0] + dx, sh[1] + dy];
  const half = (l1 + l2) / 2;
  const bow = Math.min(0.45, Math.sqrt(Math.max(0, half * half - (dd / 2) * (dd / 2))));
  // the two perpendiculars of the shoulder→wrist line; take the lower one, leaning outward
  const nx = -dy / dd;
  const ny = dx / dd;
  const down = ny > 0 || (ny === 0 && nx * outward > 0) ? 1 : -1;
  const mid: P2 = [sh[0] + dx * 0.46, sh[1] + dy * 0.46];
  const elbow: P2 = [mid[0] + nx * down * bow + outward * 0.08, mid[1] + ny * down * bow];
  return { elbow, wrist };
}

interface Body {
  shoulderW: number; // half-width multiplier
  arm: number; // limb-length multiplier
  head: number;
  yaw: number; // radians, turns the figure (x squeezes, the far side shrinks a little)
}
const PLAIN: Body = { shoulderW: 1, arm: 1, head: 1, yaw: 0 };

/**
 * One frame of the signer, in body units → screen. Returns nothing; draws pose, face points,
 * both hands and (optionally) the dominant wrist's trail.
 */
function drawSigner(
  ctx: CanvasRenderingContext2D,
  t: number,
  o: {
    X: number;
    Y: number;
    S: number;
    color: string;
    accent: string;
    body?: Body;
    trail?: boolean;
    zones?: boolean;
    lw?: number;
  },
) {
  const body = o.body ?? PLAIN;
  const cyaw = Math.cos(body.yaw);
  const tf = (p: P2): P2 => [o.X + p[0] * o.S * cyaw, o.Y + p[1] * o.S];
  const lw = o.lw ?? Math.max(1.2, o.S * 0.022);
  const dot = Math.max(1.4, o.S * 0.022);
  const st = signState(t);
  const sw = body.shoulderW;
  // The signer's right hand is dominant: it is on the viewer's LEFT (−x).
  const shR: P2 = [-sw, 0];
  const shL: P2 = [sw, 0];
  const l1 = 0.98 * body.arm;
  const l2 = 0.9 * body.arm;
  const domT: P2 = [-st.dom[0] * sw, st.dom[1]];
  const baseT: P2 = [lerp(REST_L[0], -st.base[0], st.twoK), lerp(REST_L[1], st.base[1], st.twoK)];
  const armR = reach(shR, domT, l1, l2, -1);
  const armL = reach(shL, baseT, l1, l2, 1);

  if (o.zones) {
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = o.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (const [name, p] of Object.entries(LOCATIONS)) {
      const c = tf([-p[0] * sw, p[1]]);
      const near = Math.hypot(domT[0] + p[0] * sw, domT[1] - p[1]);
      ctx.globalAlpha = 0.25 + 0.5 * Math.max(0, 1 - near / 0.6);
      ctx.beginPath();
      ctx.ellipse(
        c[0],
        c[1],
        o.S * (name === "neutral" ? 0.55 : 0.26),
        o.S * (name === "neutral" ? 0.4 : 0.18),
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // trail of the dominant wrist, re-sampled over the last 2.4 s
  if (o.trail !== false) {
    const n = 48;
    ctx.save();
    ctx.lineWidth = lw;
    for (let i = 1; i < n; i++) {
      const ta = t - 2.4 + (2.4 * (i - 1)) / n;
      const tb = t - 2.4 + (2.4 * i) / n;
      const a = signState(ta).dom;
      const b = signState(tb).dom;
      const pa = tf(reach(shR, [-a[0] * sw, a[1]], l1, l2, -1).wrist);
      const pb = tf(reach(shR, [-b[0] * sw, b[1]], l1, l2, -1).wrist);
      ctx.strokeStyle = o.accent;
      ctx.globalAlpha = (i / n) * 0.6;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
      if (i % 4 === 0) {
        ctx.fillStyle = o.accent;
        ctx.beginPath();
        ctx.arc(pb[0], pb[1], dot * 0.8, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // pose, cropped at the waist the way a camera frames a signer: shoulders, arms, a neck,
  // torso sides that fade out, and the face as the tracker marks it
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  const seg = (a: P2, b: P2) => {
    const pa = tf(a);
    const pb = tf(b);
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  };
  seg(shR, shL);
  seg([0, 0], [0, -0.56]);
  seg(shR, armR.elbow);
  seg(armR.elbow, armR.wrist);
  seg(shL, armL.elbow);
  seg(armL.elbow, armL.wrist);
  const base = ctx.globalAlpha;
  for (const side of [-1, 1]) {
    // each torso side in short pieces, fading toward the frame's edge
    for (let k = 0; k < 6; k++) {
      ctx.globalAlpha = base * (1 - k / 6) * 0.9;
      const y0 = (k / 6) * 1.55;
      const y1 = ((k + 1) / 6) * 1.55;
      seg([side * (sw - 0.22 * (y0 / 1.55)), y0], [side * (sw - 0.22 * (y1 / 1.55)), y1]);
    }
  }
  ctx.globalAlpha = base;
  const face: P2 = [0, -1];
  const fr = 0.36 * body.head;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU;
    const p = tf([face[0] + Math.cos(a) * fr * 0.8, face[1] + Math.sin(a) * fr]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], dot * 0.55, 0, TAU);
    ctx.fill();
  }
  for (const f of [
    [-0.13, -0.08],
    [0.13, -0.08],
    [0, 0.06],
    [-0.09, 0.19],
    [0, 0.22],
    [0.09, 0.19],
  ] as P2[]) {
    const p = tf([face[0] + f[0] * body.head, face[1] + f[1] * body.head]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], dot * 0.8, 0, TAU);
    ctx.fill();
  }
  for (const j of [shR, shL, armR.elbow, armL.elbow]) {
    const p = tf(j);
    ctx.beginPath();
    ctx.arc(p[0], p[1], dot, 0, TAU);
    ctx.fill();
  }

  // hands: the dominant one takes the sign's shape; the other is flat as a base, or at rest
  const hs = o.S * 0.42 * body.arm;
  const dirR = Math.atan2(armR.wrist[1] - armR.elbow[1], armR.wrist[0] - armR.elbow[0]);
  const dirL = Math.atan2(armL.wrist[1] - armL.elbow[1], armL.wrist[0] - armL.elbow[0]);
  const wob = Math.sin(t * 0.9) * 0.25;
  // the hand's frame points its fingers along −y, so roll = forearm direction + 90°
  drawHand(
    ctx,
    poseHand(
      handLocal(st.shape),
      tf(armR.wrist),
      hs,
      dirR + Math.PI / 2 - 0.25,
      0.35 + wob + body.yaw,
      -0.2,
      false,
    ),
    o.color,
    o.accent,
    lw * 0.85,
    dot * 0.75,
  );
  const baseShape = mixShape(SHAPES.flat!, SHAPES.five!, 0.2);
  const restShape = mixShape(SHAPES.flat!, SHAPES.cee!, 0.5);
  drawHand(
    ctx,
    poseHand(
      handLocal(mixShape(restShape, baseShape, st.twoK)),
      tf(armL.wrist),
      hs,
      dirL + Math.PI / 2 + 0.25 * (1 - st.twoK),
      -0.4 + body.yaw,
      lerp(0.1, 0.9, st.twoK),
      true,
    ),
    o.color,
    o.accent,
    lw * 0.85,
    dot * 0.75,
  );
}

export function Signer({ active, color, accent, x, y, scale, speed, zones, trail }: BgProps) {
  const c = asStr(color, "rgba(13,148,136,0.55)");
  const a = asStr(accent, "rgba(124,58,237,0.75)");
  const cx = asNum(x, 0.78);
  const cy = asNum(y, 0.42);
  const sc = asNum(scale, 0.16);
  const sp = asNum(speed, 1);
  const z = zones === true || zones === "true";
  const tr = trail !== false && trail !== "false";
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      drawSigner(ctx, t * sp + 4.2, {
        X: cx * w,
        Y: cy * h,
        S: sc * h,
        color: c,
        accent: a,
        zones: z,
        trail: tr,
      });
    },
    [c, a, cx, cy, sc, sp, z, tr],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/** Several synthetic variants of one signer, overlaid: turned and re-proportioned. */
export function Variants({ active, color, accent, x, y, scale, count, speed }: BgProps) {
  const c = asStr(color, "rgba(5,150,105,0.5)");
  const a = asStr(accent, "rgba(124,58,237,0.7)");
  const cx = asNum(x, 0.78);
  const cy = asNum(y, 0.4);
  const sc = asNum(scale, 0.15);
  const n = Math.max(1, Math.round(asNum(count, 4)));
  const sp = asNum(speed, 1);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0 : i / (n - 1);
        const drift = Math.sin(t * 0.25 + i * 1.7) * 0.12;
        const body: Body = {
          shoulderW: lerp(0.86, 1.12, k),
          arm: lerp(1.08, 0.9, k),
          head: lerp(0.95, 1.08, 1 - k),
          yaw: lerp(-32, 32, k) * RAD + drift,
        };
        ctx.globalAlpha = i === Math.floor(n / 2) ? 1 : 0.55;
        drawSigner(ctx, t * sp + 4.2, {
          X: cx * w + (k - 0.5) * sc * h * 1.1,
          Y: cy * h,
          S: sc * h,
          color: c,
          accent: a,
          body,
          trail: i === Math.floor(n / 2),
        });
      }
      ctx.globalAlpha = 1;
    },
    [c, a, cx, cy, sc, n, sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── handshapes ───────────────────────────────────────────────────────────── */

export function Handshapes({ active, color, accent, cols, rows, size, speed, top }: BgProps) {
  const c = asStr(color, "rgba(13,148,136,0.4)");
  const a = asStr(accent, "rgba(124,58,237,0.6)");
  const nc = Math.max(1, Math.round(asNum(cols, 7)));
  const nr = Math.max(1, Math.round(asNum(rows, 4)));
  const sz = asNum(size, 0.075);
  const sp = asNum(speed, 1);
  const tp = asNum(top, 0);
  const ref = useCanvas(
    active,
    (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const S = sz * h;
      for (let r = 0; r < nr; r++) {
        for (let q = 0; q < nc; q++) {
          const i = r * nc + q;
          // stagger alternate rows like a brick course, so no column lines up
          const X = ((q + 0.5 + (r % 2 ? 0.5 : 0)) / (nc + 0.5)) * w;
          const Y = (tp + ((r + 0.62) / nr) * (1 - tp)) * h;
          const seed = smoothNoise(i * 3.1, 7.7);
          const shape = shapeAt(t * sp, 3.4 + seed * 2.2, seed * 10, SHAPE_ORDER);
          const roll = (smoothNoise(i * 1.3, t * 0.05 * sp) - 0.5) * 0.9;
          const yaw = (smoothNoise(i * 2.7 + 5, t * 0.07 * sp) - 0.5) * 1.6;
          const pitch = (smoothNoise(i * 0.7 + 9, t * 0.06 * sp) - 0.5) * 0.8;
          const pts = poseHand(
            handLocal(shape),
            [X, Y + S * 0.55],
            S,
            roll,
            yaw,
            pitch,
            i % 3 === 1,
          );
          ctx.globalAlpha = 0.55 + 0.45 * seed;
          drawHand(ctx, pts, c, a, Math.max(1, S * 0.035), Math.max(1.3, S * 0.04));
        }
      }
      ctx.globalAlpha = 1;
    },
    [c, a, nc, nr, sz, sp, tp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── trails ───────────────────────────────────────────────────────────────── */

/** A wrist path through signing space: a slowly changing loop, sampled at a frame rate. */
function pathAt(
  i: number,
  t: number,
  w: number,
  h: number,
  area: [number, number, number, number] = [0, 0, 1, 1],
): P2 {
  const cx = 0.22 + 0.56 * smoothNoise(i * 4.1, 0.5);
  const cy = 0.3 + 0.4 * smoothNoise(i * 2.3, 9.1);
  const rx = 0.14 + 0.12 * smoothNoise(i, 3);
  const ry = 0.12 + 0.1 * smoothNoise(i, 5);
  const f1 = 0.55 + 0.25 * smoothNoise(i, 7);
  const f2 = f1 * (1.5 + 0.5 * smoothNoise(i, 11));
  const u = cx + rx * Math.sin(t * f1 + i) + 0.04 * Math.sin(t * f2 * 1.3 + i * 2);
  const v = cy + ry * Math.sin(t * f2 + i * 0.7) + 0.03 * Math.cos(t * f1 * 0.7);
  return [w * (area[0] + u * (area[2] - area[0])), h * (area[1] + v * (area[3] - area[1]))];
}

export function Trails({ active, color, accent, count, speed, align, area }: BgProps) {
  const c = asStr(color, "rgba(13,148,136,0.55)");
  const a = asStr(accent, "rgba(124,58,237,0.8)");
  const n = Math.max(1, Math.round(asNum(count, 4)));
  const sp = asNum(speed, 1);
  const al = align === true || align === "true";
  // x0,y0,x1,y1 as fractions of the slide: keeps the paths in the part a figure leaves empty
  const ar = asStr(area, "0,0,1,1").split(",").map(Number) as [number, number, number, number];
  const arKey = ar.join(",");
  const ref = useCanvas(
    active,
    (ctx, w, h, t0) => {
      ctx.clearRect(0, 0, w, h);
      const t = t0 * sp * 0.5 + 3;
      const span = 8; // seconds of path visible
      const steps = 140;
      const lw = Math.max(1.2, h * 0.0028);
      for (let i = 0; i < n; i++) {
        const pts: P2[] = [];
        for (let s = 0; s <= steps; s++)
          pts.push(pathAt(i, t - span + (span * s) / steps, w, h, ar));
        drawTrail(ctx, pts, c, a, lw);
        if (al && i === 0) {
          // the same path, performed by someone else: shifted, and slower in the middle
          const warp = (u: number) => u + 0.18 * Math.sin(u * Math.PI);
          const off: P2 = [w * 0.05 * (ar[2] - ar[0]) * 2, h * 0.1 * (ar[3] - ar[1])];
          const other: P2[] = [];
          for (let s = 0; s <= steps; s++) {
            const u = warp(s / steps);
            const p = pathAt(i, t - span + span * Math.min(1, u), w, h, ar);
            other.push([p[0] + off[0], p[1] + off[1]]);
          }
          drawTrail(ctx, other, a, c, lw);
          // alignment: each sampled point joined to its match on the other performance
          ctx.save();
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = a;
          ctx.lineWidth = 1;
          for (let s = 0; s <= steps; s += 6) {
            const u = s / steps;
            // invert the warp numerically: the other performance reaches u at v where warp(v) = u
            let v = u;
            for (let it = 0; it < 6; it++)
              v -= (warp(v) - u) / (1 + 0.18 * Math.PI * Math.cos(v * Math.PI));
            const j = Math.round(Math.max(0, Math.min(1, v)) * steps);
            ctx.globalAlpha = 0.25 + 0.5 * (s / steps);
            ctx.beginPath();
            ctx.moveTo(pts[s]![0], pts[s]![1]);
            ctx.lineTo(other[j]![0], other[j]![1]);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },
    [c, a, n, sp, al, arKey],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  pts: P2[],
  color: string,
  accent: string,
  lw: number,
) {
  const n = pts.length;
  ctx.lineCap = "round";
  for (let s = 1; s < n; s++) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.globalAlpha = (s / n) * 0.85;
    ctx.beginPath();
    ctx.moveTo(pts[s - 1]![0], pts[s - 1]![1]);
    ctx.lineTo(pts[s]![0], pts[s]![1]);
    ctx.stroke();
    if (s % 3 === 0) {
      // a tick per sampled frame
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pts[s]![0], pts[s]![1], lw * 0.9, 0, TAU);
      ctx.fill();
    }
  }
  const head = pts[n - 1]!;
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(head[0], head[1], lw * 2.2, 0, TAU);
  ctx.fill();
}

/* ── window ───────────────────────────────────────────────────────────────── */

export function WindowStrip({ active, color, accent, speed, y }: BgProps) {
  const c = asStr(color, "rgba(37,99,235,0.45)");
  const a = asStr(accent, "rgba(5,150,105,0.8)");
  const sp = asNum(speed, 1);
  const base = asNum(y, 0.93);
  const ref = useCanvas(
    active,
    (ctx, w, h, t0) => {
      ctx.clearRect(0, 0, w, h);
      const t = t0 * sp;
      const fps = 12; // strip frames per second, drawn
      const fw = w / 150; // one frame's width
      const shift = (t * fps * fw) % fw;
      const first = Math.floor(t * fps);
      const Y = base * h;
      const S = h * 0.035;
      // frame ticks, and a small hand every eighth frame
      ctx.lineWidth = 1;
      for (let k = 0; k < 152; k++) {
        const x = k * fw - shift;
        const frame = first + k;
        const energy = 0.5 + 0.5 * Math.sin(frame * 0.09) * smoothNoise(frame * 0.05, 1.3);
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, Y + S * 0.9);
        ctx.lineTo(x, Y + S * (0.9 + (frame % 8 === 0 ? 0.6 : 0.3)));
        ctx.stroke();
        if (frame % 8 === 0) {
          const shape = shapeAt(frame / fps, 1.6, 0);
          const pts = poseHand(
            handLocal(shape),
            [x, Y + S * 0.4],
            S * 0.75,
            0,
            Math.sin(frame * 0.05) * 0.6,
            -0.2,
          );
          ctx.globalAlpha = 0.9;
          drawHand(ctx, pts, c, a, 1, 1.2);
        }
        // motion energy above the strip
        const ex = x;
        const ey = Y - S * 0.9 - energy * S * 1.5;
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(ex, ey, fw * 0.8, Y - S * 0.9 - ey);
      }
      // the 64-frame window: frames flow through it, and each time a stride (16 frames) has
      // passed it takes a new reading — the flash
      const stride = 16;
      const k = ((t * fps) / stride) % 1;
      const wx = w * 0.62 - 64 * fw * 0.5;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = a;
      ctx.lineWidth = 1.6;
      const top = Y - S * 2.6;
      const bot = Y + S * 1.7;
      ctx.beginPath();
      ctx.moveTo(wx + 8, top);
      ctx.lineTo(wx, top);
      ctx.lineTo(wx, bot);
      ctx.lineTo(wx + 8, bot);
      ctx.moveTo(wx + 64 * fw - 8, top);
      ctx.lineTo(wx + 64 * fw, top);
      ctx.lineTo(wx + 64 * fw, bot);
      ctx.lineTo(wx + 64 * fw - 8, bot);
      ctx.stroke();
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.07 + 0.08 * (1 - k);
      ctx.fillRect(wx, top, 64 * fw, bot - top);
      ctx.globalAlpha = 1;
    },
    [c, a, sp, base],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

/* ── embedding ────────────────────────────────────────────────────────────── */

export function Embedding({ active, color, accent, count, speed }: BgProps) {
  const c = asStr(color, "rgba(124,58,237,0.45)");
  const a = asStr(accent, "rgba(5,150,105,0.85)");
  const n = Math.max(2, Math.round(asNum(count, 9)));
  const sp = asNum(speed, 1);
  const ref = useCanvas(
    active,
    (ctx, w, h, t0) => {
      ctx.clearRect(0, 0, w, h);
      const t = t0 * sp;
      const centres: P2[] = [];
      for (let i = 0; i < n; i++) {
        centres.push([
          w * (0.08 + 0.84 * smoothNoise(i * 5.3, t * 0.02 + i)),
          h * (0.1 + 0.8 * smoothNoise(i * 3.7 + 2, t * 0.018 + i * 0.5)),
        ]);
      }
      const R = Math.min(w, h) * 0.05;
      // members of each word: the takes, scattered about their prototype
      for (let i = 0; i < n; i++) {
        const [px, py] = centres[i]!;
        ctx.fillStyle = c;
        for (let m = 0; m < 14; m++) {
          const ang = smoothNoise(i * 9 + m, 1.1) * TAU + t * 0.05 * (m % 2 ? 1 : -1);
          const rr = R * (0.25 + 1.1 * smoothNoise(i + m * 3.3, 2.2));
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.arc(
            px + Math.cos(ang) * rr,
            py + Math.sin(ang) * rr,
            Math.max(1.4, R * 0.07),
            0,
            TAU,
          );
          ctx.fill();
        }
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(px, py, R * 0.28, 0, TAU);
        ctx.stroke();
      }
      // the query: a window's embedding, wandering; lines to its three nearest prototypes
      const q: P2 = [
        w * (0.1 + 0.8 * smoothNoise(71.3, t * 0.045)),
        h * (0.12 + 0.76 * smoothNoise(13.9, t * 0.04)),
      ];
      const order = centres
        .map((p, i) => [Math.hypot(p[0] - q[0], p[1] - q[1]), i] as const)
        .sort((x, y) => x[0] - y[0]);
      ctx.strokeStyle = a;
      order.slice(0, 3).forEach(([, i], rank) => {
        const p = centres[i]!;
        ctx.globalAlpha = rank === 0 ? 0.9 : 0.35;
        ctx.lineWidth = rank === 0 ? 1.8 : 1;
        ctx.setLineDash(rank === 0 ? [] : [4, 5]);
        ctx.beginPath();
        ctx.moveTo(q[0], q[1]);
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      const win = centres[order[0]![1]]!;
      const pulse = (t * 0.7) % 1;
      ctx.globalAlpha = (1 - pulse) * 0.8;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(win[0], win[1], R * (0.3 + pulse * 0.9), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.arc(q[0], q[1], Math.max(3, R * 0.12), 0, TAU);
      ctx.fill();
    },
    [c, a, n, sp],
  );
  return <canvas ref={ref} className="deck-bg-canvas" />;
}

registerBackground("signer", Signer);
registerBackground("variants", Variants);
registerBackground("handshapes", Handshapes);
registerBackground("trails", Trails);
registerBackground("window", WindowStrip);
registerBackground("embedding", Embedding);
