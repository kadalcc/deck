import { type RefObject, useEffect, useState } from "react";

import { centreOnPixels } from "../core/layout.ts";

/** Fit the authored canvas into a box: scale to the shorter side, centre the rest on whole pixels. */
export function useFit(box: RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [fit, setFit] = useState({ scale: 0.2, left: 0, top: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const box = { width: el.clientWidth, height: el.clientHeight };
      const scale = Math.min(box.width / width, box.height / height);
      const { left, top, scale: s } = centreOnPixels(width, height, scale, box, devicePixelRatio);
      setFit({ scale: s, left, top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, width, height]);
  return fit;
}
