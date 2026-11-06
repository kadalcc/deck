import {
  type CSSProperties,
  createElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { useDeck, useSlideOptional } from "../react/context.ts";
import { useRenderContext } from "../react/render-context.ts";
import { useStillHold } from "../react/still-holds.ts";
import { Drag } from "./Drag.tsx";
import {
  CreditLabel,
  HoverCredit,
  type MediaCreditProps,
  stickerCredit,
  useReducedMotion,
  useReportHref,
} from "./media.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * <Model>  —  a 3D model (glTF binary, .glb) to turn in the hand
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <Model src="/models/chair.glb" poster="/models/chair.png" alt="An oak chair" />
 *   <Model src="…/robot.glb" poster="…/robot.png" x={1180} y={240} size={560} autoRotate={false} />
 *
 * Google's <model-viewer>, loaded only when a slide shows a model: it keeps one WebGL context for
 * every model on the page (a deck mounts a slide several times — the stage, the presenter's
 * copy, its next box — and browsers allow only a handful of contexts), restores it after a GPU
 * reset, lights a model with a neutral studio environment and PBR tone mapping, and turns it
 * with the mouse, a finger or the keyboard. Its own size is about 250 KB gzipped (three.js
 * included), in a chunk of its own.
 *
 * Placed like a `<Sticker>` when it has `x`, `y` or `pos` (stage pixels, a drag site in
 * `kadal-deck dev`), else in the flow of the slide; `size` is its width and `height` its height
 * (default: square). Dragging it turns it (`controls`, on by default; the wheel's zoom only with
 * `zoom`), and the slide's keys stay the deck's once the pointer lets go. It turns by itself
 * (`autoRotate`, on by default, `rotateSpeed` degrees a second) only on the slide being shown
 * and never under reduced motion. `camera` ("30deg 75deg 2.5m": turn, tilt, distance), `target`,
 * `fov`, `exposure`, `shadow` (0–2) and `environment` (an HDR or image to light it by) pass to the
 * viewer as its camera-orbit, camera-target, field-of-view, exposure, shadow-intensity and
 * environment-image.
 *
 * Print, the exports, the overview and the presenter's next-slide box show `poster`; without one
 * they draw the model at rest, and a printed page waits for it. A lost GPU context shows the
 * poster until the slide is shown again. Draco- or KTX2-compressed models fetch their decoders
 * from Google's CDN (gstatic.com) — export compressed models with Meshopt or none to stay offline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ModelProps extends MediaCreditProps {
  /** A .glb (or .gltf) file: same origin, or served with CORS. */
  src: string;
  /** A still image of it: print, exports, the overview, while it loads, and if WebGL fails. */
  poster?: string;
  /** What it shows, for screen readers. */
  alt?: string;
  /** Turn it with the pointer (default true). */
  controls?: boolean;
  /** Let the wheel and a pinch zoom (default false: the wheel stays the deck's). */
  zoom?: boolean;
  /** Turn by itself while its slide is shown (default true; never under reduced motion). */
  autoRotate?: boolean;
  /** Degrees a second when it turns by itself (default 30). */
  rotateSpeed?: number;
  /** Where the camera starts: "turn tilt distance" ("30deg 75deg 2.5m", "0deg 90deg auto"). */
  camera?: string;
  /** The point it looks at ("0m 0.5m 0m"; default the model's centre). */
  target?: string;
  /** Field of view ("30deg"; default auto). */
  fov?: string;
  /** Brightness (default 1). */
  exposure?: number;
  /** The ground shadow's strength, 0–2 (default 1). */
  shadow?: number;
  /** An equirectangular HDR or image to light it by (default: a neutral studio). */
  environment?: string;
  /** Width in px (stage pixels when placed; default 480). */
  size?: number;
  /** Height in px (default: its width). */
  height?: number;
  /** Left edge in stage pixels: places it over the slide, like a `<Sticker>`. */
  x?: number;
  /** Top edge in stage pixels. */
  y?: number;
  /** "x,y,w,h[,r]" — what dragging it in `kadal-deck dev` writes; wins over x/y/size. */
  pos?: string;
  /** The provider's id for it ("kse_…"). Without a provider, `id` is the element's id. */
  id?: string;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}

/** Where a placed model starts: its x/y (default centred), `size` wide and `height` tall (pure). */
export function modelPlace(
  p: Pick<ModelProps, "x" | "y" | "size" | "height">,
  stage: { width: number; height: number },
): string {
  const w = Number.isFinite(p.size) && p.size! > 0 ? Math.round(p.size!) : 480;
  const h = Number.isFinite(p.height) && p.height! > 0 ? Math.round(p.height!) : w;
  const x = Number.isFinite(p.x) ? Math.round(p.x!) : Math.round((stage.width - w) / 2);
  const y = Number.isFinite(p.y) ? Math.round(p.y!) : Math.round((stage.height - h) / 2);
  return `${x},${y},${w},${h}`;
}

/** The viewer's attributes for these props, in this place (pure; tested). */
export function modelAttributes(
  p: Pick<
    ModelProps,
    | "src"
    | "poster"
    | "alt"
    | "controls"
    | "zoom"
    | "autoRotate"
    | "rotateSpeed"
    | "camera"
    | "target"
    | "fov"
    | "exposure"
    | "shadow"
    | "environment"
  >,
  o: { live: boolean; still: boolean; reduced: boolean },
): Record<string, string | boolean | undefined> {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
  const interactive = !o.still && p.controls !== false;
  const turning = o.live && !o.reduced && p.autoRotate !== false;
  const speed =
    typeof p.rotateSpeed === "number" && Number.isFinite(p.rotateSpeed) ? p.rotateSpeed : 30;
  return {
    src: p.src,
    poster: p.poster,
    alt: p.alt,
    "camera-controls": interactive || undefined,
    "disable-zoom": interactive && !p.zoom ? true : undefined,
    "auto-rotate": turning || undefined,
    "auto-rotate-delay": turning ? "0" : undefined,
    "rotation-per-second": turning ? `${speed}deg` : undefined,
    "camera-orbit": p.camera,
    "camera-target": p.target,
    "field-of-view": p.fov,
    exposure: num(p.exposure),
    "shadow-intensity": num(p.shadow) ?? "1",
    "environment-image": p.environment,
    "interaction-prompt": "none",
    loading: "eager",
    reveal: "auto",
  };
}

