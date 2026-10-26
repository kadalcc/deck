import type { ReactNode } from "react";

import { isPremiumName } from "../core/premium.ts";
import { UnknownBackground, backgroundComponent } from "../react/Backgrounds.tsx";
import { useSlide } from "../react/context.ts";
import { useEffectiveScheme } from "./Contextual.tsx";
import { PremiumBackground, PremiumNotice } from "../react/premium.tsx";

/**
 * A component background inside a slide — the RLA deck's pattern of an absolutely positioned
 * animated layer under the content. `<Background name="aurora" />` picks a registered one;
 * children make a custom one. `name="pro/…"` is one from the host's library (react/premium.tsx).
 */
export function Background({
  name,
  children,
  opacity = 1,
  className,
  ...props
}: {
  name?: string;
  children?: ReactNode;
  opacity?: number;
  className?: string;
  [key: string]: unknown;
}) {
  const slide = useSlide();
  const scheme = useEffectiveScheme();
  if (isPremiumName(name))
    return (
      <>
        <div
          className={["deck-slide-background", className].filter(Boolean).join(" ")}
          style={{ opacity }}
          aria-hidden
        >
          <PremiumBackground
            name={name}
            props={props}
            active={slide.active}
            still={slide.preview}
            click={slide.click}
          />
        </div>
        {slide.active && !slide.preview ? <PremiumNotice background={name} layout={null} /> : null}
      </>
    );
  const Comp = name ? backgroundComponent(name) : null;
  return (
    <div
      className={["deck-slide-background", className].filter(Boolean).join(" ")}
      style={{ opacity }}
      aria-hidden
    >
      {Comp ? (
        <Comp {...props} active={slide.active} scheme={scheme} click={slide.click} />
      ) : name && !children && !slide.preview ? (
        <UnknownBackground name={name} />
      ) : (
        children
      )}
    </div>
  );
}
