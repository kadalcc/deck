import {
  type ComponentType,
  createElement,
  lazy,
  type LazyExoticComponent,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { DeckRoute, PackageModule, RoutePageProps, RoutesSetup } from "../theming/contract.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECK'S OWN PAGES  —  Slidev's `setup/routes.ts`, the Kadal way
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Besides the engine's pages (/presenter, /notes, /overview…), a deck can add its own: a
 * handout, a timer for the room, a page of links — anything a component can draw, at
 * `<base><path>`, inside the deck's providers (the live room, the theme), so it can read the
 * deck with `useDeck()` like anything else.
 *
 *   routes.tsx beside deck.mdx (or src/routes.tsx, or Slidev's setup/routes.ts):
 *     export default defineRoutes([
 *       { path: "handout", component: Handout, title: "Handout" },
 *       { path: "q/:id", load: () => import("./pages/Question.tsx") },   a lazy chunk; `:id`
 *     ]);                                                                  arrives in `params`
 *     — or a function of the routes so far, as Slidev's `defineRoutesSetup((routes) => […])`
 *
 *   <Deck routes={[…]}>                  the same, from the app's entry
 *   a theme's or addon's module          `routes: […]`, or `api.addRoute(route)` in `setup(api)`
 *
 * A page gets `RoutePageProps`: the path, its `:params`, the route. Paths are matched segment by
 * segment (`:name` matches one, a trailing `*` the rest); the engine's own pages always win, so
 * a route named `presenter` is never used. A built deck's static host files cover the routes a
 * routes file spells out (`path: "handout"`); any other path still opens through 404.html.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The first segments that are the engine's pages (react/Deck.tsx `modeFromLocation`). */
const ENGINE_PAGES = new Set([
  "presenter",
  "join",
  "audience",
  "notes",
  "notes-edit",
  "teleprompter",
  "overview",
  "stats",
  "remote",
  "export",
]);

/** `routes` as written: a list, or a function of the list so far. */
export function applyRoutes(list: DeckRoute[], setup: RoutesSetup | null | undefined): DeckRoute[] {
  if (!setup) return list;
  if (typeof setup === "function") {
    try {
      const out = setup([...list]);
      return Array.isArray(out) ? out.filter(isRoute) : list;
    } catch (err) {
      console.warn("[deck] a routes setup failed:", err);
      return list;
    }
  }
  return [...list, ...(Array.isArray(setup) ? setup.filter(isRoute) : [])];
}

function isRoute(r: unknown): r is DeckRoute {
  const x = r as DeckRoute | null;
  return (
    !!x &&
    typeof x.path === "string" &&
    (typeof x.component === "function" ||
      typeof x.load === "function" ||
      (typeof x.component === "object" && x.component !== null))
  );
}

const segments = (path: string) =>
  path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

/** The route for a path under the deck's base (`handout`, `q/7`), and its params; null if none. */
export function matchRoute(
  rest: string,
  routes: DeckRoute[],
): { route: DeckRoute; params: Record<string, string>; path: string } | null {
  const path = segments(rest.replace(/(^|\/)index\.html$/, "").replace(/\.html$/, ""));
  if (!path.length || ENGINE_PAGES.has(path[0]!)) return null;
  for (const route of routes) {
    const want = segments(route.path);
    if (!want.length || ENGINE_PAGES.has(want[0]!)) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < want.length; i++) {
      const w = want[i]!;
      if (w === "*" && i === want.length - 1) {
        params["*"] = path.slice(i).map(decodeURIComponent).join("/");
        break;
      }
      const p = path[i];
      if (p === undefined) {
        ok = false;
        break;
      }
      if (w.startsWith(":")) params[w.slice(1)] = decodeURIComponent(p);
      else if (w !== p) {
        ok = false;
        break;
      }
      if (i === want.length - 1 && path.length > want.length) ok = false;
    }
    if (ok) return { route, params, path: path.join("/") };
  }
  return null;
}

// ── the registry: every source of routes, merged in order ───────────────────────────────────

export interface RouteRegistry {
  /** A route (or several) for as long as the returned remover is not called (`api.addRoute`). */
  add(route: DeckRoute | DeckRoute[]): () => void;
  /**
   * Set a named source (`deck`, `prop`, `pkg:<n>`), replacing what it said before; null removes.
   * `quiet` tells no one (a render setting what it then reads itself).
   */
  source(id: string, setup: RoutesSetup | null | undefined, quiet?: boolean): void;
  /** Every route, merged: packages, the deck's routes file, `<Deck routes>`, then added ones. */
  list(): DeckRoute[];
  subscribe(listener: () => void): () => void;
  /** Changes with every change, for `useSyncExternalStore`. */
  version(): number;
}

export function createRouteRegistry(): RouteRegistry {
  const sources = new Map<string, RoutesSetup>();
  const added = new Map<number, DeckRoute[]>();
  const listeners = new Set<() => void>();
  let n = 0;
  let version = 0;
  let cache: DeckRoute[] | null = null;
  const changed = (quiet = false) => {
    version++;
    cache = null;
    if (!quiet) for (const l of listeners) l();
  };
  const order = (id: string) => (id.startsWith("pkg:") ? 0 : id === "deck" ? 1 : 2);
  return {
    add(route) {
      const id = n++;
      added.set(id, (Array.isArray(route) ? route : [route]).filter(isRoute));
      changed();
      return () => {
        if (added.delete(id)) changed();
      };
    },
    source(id, setup, quiet) {
      if ((sources.get(id) ?? null) === (setup ?? null)) return;
      if (setup) sources.set(id, setup);
      else sources.delete(id);
      changed(quiet);
    },
    list() {
      if (cache) return cache;
      let out: DeckRoute[] = [];
      const ids = [...sources.keys()].sort((a, b) => order(a) - order(b));
      for (const id of ids) out = applyRoutes(out, sources.get(id));
      for (const list of added.values()) out = [...out, ...list];
      return (cache = out);
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    version: () => version,
  };
}

/** The deck's routes as one registry, and the route this window's address is, if any. */
export function useDeckRoutes(
  base: string,
  sources: { deck?: RoutesSetup | null; prop?: RoutesSetup | null },
): {
  registry: RouteRegistry;
  match: ReturnType<typeof matchRoute>;
} {
  const registry = useMemo(() => createRouteRegistry(), []);
  // The synchronous sources, set (quietly) during render, so the first paint already knows them.
  registry.source("deck", sources.deck, true);
  registry.source("prop", sources.prop, true);
  // The others (a package's, `api.addRoute`) arrive later and re-render through the store.
  useSyncExternalStore(registry.subscribe, registry.version, registry.version);
  const routes = registry.list();
  const match = useMemo(() => {
    if (typeof window === "undefined") return null;
    const path = window.location.pathname;
    const rest = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, "");
    return matchRoute(rest, routes);
  }, [base, routes]);
  return { registry, match };
}

/** A theme's and the addons' `routes` exports, as sources (they load after the first paint). */
export function usePackageRoutes(registry: RouteRegistry, modules: PackageModule[]): void {
  useEffect(() => {
    modules.forEach((m, i) => registry.source(`pkg:${i}`, m.routes));
    return () => modules.forEach((_m, i) => registry.source(`pkg:${i}`, null));
  }, [registry, modules]);
}

const lazies = new WeakMap<DeckRoute, LazyExoticComponent<ComponentType<RoutePageProps>>>();

/** The page for a matched route: its component (a lazy one for `load`), given its props. */
export function RoutePage({ match }: { match: NonNullable<ReturnType<typeof matchRoute>> }) {
  const { route, params, path } = match;
  useEffect(() => {
    const title = route.title;
    if (!title || typeof document === "undefined") return;
    let before: string | null = null;
    let alive = true;
    // After the deck's own title, which an effect of the deck's (run after this one) writes.
    queueMicrotask(() => {
      if (!alive) return;
      before = document.title;
      document.title = title;
    });
    return () => {
      alive = false;
      if (before !== null) document.title = before;
    };
  }, [route.title]);
  type Page = ComponentType<RoutePageProps>;
  let C: Page | LazyExoticComponent<Page> | undefined = route.component;
  if (!C && route.load) {
    let made = lazies.get(route);
    if (!made) {
      const load = route.load;
      made = lazy(async () => {
        const m = await load();
        return { default: typeof m === "function" ? m : (m as { default: Page }).default };
      });
      lazies.set(route, made);
    }
    C = made;
  }
  if (!C) return null;
  return (
    <div className="deck-route-page" data-route={route.path}>
      {createElement(C, { path, params, route })}
    </div>
  );
}

/** Type a routes file: `export default defineRoutes([...])` or `defineRoutes((routes) => [...])`. */
export function defineRoutes<T extends RoutesSetup>(routes: T): T {
  return routes;
}
