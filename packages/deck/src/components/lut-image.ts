import { useEffect, useState } from "react";

import { useStillHold } from "../react/still-holds.ts";
import { lutStrengthOf } from "./lut.ts";

/**
 * An image's address with a `.cube` LUT applied (components/lut-gl.ts, loaded only when a deck
 * grades something). `state` says where it is: "pending" while the grade is made — the image is
 * kept invisible meanwhile (up to 6 s), so the ungraded picture never flashes; "on" once it is
 * shown graded; "off" when it can't be (no WebGL2, a picture without CORS, a LUT that won't
 * read): the image as it is. A printed page waits for it (react/still-holds.ts).
 */
export function useGradedSrc(
  src: string | undefined,
  lut: string | undefined,
  strength: unknown,
  print: boolean,
): { src: string | undefined; state: "on" | "off" | "pending" | null } {
  const mix = lutStrengthOf(strength);
  const wanted = !!(src && lut && mix > 0);
  const key = wanted ? `${src}\n${lut}\n${mix}` : null;
  const [done, setDone] = useState<{ key: string; url: string | null } | null>(null);
  const settled = done !== null && done.key === key;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    // A grade that takes too long (a slow LUT host) shows the picture ungraded meanwhile.
    const slow = setTimeout(
      () => alive && setDone((d) => (d?.key === key ? d : { key, url: null })),
      6000,
    );
    import("./lut-gl.ts")
      .then((m) => m.gradeImage(src!, lut!, mix))
      .then(
        (url) => alive && setDone({ key, url }),
        (e: unknown) => {
          if (!alive) return;
          console.warn(`[kadal-deck] lut: ${lut} not applied to ${src}:`, e);
          setDone({ key, url: null });
        },
      );
    return () => {
      alive = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useStillHold(print, wanted && !settled);
  if (!wanted) return { src, state: null };
  if (!settled) return { src, state: "pending" };
  return done.url ? { src: done.url, state: "on" } : { src, state: "off" };
}
