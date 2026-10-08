import { type ComponentType, useEffect, useState } from "react";

import type { SlideBackground } from "../core/model.ts";
import { useDeck } from "./context.ts";
import { useLayout, useNav } from "./hooks.ts";

/**
 * Backgrounds sit behind the stage and cover exactly its box — a colour, a gradient, an image, a
 * looping video, an iframe, or a registered component (the `backgrounds` module ships aurora,
 * gradient mesh, waves and the rest). On a 16:9 window that is the whole viewport; on any other
 * shape the bars around the stage stay bars, so a slide looks the same on every screen. The
 * current and the leaving background are both rendered during a change so they can cross-fade.
 */
const registry = new Map<string, ComponentType<Record<string, unknown>>>();

export function registerBackground(
  name: string,
  component: ComponentType<Record<string, unknown>>,
) {
  registry.set(name, component);
}

export function backgroundComponent(name: string) {
  return registry.get(name) ?? null;
}

/**
 * One colour as a soft wash: strongest at the top-left, fading diagonally to a pale tint, with
 * a little extra light in that corner — the same palette, never flat. `color-mix` with
 * transparent scales the colour's own alpha, so any CSS colour works, rgba included.
 */
export function tintWash(color: string): string {
  const at = (pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`;
  return [
    `radial-gradient(110% 85% at 10% 0%, ${at(80)} 0%, ${at(0)} 62%)`,
    `linear-gradient(158deg, ${at(100)} 0%, ${at(64)} 48%, ${at(36)} 100%)`,
  ].join(", ");
}

export function BackgroundLayer({
  bg,
  active,
  className,
}: {
  bg: SlideBackground | null;
  active: boolean;
  className?: string;
}) {
  if (!bg)
    return (
      <div
        className={["deck-background", className].filter(Boolean).join(" ")}
        data-active={active || undefined}
      />
    );
  const style: React.CSSProperties = {};
  if (bg.color) style.backgroundColor = bg.color;
  if (bg.tint) style.backgroundImage = tintWash(bg.tint);
  if (bg.gradient) style.backgroundImage = bg.gradient;
  if (bg.image) {
    style.backgroundImage = `url("${bg.image}")`;
    style.backgroundSize = bg.size;
    style.backgroundPosition = bg.position;
    style.backgroundRepeat = bg.repeat;
  }
  const Comp = bg.component ? registry.get(bg.component) : null;
  return (
    <div
      className={["deck-background", className].filter(Boolean).join(" ")}
      data-active={active || undefined}
    >
      <div className="deck-background-fill" style={{ ...style, opacity: bg.opacity }} />
      {bg.video ? (
        <video
          className="deck-background-video"
          src={bg.video}
          autoPlay={active}
          loop={bg.videoLoop}
          muted={bg.videoMuted}
          playsInline
          style={{ objectFit: bg.size === "contain" ? "contain" : "cover", opacity: bg.opacity }}
        />
      ) : null}
      {bg.iframe ? (
        <iframe
          className="deck-background-iframe"
          src={active ? bg.iframe : undefined}
          title="background"
          style={{ pointerEvents: bg.iframeInteractive ? "auto" : "none", opacity: bg.opacity }}
        />
      ) : null}
      {Comp ? (
        <div className="deck-background-component" style={{ opacity: bg.opacity }}>
          <Comp {...bg.props} active={active} />
        </div>
      ) : bg.component ? (
        <div className="deck-background-missing">Unknown background “{bg.component}”</div>
      ) : null}
    </div>
  );
}

/** The two-layer background stack for the play view, clipped to the stage's box. */
export function Backgrounds() {
  const deck = useDeck();
  const layout = useLayout();
  const { h, v, direction } = useNav((s) => ({ h: s.h, v: s.v, direction: s.direction }));
  const current = deck.options.get(`${h},${v}`)?.background ?? null;
  const [layers, setLayers] = useState<
    { key: string; bg: SlideBackground | null; leaving: boolean }[]
  >([{ key: `${h},${v}`, bg: current, leaving: false }]);
  const transition =
    deck.options.get(`${h},${v}`)?.backgroundTransition ?? deck.config.backgroundTransition;

  useEffect(() => {
    const key = `${h},${v}`;
    setLayers((prev) => {
      const top = prev.find((l) => !l.leaving);
      if (top?.key === key) return prev;
      return [...(top ? [{ ...top, leaving: true }] : []), { key, bg: current, leaving: false }];
    });
    const t = setTimeout(
      () => setLayers((prev) => prev.filter((l) => !l.leaving)),
      transitionMs(deck.config.transitionSpeed),
    );
    return () => clearTimeout(t);
  }, [h, v, current, deck.config.transitionSpeed]);

  return (
    <div
      className="deck-backgrounds"
      style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}
      data-transition={transition}
      data-direction={direction}
    >
      {layers.map((l) => (
        <BackgroundLayer
          key={l.key}
          bg={l.bg}
          active={!l.leaving}
          className={l.leaving ? "is-leaving" : "is-entering"}
        />
      ))}
    </div>
  );
}

export function transitionMs(speed: "default" | "fast" | "slow"): number {
  return speed === "fast" ? 300 : speed === "slow" ? 1000 : 600;
}
