import { useEffect } from "react";

import { key as navKey } from "../core/navigation.ts";
import { useDeck } from "./context.ts";
import { useActions, useNav } from "./hooks.ts";
import { SlideFrame } from "./SlideFrame.tsx";

/**
 * The overview: every column as a row of its stack, each slide live and scaled down, the current
 * one ringed. Click a tile to go there; Esc or O leaves. Slides render in preview mode so nothing
 * plays until it is chosen.
 */
export function Overview() {
  const deck = useDeck();
  const { overview, h, v } = useNav((s) => ({ overview: s.overview, h: s.h, v: s.v }));
  const actions = useActions();
  useEffect(() => {
    if (!overview) return;
    const el = document.querySelector<HTMLElement>(".deck-overview .is-current");
    el?.scrollIntoView({ block: "center", inline: "center" });
  }, [overview, h, v]);
  if (!overview) return null;
  const tileW = 320;
  const scale = tileW / deck.config.width;
  const tileH = deck.config.height * scale;
  return (
    <div
      className="deck-overview"
      role="dialog"
      aria-label="Slide overview"
      onClick={() => actions.toggleOverview(false)}
    >
      <div className="deck-overview-grid" onClick={(e) => e.stopPropagation()}>
        {deck.columns.map((col) => (
          <div className="deck-overview-column" key={col.h}>
            {col.slides.map((meta, cv) => {
              const options = deck.options.get(navKey(col.h, cv))!;
              const isCurrent = col.h === h && cv === v;
              return (
                <button
                  type="button"
                  key={`${col.h},${cv}`}
                  className={["deck-overview-tile", isCurrent ? "is-current" : ""].join(" ")}
                  style={{ width: tileW, height: tileH }}
                  onClick={() => {
                    actions.goto(col.h, cv);
                    actions.toggleOverview(false);
                  }}
                  aria-label={meta.title ?? `Slide ${col.h + 1}.${cv + 1}`}
                >
                  <div
                    className="deck-overview-canvas"
                    style={{
                      width: deck.config.width,
                      height: deck.config.height,
                      transform: `scale(${scale})`,
                    }}
                  >
                    <SlideFrame
                      meta={meta}
                      options={options}
                      h={col.h}
                      v={cv}
                      active={false}
                      click={0}
                      preview
                      className="is-tile"
                    />
                  </div>
                  <span className="deck-overview-label">
                    {col.h + 1}
                    {cv ? `.${cv + 1}` : ""}
                    {meta.title ? ` · ${meta.title}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
