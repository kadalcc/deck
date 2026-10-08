import type { ReactNode } from "react";

import { backgroundComponent } from "../react/Backgrounds.tsx";
import { useSlide } from "../react/context.ts";

/**
 * A component background inside a slide — the RLA deck's pattern of an absolutely positioned
 * animated layer under the content. `<Background name="aurora" />` picks a registered one;
 * children make a custom one.
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
  const Comp = name ? backgroundComponent(name) : null;
  return (
    <div
      className={["deck-slide-background", className].filter(Boolean).join(" ")}
      style={{ opacity }}
      aria-hidden
    >
      {Comp ? <Comp {...props} active={slide.active} /> : children}
    </div>
  );
}
