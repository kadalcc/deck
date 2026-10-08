import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useDeck, useSlideOptional } from "../react/context.ts";
import {
  type IslandMount,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
  type Resolution,
  resolveRenderer,
  resolveRendererAsync,
} from "./contract.ts";

/**
 * When an island comes alive.
 *
 *   slide    when its slide is the one being shown, and torn down when it is left  (the default)
 *   load     as soon as it is rendered
 *   visible  when it scrolls into view — for the scroll view and long slides
 *   idle     when the browser next has nothing better to do
 *   none     never: the static fallback is the whole story
 *
 * `slide` is the default and is the one a deck actually wants. Astro's strategies all assume a page
 * you scroll; a deck is twenty pages deep where nineteen are off-screen but mounted — the engine
 * keeps neighbours ready so transitions do not stall. Hydrating all of them is how a phone runs out
 * of memory on slide three. This way a live map exists for exactly as long as it is being looked at.
 */
export type ClientStrategy = "slide" | "load" | "visible" | "idle" | "none";

/** A dynamic import of a component, in whatever shape the module exports it. */
export type IslandLoader = () => Promise<IslandComponent | { default: IslandComponent }>;

export interface IslandOwnProps {
  /** The component, in whatever framework wrote it. Omit when passing `load`. */
  component?: IslandComponent;
  /**
   * Fetch the component when the island arms, instead of importing it with the slide.
   *
   *     <Island framework="vue" load={() => import("./chart.ts").then((m) => m.Chart)} />
   *
   * This is the half of islands that is about bytes rather than lifetime: with `load`, neither the
   * component nor — paired with `registerLazyRenderer` — its framework's runtime is in the deck's
   * first chunk. Read once, when the island first arms; the component it names is the island's
   * identity for as long as the island lives.
   */
  load?: IslandLoader;
  /** Name the renderer explicitly. Otherwise the build's stamp decides, then `owns()`. */
  framework?: string;
  client?: ClientStrategy;
  /** Passed through to the component. Compared shallowly: new identities alone do not remount. */
  props?: IslandProps;
  /** Shown before the island is alive, and instead of it where it never will be. */
  fallback?: ReactNode;
  className?: string;
  /** Rendered to HTML and handed over as `context.slot`. */
  children?: ReactNode;
}

function shallowEqual(a: IslandProps, b: IslandProps): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => Object.is(a[k], b[k]));
}

/**
 * A thunk may resolve to a module or to a component. For every framework whose component is a
 * value, the module's `default` IS the component, so that is what is taken.
 *
 * The exception worth naming: a module whose `default` is an *initialiser* rather than a component
 * — `wasm-bindgen --target web` emits exactly that. Unwrapping one yields the init function and the
 * failure is silent, so such a module is adapted by its own renderer before it gets here. See
 * `wasmBindgenModule` in `@kadal/deck-wasm`.
 */
function unwrap(module: IslandComponent | { default: IslandComponent }): IslandComponent {
  return module && typeof module === "object" && "default" in module ? module.default : module;
}

/**
 * One piece of another framework, living inside a slide.
 *
 * The React case is deliberately NOT an island: when the resolved renderer is the one the deck
 * runtime draws with, the component is rendered straight into the tree. An island would work, but
 * it would open a second React root, and everything the deck puts in context — the click state, the
 * theme, the live room, the glossary — stops at a root boundary. Native stays native.
 */