let viewer: Promise<unknown> | null = null;
/** <model-viewer>, defined once per page; a failure is not kept, so a later slide may try again. */
function loadViewer(): Promise<unknown> {
  viewer ??= import("@google/model-viewer").catch((e: unknown) => {
    viewer = null;
    throw e;
  });
  return viewer;
}

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

export function Model({
  src,
  poster,
  alt = "",
  controls,
  zoom,
  autoRotate,
  rotateSpeed,
  camera,
  target,
  fov,
  exposure,
  shadow,
  environment,
  size,
  height,
  x,
  y,
  pos,
  provider,
  id,
  credit,
  creditUrl,
  license: _license,
  licenseUrl: _licenseUrl,
  className,
  style,
  ...rest
}: ModelProps) {
  const deck = useDeck();
  const slide = useSlideOptional();
  const where = useRenderContext();
  const reduced = useReducedMotion();
  // Turns only on the slide being shown; a still everywhere else.
  const still =
    where.print ||
    !slide ||
    slide.preview ||
    !(where.context === "slide" || where.context === "presenter");
  const live = !still && !!slide?.active;
  const posterOnly = still && !!poster;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lost, setLost] = useState(false);
  const [mount, setMount] = useState(0);
  const el = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (posterOnly) return;
    let alive = true;
    loadViewer().then(
      () => alive && setReady(true),
      (e: unknown) => {
        if (!alive) return;
        console.warn("[kadal-deck] <Model>: the viewer did not load:", e);
        setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [posterOnly]);

  // A lost context shows the poster; the next showing of the slide tries a fresh viewer.
  useEffect(() => {
    if (live && lost) {
      setLost(false);
      setLoaded(false);
      setMount((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    const v = el.current;
    if (!v) return;
    const onLoad = () => setLoaded(true);
    const onError = (e: Event) => {
      const type = (e as CustomEvent<{ type?: string }>).detail?.type;
      console.warn(`[kadal-deck] <Model src="${src}">: ${type ?? "error"}`);
      if (type === "webglcontextlost") setLost(true);
      else setFailed(true);
    };
    v.addEventListener("load", onLoad);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("load", onLoad);
      v.removeEventListener("error", onError);
    };
  }, [ready, mount, src]);

  // A printed page without a poster waits for the model to be drawn (or to fail).
  useStillHold(where.print, !posterOnly && !failed && !loaded);

  const own = stickerCredit({ provider, credit, creditUrl });
  const report = useReportHref(own ? src : undefined);
  const attrs = modelAttributes(
    {
      src,
      poster,
      alt,
      controls,
      zoom,
      autoRotate,
      rotateSpeed,
      camera,
      target,
      fov,
      exposure,
      shadow,
      environment,
    },
    { live, still, reduced },
  );
  const interactive = attrs["camera-controls"] === true;
  const showPoster = !!poster && (posterOnly || !ready || failed || lost);
  const body: ReactNode = (
    <>
      {ready && !posterOnly && !failed
        ? createElement("model-viewer", {
            key: mount,
            ref: el,
            className: "deck-model-viewer",
            ...attrs,
            // The slide's clicks and swipes are not the model's turns; the keys go back to the
            // deck once the pointer lets go.
            ...(interactive
              ? {
                  onPointerDown: stop,
                  onClick: stop,
                  onTouchStart: stop,
                  onWheel: attrs["disable-zoom"] ? undefined : stop,
                  onPointerUp: (e: { currentTarget: HTMLElement }) => e.currentTarget.blur(),
                }
              : {}),
          })
        : null}
      {showPoster ? (
        <img className="deck-model-poster" src={poster} alt="" draggable={false} decoding="async" />
      ) : null}
      {!poster && (failed || lost) ? (
        <span className="deck-model-fallback">{alt || "3D model"}</span>
      ) : null}
      {!where.print ? (
        <HoverCredit report={report}>{own ? <CreditLabel credit={own} /> : null}</HoverCredit>
      ) : null}
    </>
  );
  const box = ["deck-model", interactive && "is-interactive"].filter(Boolean).join(" ");
  const label = { role: "img", "aria-label": alt || "3D model" };
  const elementId = id && !provider ? { id } : {};

  if (x !== undefined || y !== undefined || pos !== undefined) {
    return (
      <Drag
        {...rest}
        {...elementId}
        pos={pos}
        place={modelPlace(
          { x, y, size, height },
          { width: deck.config.width || 1920, height: deck.config.height || 1080 },
        )}
        className={["deck-model-placed", className].filter(Boolean).join(" ")}
        style={style}
      >
        <span className={box} {...label}>
          {body}
        </span>
      </Drag>
    );
  }
  const w = Number.isFinite(size) && size! > 0 ? size! : 480;
  const h = Number.isFinite(height) && height! > 0 ? height! : w;
  return (
    <span
      {...rest}
      {...elementId}
      {...label}
      className={[box, className].filter(Boolean).join(" ")}
      style={{ width: `${w}px`, aspectRatio: `${w} / ${h}`, ...style }}
    >
      {body}
    </span>
  );
}
