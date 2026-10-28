import { useEffect, useState } from "react";

import { useDeck } from "./context.ts";
import { parallaxOffset, parallaxSize } from "./embedded-media.ts";
import { useLayout, useNav } from "./hooks.ts";

/**
 * reveal.js's parallax background: one large image behind every slide (`parallaxBackgroundImage`)
 * that moves a little with each slide — left as the deck goes right, up as it goes down — so the
 * deck seems to travel across it. The position is reveal's `updateParallax`, in the screen pixels
 * of the stage's box, as reveal's is in the window's; a slide's own background covers it.
 *
 * reveal reads the image's size only from `parallaxBackgroundSize` (in pixels). Without one, the
 * image's own size is used once it has loaded, so the steps still spread it across the deck.
 */
export function Parallax() {
  const deck = useDeck();
  const layout = useLayout();
  const { h, v } = useNav((s) => ({ h: s.h, v: s.v }));
  const {
    parallaxBackgroundImage: image,
    parallaxBackgroundSize: size,
    parallaxBackgroundHorizontal: horizontal,
    parallaxBackgroundVertical: vertical,
  } = deck.config;
  const given = parallaxSize(size);
  const [natural, setNatural] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!image || given) return;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setNatural([img.naturalWidth, img.naturalHeight]);
    img.src = image;
    return () => {
      alive = false;
    };
  }, [image, !!given]);
  if (!image) return null;
  const imageSize = given ?? natural;
  const verticalSlides = deck.columns.reduce(
    (n, c) => n + (c.slides.length > 1 ? c.slides.length : 0),
    0,
  );
  const offset = imageSize
    ? parallaxOffset({
        h,
        v,
        columns: deck.columns.length,
        verticalSlides,
        image: imageSize,
        box: [layout.width, layout.height],
        horizontal,
        vertical,
      })
    : { x: 0, y: 0 };
  // reveal's 0.8 s ease, 0.4 s on a fast deck and 1.2 s on a slow one.
  const speed = deck.config.transitionSpeed;
  const ms = speed === "fast" ? 400 : speed === "slow" ? 1200 : 800;
  return (
    <div
      className="deck-parallax"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url("${image}")`,
        // reveal leaves repeat at the CSS default (repeat), so a short image tiles.
        backgroundSize: size || undefined,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
        transition: `background-position ${ms}ms ease`,
      }}
    />
  );
}
