import type { CSSProperties, ReactNode } from "react";

import { type LayoutProps, Sticker as ImageSticker, type StickerProps } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Crayon's module: two classroom layouts and two cut-outs.
 *
 *   layout: activity   an exercise: a tag (`label:`, default "Activity"), a time chip
 *                      (`time: 10 min`), and the slide's numbered list as step stickers
 *                      (`columns:` how many to a row, default 3)
 *   layout: cards      the slide's bullet list as a grid of pastel cards (`columns:`, default 3);
 *                      a **bold** opening becomes the card's title
 *   <Sticker tone tilt>     words on a pastel cut-out: tone pink · mint · sky · butter · lilac ·
 *                           peach (default butter), tilt in degrees (default -2)
 *   <Bubble from side>      a speech bubble; `from` names the speaker, `side="right"` answers
 * ─────────────────────────────────────────────────────────────────────────────
 */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : null;

function Activity({ children, frontmatter }: LayoutProps) {
  const time = str(frontmatter.time);
  const cols = num(frontmatter.columns);
  return (
    <div
      className="deck-layout deck-layout-activity"
      style={cols ? ({ "--crayon-steps": cols } as CSSProperties) : undefined}
    >
      <div className="crayon-activity-head">
        <span className="crayon-activity-tag">{str(frontmatter.label) ?? "Activity"}</span>
        {time ? (
          <span className="crayon-activity-time">
            <span aria-hidden="true">{"⏱"}</span> {time}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Cards({ children, frontmatter }: LayoutProps) {
  const cols = num(frontmatter.columns);
  return (
    <div
      className="deck-layout deck-layout-cards"
      style={cols ? ({ "--crayon-cols": cols } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

const TONES = new Set(["pink", "mint", "sky", "butter", "lilac", "peach"]);

function Sticker({
  tone = "butter",
  tilt = -2,
  children,
  ...image
}: {
  tone?: string;
  tilt?: number;
  children?: ReactNode;
  src?: string;
  [key: string]: unknown;
}) {
  // With a `src` it is the engine's image sticker (placed over the slide), not words on a cut-out.
  if (typeof image.src === "string") return <ImageSticker {...(image as StickerProps)} />;
  return (
    <span
      className={`crayon-sticker tone-${TONES.has(tone) ? tone : "butter"}`}
      style={{ "--crayon-turn": Number(tilt) || 0 } as CSSProperties}
    >
      {children}
    </span>
  );
}

function Bubble({
  from,
  side = "left",
  children,
}: {
  from?: string;
  side?: "left" | "right";
  children?: ReactNode;
}) {
  return (
    <div className={`crayon-bubble${side === "right" ? " is-right" : ""}`}>
      {children}
      {from ? <span className="crayon-bubble-from">{from}</span> : null}
    </div>
  );
}

export default {
  layouts: { activity: Activity, cards: Cards },
  components: { Sticker, Bubble },
};
