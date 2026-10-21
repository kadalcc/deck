import type { Page } from "playwright";

import { type Bitmap, type Box, crop, decodePng, encodePng, inkBoxes } from "./png.ts";
import type { Rect, SlideSnapshot } from "./types.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAPTURES  —  the pictures an editable slide still needs
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * After the walk (walk.ts) the print page carries marks; this module photographs, for one slide:
 *
 *   - each RASTER item alone: its ancestors' own paint and every other branch made invisible, the
 *     page transparent, so the picture is that element over nothing (`mode: "own"` keeps only the
 *     element's own paint — its children are natively drawn on top of it);
 *   - the BACKGROUND, when it is more than a colour: the page with everything but its backdrop
 *     (the background layer and the stage-wide elements under the slide) made invisible;
 *   - the RESIDUE: the page with everything the PowerPoint file draws natively made invisible.
 *     What is left — a pseudo-element's decoration, a custom bullet, line numbers, anything the
 *     walker did not understand — is cut into tight pieces (png.ts) and placed where it was.
 *
 * Only paint properties change (opacity, colours, backgrounds), never layout, so every element
 * stays exactly where the walker measured it. Every mode is a class on `<html>` and attributes the
 * walker or this module set; `clearMarks` takes them all away.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TEXT_OFF = `-webkit-text-fill-color: transparent !important;
  text-decoration-color: transparent !important;
  text-emphasis-color: transparent !important;
  -webkit-text-stroke-color: transparent !important;
  text-shadow: none !important;`;
const PAINT_OFF = `background: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  outline-color: transparent !important;`;
const PAGE = ".deck-print-page";

export const CAPTURE_CSS = `
html.kx-export *, html.kx-export *::before, html.kx-export *::after {
  transition: none !important;
  animation-play-state: paused !important;
  caret-color: transparent !important;
}
html.kx-residual, html.kx-residual body, html.kx-residual .deck-root, html.kx-residual .deck-print-pages,
html.kx-iso, html.kx-iso body, html.kx-iso .deck-root, html.kx-iso .deck-print-pages {
  background: transparent !important;
}
html.kx-residual ${PAGE}, html.kx-iso ${PAGE} { box-shadow: none !important; }

/* the residue: what the file does not draw natively */
html.kx-residual [data-kx-paint~="text"], html.kx-residual [data-kx-paint~="text"] * { ${TEXT_OFF} }
html.kx-residual [data-kx-paint~="text"]::before, html.kx-residual [data-kx-paint~="text"]::after,
html.kx-residual [data-kx-paint~="text"] *::before, html.kx-residual [data-kx-paint~="text"] *::after {
  -webkit-text-fill-color: currentcolor !important;
}
html.kx-residual [data-kx-paint~="marker"]::marker,
html.kx-residual [data-kx-paint~="list"] ::marker { color: transparent !important; }
html.kx-residual [data-kx-paint~="box"], html.kx-residual [data-kx-paint~="bg"] { ${PAINT_OFF} }
html.kx-residual [data-kx-paint~="all"] { opacity: 0 !important; }
html.kx-residual [data-kx-paint~="bgpseudo"]::before, html.kx-residual [data-kx-paint~="bgpseudo"]::after { opacity: 0 !important; }

/* one element alone */
html.kx-iso [data-kx-iso="off"] { opacity: 0 !important; }
html.kx-iso [data-kx-iso="anc"] { ${PAINT_OFF} ${TEXT_OFF} }
html.kx-iso [data-kx-iso="anc"]::before, html.kx-iso [data-kx-iso="anc"]::after { opacity: 0 !important; }
html.kx-iso [data-kx-iso="anc"]::marker { color: transparent !important; }
html.kx-iso [data-kx-iso="target"] {
  -webkit-text-fill-color: currentcolor;
  text-decoration-color: currentcolor;
}
html.kx-iso [data-kx-iso="own"] { ${TEXT_OFF} }
html.kx-iso [data-kx-iso="own"] > * { opacity: 0 !important; }
html.kx-iso [data-kx-iso="own"]::before, html.kx-iso [data-kx-iso="own"]::after { opacity: 0 !important; }

/* the backdrop alone */
html.kx-bgshot [data-kx-iso="off"] { opacity: 0 !important; }
html.kx-bgshot [data-kx-paint~="bg"] { ${TEXT_OFF} }
`;

export interface Picture {
  /** Slide pixels. */
  rect: Rect;
  png: Uint8Array;
}

export interface Captured {
  /** By raster item id (pictures that could not be fetched land here too). */
  rasters: Map<number, Picture>;
  background: Uint8Array | null;
  residue: Picture[];
  failed: number;
}

/** Mark element `id` and its surroundings for an isolated shot; returns false when it is gone. */
async function isolate(page: Page, id: number, mode: "all" | "own"): Promise<boolean> {
  return page.evaluate(
    ({ id, mode }) => {
      const target = document.querySelector(`[data-kx-id="${id}"]`);
      if (!target) return false;
      target.setAttribute("data-kx-iso", mode === "own" ? "own" : "target");
      for (let node: Element = target; node.parentElement; node = node.parentElement) {
        const parent = node.parentElement;
        for (const sib of parent.children) if (sib !== node) sib.setAttribute("data-kx-iso", "off");
        parent.setAttribute("data-kx-iso", "anc");
        if (parent === document.body) break;
      }
      document.documentElement.classList.add("kx-iso");
      return true;
    },
    { id, mode },
  );
}

async function unisolate(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.classList.remove("kx-iso", "kx-bgshot", "kx-residual");
    for (const el of document.querySelectorAll("[data-kx-iso]")) el.removeAttribute("data-kx-iso");
  });
}