export function Island({
  component,
  load,
  framework,
  client = "slide",
  props = {},
  fallback = null,
  className,
  children,
}: IslandOwnProps) {
  const deck = useDeck();
  const slide = useSlideOptional();
  const host = useRef<HTMLDivElement>(null);
  const slotHost = useRef<HTMLDivElement>(null);
  const mounted = useRef<IslandMount | null>(null);
  const lastProps = useRef<IslandProps>(props);

  // `load` written inline in a slide is a new function on every render, so it is read through a ref
  // rather than depended on. Nothing about a deck wants an island to re-import itself mid-sentence.
  const loader = useRef(load);
  loader.current = load;

  const printing = deck.mode === "print";

  // `slide` asks the slide; everything else is about the browser. A printed page has no "current
  // slide" and every island on it is wanted at once.
  const slideWants = printing || (slide?.active ?? true);
  const [armed, setArmed] = useState(() => client === "load" || (client === "slide" && slideWants));

  useEffect(() => {
    if (client === "none") return;
    if (client === "load") return setArmed(true);
    if (client === "slide") return setArmed(slideWants);
    if (client === "idle") {
      // TypeScript's DOM library says this always exists; Safari only shipped it recently, so the
      // check stays and the timeout is the fallback.
      const hasIdle = typeof window.requestIdleCallback === "function";
      const id = hasIdle
        ? window.requestIdleCallback(() => setArmed(true))
        : window.setTimeout(() => setArmed(true), 200);
      return () => {
        if (hasIdle) window.cancelIdleCallback?.(id as number);
        else clearTimeout(id as number);
      };
    }
    const el = host.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setArmed(true);
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setArmed(true),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [client, slideWants]);

  /* ── the component ──────────────────────────────────────────────────────── */

  // Boxed, and this is not a style choice. A component from almost every framework is a plain
  // function, and `setState(fn)` means "call fn with the previous state" to React — so storing one
  // directly makes React invoke the island's component with a single argument, as a state updater.
  // Svelte's props land in the second argument, so it read `undefined.label` and took the slide
  // down with it. Vue hid this for a while by being an object.
  const [fetched, setFetched] = useState<{ component: IslandComponent } | null>(null);
  const target = component ?? fetched?.component;

  useEffect(() => {
    if (component !== undefined || !armed) return;
    const fetch = loader.current;
    if (!fetch) return;
    let live = true;
    void fetch()
      .then((module) => live && setFetched({ component: unwrap(module) }))
      .catch((error: unknown) => {
        console.error("[deck] an island's component failed to load:", error);
      });
    return () => {
      live = false;
    };
  }, [component, armed]);

  /* ── the renderer, which may also have to be fetched ────────────────────── */

  // What is knowable without loading anything. Synchronous so a renderer already in the page
  // mounts in the same commit, with no frame of fallback.
  const immediate = useMemo<Resolution | null>(
    () => (target === undefined ? null : resolveRenderer(target, framework)),
    [target, framework],
  );
  const [arrived, setArrived] = useState<Resolution | null>(null);

  useEffect(() => {
    if (!immediate || immediate.how !== "deferred" || !armed) return;
    let live = true;
    void resolveRendererAsync(target, framework).then((r) => live && setArrived(r));
    return () => {
      live = false;
    };
  }, [immediate, armed, target, framework]);

  // `arrived` only ever answers the question `immediate` asked; a different component or framework
  // makes it stale, and a stale renderer is how you mount Vue into a Svelte island.
  const resolution =
    immediate?.how === "deferred" && arrived?.renderer ? arrived : (immediate ?? null);
  const renderer = resolution?.renderer ?? null;
  const native = renderer?.native ?? false;

  useEffect(() => {
    if (native || !renderer || !armed || target === undefined) return;
    const el = host.current;
    if (!el) return;
    const context: RenderContext = {
      slot: slotHost.current?.innerHTML || undefined,
      scheme: document.documentElement.dataset.colorScheme === "dark" ? "dark" : "light",
      // Printing and exporting photograph a moment; a loop started here would only blur it.
      animate: !printing && !(slide?.preview ?? false),
    };
    let live: IslandMount | null = null;
    try {
      live = renderer.mount(el, target, lastProps.current, context);
      mounted.current = live;
    } catch (error) {
      // One island failing is not the slide failing. The deck has carried a broken slide in place
      // since the beginning; this is the same promise one level down.
      console.error(`[deck] island “${renderer.name}” failed to mount:`, error);
      el.dataset.islandError = error instanceof Error ? error.message : String(error);
    }
    return () => {
      mounted.current = null;
      try {
        live?.destroy();
      } catch (error) {
        console.error(`[deck] island “${renderer.name}” failed to tear down:`, error);
      }
      el.replaceChildren();
      delete el.dataset.islandError;
    };
  }, [native, renderer, armed, target, printing, slide?.preview]);

  // New props without a remount where the renderer can take them; a remount where it cannot, which
  // is correct but costs the island whatever it was holding.
  useEffect(() => {
    if (shallowEqual(lastProps.current, props)) return;
    lastProps.current = props;
    const live = mounted.current;
    if (!live) return;
    if (live.update) {
      try {
        live.update(props);
      } catch (error) {
        console.error("[deck] island refused new props:", error);
      }
      return;
    }
    const el = host.current;
    if (!el || !renderer || target === undefined) return;
    try {
      live.destroy();
      el.replaceChildren();
      mounted.current = renderer.mount(el, target, props, {
        slot: slotHost.current?.innerHTML || undefined,
        animate: !printing,
      });
    } catch (error) {
      console.error("[deck] island failed to remount with new props:", error);
    }
  }, [props, renderer, target, printing]);

  /* ── what the slide shows ───────────────────────────────────────────────── */

  // Nothing to draw and nothing on the way: that is an authoring mistake, and the slide says so
  // rather than rendering an empty box someone has to open devtools to understand.
  if (component === undefined && !load) {
    return (
      <div className={["deck-island", "is-unresolved", className].filter(Boolean).join(" ")}>
        <span className="deck-island-error">Island: pass a component, or load to fetch one</span>
      </div>
    );
  }

  if (resolution?.how === "unknown") {
    return (
      <div className={["deck-island", "is-unresolved", className].filter(Boolean).join(" ")}>
        <span className="deck-island-error">Island: {resolution.reason}</span>
      </div>
    );
  }

  // The deck's own framework: straight into the tree, with all of the deck's context intact.
  if (native) {
    const Component = target as (p: IslandProps) => ReactNode;
    return (
      <div className={["deck-island", "is-native", className].filter(Boolean).join(" ")}>
        <Component {...props}>{children}</Component>
      </div>
    );
  }

  // Still fetching the component, or the renderer, or both. The fallback is the whole slide for as
  // long as that takes, which is one network round trip on the first visit and nothing after.
  const pending = renderer === null;
  const name = renderer?.name ?? (resolution?.how === "deferred" ? resolution.name : framework);

  return (
    <div
      className={[
        "deck-island",
        name ? `is-${name}` : null,
        pending ? "is-pending" : armed ? "is-live" : "is-waiting",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-framework={name}
      data-client={client}
    >
      {/* Children are rendered here, hidden, only so their HTML can be handed to the island. */}
      <div className="deck-island-slot" hidden ref={slotHost}>
        {children}
      </div>
      <div className="deck-island-host" ref={host} />
      {armed && !pending ? null : fallback}
    </div>
  );
}
