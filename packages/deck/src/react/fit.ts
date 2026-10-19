import { type RefObject, useEffect, useState } from "react";

/** Fit the authored canvas into a box: scale to the shorter side, centre the rest. */
export function useFit(box: RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [fit, setFit] = useState({ scale: 0.2, left: 0, top: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const scale = Math.min(el.clientWidth / width, el.clientHeight / height);
      setFit({
        scale,
        left: (el.clientWidth - width * scale) / 2,
        top: (el.clientHeight - height * scale) / 2,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, width, height]);
  return fit;
}