/** Everything inside the page but its backdrop, for the background shot. */
async function isolateBackdrop(page: Page, index: number): Promise<void> {
  await page.evaluate((index) => {
    const pageEl = document.querySelectorAll(".deck-print-page")[index];
    if (!pageEl) return;
    const keep = (el: Element) =>
      el.classList.contains("deck-background") ||
      (el.getAttribute("data-kx-paint") ?? "").split(" ").includes("bg");
    const walk = (el: Element) => {
      for (const kid of el.children) {
        if (keep(kid)) {
          if (!kid.classList.contains("deck-background")) walk(kid);
        } else kid.setAttribute("data-kx-iso", "off");
      }
    };
    walk(pageEl);
    document.documentElement.classList.add("kx-bgshot");
  }, index);
}

const frame = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

/**
 * The part of `bmp` (a shot of box `at`, in slide pixels) inside the slide — and inside `within`
 * when given — as a picture.
 */
function clipToSlide(
  bmp: Bitmap,
  at: Rect,
  W: number,
  H: number,
  within?: Rect,
  k?: number,
): Picture | null {
  const kx = k ?? bmp.width / at.w;
  const ky = k ?? bmp.height / at.h;
  const lim = within ?? at;
  const x0 = Math.max(0, at.x, lim.x);
  const y0 = Math.max(0, at.y, lim.y);
  const x1 = Math.min(W, at.x + at.w, lim.x + lim.w);
  const y1 = Math.min(H, at.y + at.h, lim.y + lim.h);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  const box: Box = {
    x: (x0 - at.x) * kx,
    y: (y0 - at.y) * ky,
    w: (x1 - x0) * kx,
    h: (y1 - y0) * ky,
  };
  const part =
    box.x === 0 && box.y === 0 && box.w === bmp.width && box.h === bmp.height
      ? bmp
      : crop(bmp, box);
  return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, png: encodePng(part) };
}

/**
 * The pictures one walked slide needs. `extra` are ids to photograph whole (pictures that could
 * not be fetched) at their rects.
 */
export async function captureSlide(
  page: Page,
  snap: SlideSnapshot,
  extra: { id: number; rect: Rect }[] = [],
): Promise<Captured> {
  const out: Captured = { rasters: new Map(), background: null, residue: [], failed: 0 };
  const { width: W, height: H } = snap;
  const jobs = [
    ...snap.under.flatMap((i) =>
      i.kind === "raster" ? [{ id: i.id, rect: i.rect, mode: i.mode, bleed: i.bleed }] : [],
    ),
    ...extra.map((e) => ({ ...e, mode: "all" as const, bleed: 0 })),
  ];
  const pageEl = page.locator(PAGE).nth(snap.page);
  for (const job of jobs) {
    try {
      if (!(await isolate(page, job.id, job.mode))) {
        out.failed++;
        continue;
      }
      await frame(page);
      let pic: Picture | null;
      if (job.bleed > 0) {
        // Paint past the box (a shadow): photograph the page, keep the box and its reach.
        const shot = decodePng(
          await pageEl.screenshot({ omitBackground: true, type: "png", animations: "disabled" }),
        );
        const k = shot.width / W;
        const b = job.bleed;
        const reach = {
          x: job.rect.x - b,
          y: job.rect.y - b,
          w: job.rect.w + 2 * b,
          h: job.rect.h + 2 * b,
        };
        pic = clipToSlide(shot, { x: 0, y: 0, w: W, h: H }, W, H, reach, k);
      } else {
        const shot = await page
          .locator(`[data-kx-id="${job.id}"]`)
          .first()
          .screenshot({
            omitBackground: true,
            type: "png",
            animations: "disabled",
            timeout: 15_000,
          });
        pic = clipToSlide(decodePng(shot), job.rect, W, H);
      }
      if (pic) out.rasters.set(job.id, pic);
    } catch {
      out.failed++;
    } finally {
      await unisolate(page);
    }
  }

  if (snap.background.raster) {
    try {
      await isolateBackdrop(page, snap.page);
      await frame(page);
      out.background = await pageEl.screenshot({
        type: "jpeg",
        quality: 90,
        animations: "disabled",
      });
    } catch {
      out.failed++;
    } finally {
      await unisolate(page);
    }
  }

  try {
    await page.evaluate(() => document.documentElement.classList.add("kx-residual"));
    await frame(page);
    const shot = decodePng(
      await pageEl.screenshot({ omitBackground: true, type: "png", animations: "disabled" }),
    );
    const kx = shot.width / W;
    for (const b of inkBoxes(shot, { gap: Math.round(16 * kx), min: 6 })) {
      // A speck of a pixel or two is antialiasing left over from a native edge, not a decoration.
      if (b.w < 3 * kx && b.h < 3 * kx) continue;
      const pad = Math.round(kx);
      const box = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
      const part = crop(shot, box);
      out.residue.push({
        rect: {
          x: Math.max(0, box.x) / kx,
          y: Math.max(0, box.y) / kx,
          w: part.width / kx,
          h: part.height / kx,
        },
        png: encodePng(part),
      });
    }
  } catch {
    out.failed++;
  } finally {
    await unisolate(page);
  }
  return out;
}

/** Take away every mark the walk and the captures left. */
export async function clearMarks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.remove("kx-export", "kx-iso", "kx-bgshot", "kx-residual");
    delete root.dataset.kxNext;
    for (const a of ["data-kx-paint", "data-kx-id", "data-kx-iso"])
      for (const el of document.querySelectorAll(`[${a}]`)) el.removeAttribute(a);
  });
}
