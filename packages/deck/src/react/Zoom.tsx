import type { ReactNode } from "react";

import { useDeck } from "./context.ts";
import { useLayout, useUi } from "./hooks.ts";

/** Alt+click zoom: the stage scales up around the clicked point; click again or Esc to return. */
export function ZoomLayer({ children }: { children: ReactNode }) {
  const zoom = useUi((s) => s.zoom);
  const layout = useLayout();
  const deck = useDeck();
  const style: React.CSSProperties = zoom
    ? {
        transformOrigin: `${layout.left + zoom.x * layout.scale}px ${layout.top + zoom.y * layout.scale}px`,
        transform: `scale(${zoom.scale})`,
        transition: "transform 0.6s ease",
      }
    : { transition: "transform 0.6s ease" };
  void deck;
  return (
    <div className="deck-zoom" style={style} data-zoomed={zoom ? "true" : undefined}>
      {children}
    </div>
  );
}
