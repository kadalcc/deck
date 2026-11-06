import type { AnimationItem, LottiePlayer } from "lottie-web";
// @ts-expect-error — the light ES build ships no types of its own; lottie-web's are its API.
import lottieLight from "lottie-web/build/player/esm/lottie_light.min.js";

import { type LottieData, lottieInfo, readLottie } from "./dotlottie.ts";

/**
 * The Lottie player, loaded only when a slide shows a `<Lottie>` (components/Lottie.tsx): lottie-web's
 * light build — the SVG renderer alone, no expressions (so no `eval`), about 45 KB gzipped — over
 * the data dotlottie.ts reads from a .json or a .lottie.
 */
const lottie = lottieLight as LottiePlayer;

const files = new Map<string, Promise<LottieData>>();

/** A Lottie file's data, fetched once per page (address and animation). */
function lottieData(src: string, animation?: string): Promise<LottieData> {
  const key = `${src}\n${animation ?? ""}`;
  let got = files.get(key);
  if (!got) {
    got = fetch(src, { credentials: "omit" }).then(async (res) => {
      if (!res.ok) throw new Error(`${src}: ${res.status}`);
      return readLottie(new Uint8Array(await res.arrayBuffer()), animation);
    });
    got.catch(() => files.delete(key));
    files.set(key, got);
  }
  return got;
}

export interface MountedLottie {
  item: AnimationItem;
  width: number;
  height: number;
}

/** One animation in `container`, stopped at its first frame and drawn, ready to be driven. */
export async function mountLottie(
  container: HTMLElement,
  src: string,
  o: { loop: boolean; speed: number; animation?: string },
): Promise<MountedLottie> {
  const shared = await lottieData(src, o.animation);
  // lottie-web completes the data in place: every player gets its own copy.
  const data = structuredClone(shared);
  const base =
    typeof location !== "undefined" ? new URL(".", new URL(src, location.href)).href : "";
  const item = lottie.loadAnimation({
    container,
    renderer: "svg",
    loop: o.loop,
    autoplay: false,
    animationData: data,
    // A .json's own images, beside it (a .lottie's are embedded already).
    assetsPath: base,
    rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false },
  });
  item.setSpeed(o.speed);
  await new Promise<void>((resolve, reject) => {
    if (item.isLoaded) return resolve();
    item.addEventListener("DOMLoaded", () => resolve());
    item.addEventListener("data_failed", () => reject(new Error(`${src}: the player refused it`)));
  });
  item.goToAndStop(0, true);
  const info = lottieInfo(shared);
  return { item, width: info.width, height: info.height };
}
