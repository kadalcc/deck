import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { key as navKey } from "../core/navigation.ts";
import { BackgroundLayer } from "../react/Backgrounds.tsx";
import { cmd, useCommand } from "../react/commands.ts";
import { useDeck } from "../react/context.ts";
import { SlideFrame } from "../react/SlideFrame.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * export.thumbnail  —  a picture of one slide, made in the page
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A host keeps a picture of a deck to show in its lists (deck.kadal.cc's dashboard; the builder
 * asks its preview for one as it publishes). The slide is rendered off-screen at the deck's own
 * size — its background, every click step revealed, no laser and no ink — then rasterized in the
 * browser by modern-screenshot (MIT, ~25 KB gz, loaded only when a picture is asked for). It
 * copies 2D canvases (the animated backgrounds draw on one) and embeds the deck's web fonts, so
 * the picture is the slide, not an approximation. Nothing the presenter sees moves.
 *
 *   params  { slide?: number  (flat index, default 0), width?: number (default 640, 160–1920) }
 *   value   { type: "image/png", dataUrl, width, height }   height = width × the deck's aspect
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const thumbnailParams = z
  .object({
    slide: z.number().int().min(0).optional(),
    width: z.number().optional(),
  })
  .strict();

/** The size a picture is made at: the asked width (clamped), the deck's shape. */
export function thumbnailSize(
  width: number | undefined,
  deck: { width: number; height: number },
): { width: number; height: number } {
  const w = Math.round(Math.min(1920, Math.max(160, Number.isFinite(width) ? width! : 640)));
  return { width: w, height: Math.round((w * deck.height) / deck.width) };
}

export interface Thumbnail {
  type: "image/png";
  dataUrl: string;
  width: number;
  height: number;
}

interface Job {
  slide: number;
  width: number;
  done: (t: Thumbnail) => void;
  fail: (e: unknown) => void;
}

/** How long a slide may take to settle (its module, fonts, images, a diagram) before it is taken. */
const SETTLE_MS = 4000;
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Registers `export.thumbnail` and renders the slide it is asked for, off-screen, one at a time. */
export function ThumbnailHost() {
  const deck = useDeck();
  const [job, setJob] = useState<Job | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const flat = useMemo(() => deck.columns.flatMap((c) => c.slides), [deck.columns]);

  useCommand(
    cmd({
      id: "export.thumbnail",
      title: "Slide picture",
      description:
        "A PNG of one slide (flat index `slide`, default the first) at `width` pixels (default 640, 160–1920), every step shown, for a host's list of decks. Returns { type, dataUrl, width, height }.",
      group: "query",
      readOnly: true,
      params: thumbnailParams,
      run: (p) => {
        if (!flat.length) throw new Error("This deck has no slides.");
        const slide = Math.min(flat.length - 1, p.slide ?? 0);
        const { width } = thumbnailSize(p.width, deck.config);
        // One at a time: each needs the off-screen frame to itself.
        const next = chain.current.then(
          () => new Promise<Thumbnail>((done, fail) => setJob({ slide, width, done, fail })),
        );
        chain.current = next.catch(() => {});
        return next;
      },
    }),
  );

  return job ? <Capture job={job} onDone={() => setJob(null)} /> : null;
}

function Capture({ job, onDone }: { job: Job; onDone: () => void }) {
  const deck = useDeck();
  const node = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = deck.config;
  const meta = deck.columns.flatMap((c) => c.slides)[job.slide]!;
  const options = deck.options.get(navKey(meta.h, meta.v))!;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const el = node.current!;
        const until = Date.now() + SETTLE_MS;
        // The slide's module loads on demand; wait for it to have drawn something.
        while (alive && Date.now() < until && !el.querySelector(".deck-slide *")) await sleep(30);
        await document.fonts?.ready;
        await Promise.all(
          [...el.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)),
        );
        // Diagrams, maths and code settle a beat after they mount.
        await frame();
        await frame();
        await sleep(250);
        if (!alive) return;
        const { domToPng } = await import("modern-screenshot");
        const bg = getComputedStyle(el).backgroundColor;
        const size = thumbnailSize(job.width, deck.config);
        const dataUrl = await domToPng(el, {
          width: W,
          height: H,
          scale: size.width / W,
          backgroundColor: bg,
          // The off-screen placement is ours, not the slide's.
          style: { position: "static", left: "0", top: "0" },
          timeout: 8000,
        });
        job.done({ type: "image/png", dataUrl, width: size.width, height: size.height });
      } catch (err) {
        job.fail(err);
      } finally {
        if (alive) onDone();
      }
    })();
    return () => {
      alive = false;
    };
  }, [job, onDone, W, H, deck.config]);

  return (
    <div
      ref={node}
      className="deck-thumbnail-capture"
      aria-hidden="true"
      style={{ width: W, height: H }}
    >
      <BackgroundLayer bg={options.background} active={false} />
      <SlideFrame
        key={`${meta.h},${meta.v}`}
        meta={meta}
        options={options}
        h={meta.h}
        v={meta.v}
        active={false}
        click={999}
        preview
        className="is-tile"
      />
    </div>
  );
}
