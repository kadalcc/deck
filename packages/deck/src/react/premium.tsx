import * as React from "react";
import { type ComponentType, useEffect, useState, useSyncExternalStore } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import pkg from "../../package.json" with { type: "json" };
import { readHostOverride } from "../core/model.ts";
import type { SlideBackground } from "../core/model.ts";
import {
  type LoadedItem,
  type PremiumEntry,
  type PremiumFailure,
  type PremiumKind,
  failureForStatus,
  isPremiumName,
  moduleUrl,
  parseCatalog,
  premiumBase,
  readPremiumModule,
} from "../core/premium.ts";
import { DeckContext, useDeck, useSlide, useSlideOptional } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REMOTE PACKS, THE REACT SIDE  (the contract is in core/premium.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE RUNTIME GLOBAL. A remote module must not bring its own React — two Reacts on a page break
 * every hook — so before the first `import()` the engine publishes its own, once:
 *
 *   window.__KADAL_DECK_RUNTIME__ = {
 *     contract: 1,
 *     version,      // this engine's version, "0.5.0"
 *     React,        // the `react` module namespace the deck runs on
 *     jsx,          // the `react/jsx-runtime` namespace: { jsx, jsxs, Fragment }
 *     components,   // the engine's built-in slide components (Click, Code, Image, …)
 *     hooks,        // { useDeck, useSlide, useSlideOptional }
 *   }
 *
 * It is frozen and never replaced (a second engine on the page keeps the first one's). A module
 * reads it when it is evaluated: `react` and `react/jsx-runtime` in its source are shims over it.
 * Additions are made by adding keys; nothing listed is ever removed or changed in meaning within
 * `contract: 1`.
 *
 * THE LOADER. One per premium base: the catalog is fetched once (`credentials: "include"` — on
 * our host the gate is a session or the deck itself), each module `import()`ed once, and each
 * item's state — loading, ready, failed — kept so every slide using it renders from the same
 * cache. React subscribes through useSyncExternalStore. An item's `css` is added to the page
 * once, as `<style data-kadal-premium="<id>">`.
 *
 * WHAT A SLIDE SEES. While an item loads, and for good if it fails, the slide has the theme's
 * own: no background layer of its own (the theme's), the `default` layout. A layout swaps in
 * when ready (the default rendered meanwhile, so nothing jumps); a background fades in. A
 * published deck says nothing about a failure. An author — `kadal-deck dev`, a builder preview
 * (`?preview`) — gets a small chip on the slide saying the item is Pro, which they can dismiss.
 *
 * POSTERS. An item may export a static `poster`; it is drawn instead of the live item where
 * nothing should move: print and export, thumbnails and other still copies of a slide (a
 * background layer rendered inactive that is not a slide leaving), the presenter's previews, and
 * for a viewer who asked for reduced motion.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DeckRuntimeGlobal {
  contract: 1;
  version: string;
  React: typeof React;
  jsx: typeof jsxRuntime;
  components: Record<string, unknown>;
  hooks: {
    useDeck: typeof useDeck;
    useSlide: typeof useSlide;
    useSlideOptional: typeof useSlideOptional;
  };
}

const RUNTIME_KEY = "__KADAL_DECK_RUNTIME__";

/** Publish the runtime global if nothing has yet. Returns the one on the page. */
export async function installRuntime(
  scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): Promise<DeckRuntimeGlobal> {
  const existing = scope[RUNTIME_KEY] as DeckRuntimeGlobal | undefined;
  if (existing?.React) return existing;
  // The components module imports the background layer, which imports this file: loaded here,
  // lazily, so neither waits on the other at start-up.
  const components = await import("../components/index.ts");
  const again = scope[RUNTIME_KEY] as DeckRuntimeGlobal | undefined;
  if (again?.React) return again;
  const runtime: DeckRuntimeGlobal = Object.freeze({
    contract: 1,
    version: pkg.version,
    React,
    jsx: jsxRuntime,
    components: Object.freeze({ ...components }) as Record<string, unknown>,
    hooks: Object.freeze({ useDeck, useSlide, useSlideOptional }),
  });
  Object.defineProperty(scope, RUNTIME_KEY, {
    value: runtime,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return runtime;
}

export type ItemState =
  | { status: "loading" }
  | { status: "ready"; item: LoadedItem }
  | { status: "failed"; reason: PremiumFailure };

const LOADING: ItemState = Object.freeze({ status: "loading" });
const NO_HOST: ItemState = Object.freeze({ status: "failed", reason: "no-host" });

export interface LoaderDeps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  importModule: (url: string) => Promise<unknown>;
  install: () => Promise<unknown>;
  /** Where an item's stylesheet goes; null where there is no document. */
  addStyle: ((id: string, css: string) => void) | null;
}

const defaultDeps = (): LoaderDeps => ({
  fetch: (url) => fetch(url, { credentials: "include" }),
  importModule: (url) => import(/* @vite-ignore */ url),
  install: () => installRuntime(),
  addStyle:
    typeof document === "undefined"
      ? null
      : (id, css) => {
          if (document.head.querySelector(`style[data-kadal-premium="${CSS.escape(id)}"]`)) return;
          const style = document.createElement("style");
          style.dataset.kadalPremium = id;
          style.textContent = css;
          document.head.append(style);
        },
});

class Failure extends Error {
  constructor(readonly reason: PremiumFailure) {
    super(reason);
  }
}

/** The items of one premium base: the catalog, the modules, and every item's state. */
export class PremiumLoader {
  private catalog: Promise<PremiumEntry[]> | null = null;
  private modules = new Map<string, Promise<unknown>>();
  private states = new Map<string, ItemState>();
  private pending = new Map<string, Promise<ItemState>>();
  private listeners = new Set<() => void>();

  constructor(
    readonly base: string,
    private deps: LoaderDeps = defaultDeps(),
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** The item's state now — the same object until it changes (useSyncExternalStore needs that). */
  state(id: string, kind: PremiumKind): ItemState {
    return this.states.get(`${kind}:${id}`) ?? LOADING;
  }

  /** Start loading an item (idempotent); resolves when its state is final. */
  load(id: string, kind: PremiumKind): Promise<ItemState> {
    const key = `${kind}:${id}`;
    const known = this.states.get(key);
    if (known && known.status !== "loading") return Promise.resolve(known);
    let pending = this.pending.get(key);
    if (!pending) {
      this.states.set(key, LOADING);
      pending = this.resolve(id, kind).then(
        (item) => this.settle(key, { status: "ready", item }),
        (err: unknown) =>
          this.settle(key, {
            status: "failed",
            reason: err instanceof Failure ? err.reason : "bad-module",
          }),
      );
      this.pending.set(key, pending);
    }
    return pending;
  }

  private settle(key: string, state: ItemState): ItemState {
    const current = this.states.get(key);
    if (current && current.status !== "loading") return current;
    this.states.set(key, state);
    for (const fn of this.listeners) fn();
    return state;
  }

  private getCatalog(): Promise<PremiumEntry[]> {
    this.catalog ??= this.deps
      .fetch(`${this.base}catalog.json`)
      .catch(() => {
        throw new Failure("network");
      })
      .then(async (res) => {
        if (!res.ok) throw new Failure(failureForStatus(res.status));
        return parseCatalog(await res.json().catch(() => null));
      });
    return this.catalog;
  }

  private async resolve(id: string, kind: PremiumKind): Promise<LoadedItem> {
    const entry = (await this.getCatalog()).find((e) => e.id === id && e.kind === kind);
    if (!entry) throw new Failure("missing");
    const url = moduleUrl(this.base, entry);
    if (!url) throw new Failure("bad-module");
    let ns = this.modules.get(url);
    if (!ns) {
      ns = this.deps.install().then(() =>
        this.deps.importModule(url).catch(() => {
          throw new Failure("network");
        }),
      );
      this.modules.set(url, ns);
    }
    const item = readPremiumModule(await ns, id, kind);
    if (!item) throw new Failure("bad-module");
    if (item.css) this.deps.addStyle?.(id, item.css);
    return item;
  }
}

const loaders = new Map<string, PremiumLoader>();

/** The loader for a base — created on first use, with `deps` (tests pass fakes) or the browser's. */
export function premiumLoaderFor(base: string, deps?: LoaderDeps): PremiumLoader {
  let l = loaders.get(base);
  if (!l) loaders.set(base, (l = new PremiumLoader(base, deps)));
  return l;
}

/** The page's loader for the host's premium base, or null when the host gave none. */
export function premiumLoader(): PremiumLoader | null {
  const base = premiumBase(readHostOverride()?.premium);
  return base ? premiumLoaderFor(base) : null;
}

const noop = () => () => {};

/** An item's state, loading it if needed. Not a `pro/` name, or no host: failed, nothing fetched. */
export function usePremiumItem(
  name: string | null | undefined,
  kind: PremiumKind,
): ItemState | null {
  const premium = isPremiumName(name);
  const loader = premium ? premiumLoader() : null;
  const snapshot = () => (loader && premium ? loader.state(name, kind) : NO_HOST);
  // The server snapshot is the same: a pre-render (export, a test) shows what is already loaded.
  const state = useSyncExternalStore(loader?.subscribe ?? noop, snapshot, snapshot);
  useEffect(() => {
    if (loader && premium) void loader.load(name, kind);
  }, [loader, premium, name, kind]);
  return premium ? state : null;
}

function prefersStill(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Whether this page is an author's: the dev server, or a builder's live preview. */
export function useAuthoring(): boolean {
  const deck = React.useContext(DeckContext);
  if (deck?.manifest.dev) return true;
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("preview");
}

/**
 * A `pro/` background inside a background layer (or `<Background>`). Nothing while loading or
 * failed — the layer's own fill, i.e. the theme's — and the item, faded in, once ready.
 */
export function PremiumBackground({
  name,
  props,
  active,
  still,
}: {
  name: string;
  props: Record<string, unknown>;
  active: boolean;
  /** Draw the poster: a still copy of a slide (print, export, a thumbnail, a preview). */
  still: boolean;
}) {
  const state = usePremiumItem(name, "background");
  if (state?.status !== "ready") return null;
  const usePoster = still || prefersStill();
  const C = ((usePoster && state.item.poster) || state.item.component) as ComponentType<
    Record<string, unknown>
  >;
  return (
    <div className="deck-premium-item" data-premium={name}>
      <C {...props} active={usePoster ? false : active} />
    </div>
  );
}

/** Whether a background is a library one (for the layer to hand to PremiumBackground). */
export const isPremiumBackground = (bg: SlideBackground | null): boolean =>
  !!bg && isPremiumName(bg.component);

const layoutCache = new Map<string, ComponentType<never>>();

/**
 * The layout component for a `pro/` name: the fallback layout until the item is ready, then the
 * item. One component per name (cached), so a slide re-rendering does not remount its content.
 */
export function premiumLayout<P extends object>(
  name: string,
  fallback: ComponentType<P>,
): ComponentType<P> {
  const hit = layoutCache.get(name);
  if (hit) return hit as ComponentType<P>;
  function PremiumLayout(props: P) {
    const state = usePremiumItem(name, "layout");
    const C = (state?.status === "ready" ? state.item.component : fallback) as ComponentType<P>;
    return <C {...props} />;
  }
  PremiumLayout.displayName = `PremiumLayout(${name})`;
  layoutCache.set(name, PremiumLayout as ComponentType<never>);
  return PremiumLayout;
}

const DISMISSED = "kadal-deck:premium-chip-dismissed";

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export const PRO_URL = "https://deck.kadal.cc/pricing";

/**
 * The author's notice on a slide whose `pro/` item did not load: "Pro background — available on
 * Kadal Deck Pro", a link, and a dismiss button (remembered for the tab). Never on a published
 * deck, never on a still copy of the slide.
 */
export function PremiumNotice({
  background,
  layout,
}: {
  background: string | null;
  layout: string | null;
}) {
  const authoring = useAuthoring();
  const bg = usePremiumItem(authoring ? background : null, "background");
  const lay = usePremiumItem(authoring ? layout : null, "layout");
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!authoring) return null;
  const failed = [
    bg?.status === "failed" ? { name: background!, label: "Pro background" } : null,
    lay?.status === "failed" ? { name: layout!, label: "Pro layout" } : null,
  ].filter((x): x is { name: string; label: string } => !!x && !dismissed.has(x.name));
  if (!failed.length) return null;
  const dismiss = () => {
    const next = new Set(dismissed);
    for (const f of failed) next.add(f.name);
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISSED, JSON.stringify([...next]));
    } catch {
      /* private mode: dismissed for this render only */
    }
  };
  return (
    <div className="deck-premium-chip" role="note" data-print="hide">
      <span>
        {failed.map((f) => f.label).join(" and ")} — available on{" "}
        <a href={PRO_URL} target="_blank" rel="noreferrer">
          Kadal Deck Pro
        </a>
      </span>
      <button type="button" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
