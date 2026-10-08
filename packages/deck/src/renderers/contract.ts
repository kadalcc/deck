/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RENDERER CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A slide is HTML. Nothing about that requires the thing drawn inside it to be React, and this is
 * the seam where every other framework gets in: a renderer knows how to put one framework's
 * component into an element and how to take it out again, and the engine knows nothing else about
 * it. Astro's islands are the same idea — static page, small pieces of framework, each with its own
 * runtime bundled separately so a Vue slide never ships React.
 *
 * WHY A MARKER AND NOT A SNIFF
 *
 * The obvious design is for each renderer to recognise its own components. It cannot: a React
 * component and a Solid component are both plain functions, and no amount of looking at one tells
 * you which runtime it was written for. Svelte and Angular do not even have a virtual DOM — their
 * reactivity is produced by their compilers, so there is nothing at runtime to recognise.
 *
 * So the build says so, not the engine. A `.vue` file goes through the Vue plugin, which stamps
 * `DECK_RENDERER` onto what it exports; an author can say `framework="vue"` by hand. `owns()` is
 * the last resort, for the renderers that genuinely can tell — a web component is a tag name with a
 * hyphen in it, and that is unambiguous.
 *
 * WHAT A RENDERER MUST SURVIVE
 *
 * A deck shows the same slide in several places at once: the stage, the presenter's current-slide
 * box, an overview tile, the audience's mirror, a print page. So `mount` is called more than once
 * for the same component, on different elements, and may be torn down and mounted again as the
 * presenter moves. Keep per-mount state on the mount, never in the module.
 */

/** Whatever a framework calls a component. The engine never looks inside one. */
export type IslandComponent = unknown;

export type IslandProps = Record<string, unknown>;

/**
 * Stamped onto a component by a framework's build plugin (or by hand) to say which renderer owns
 * it. Checked before `owns()`, because a stamp is knowledge and a sniff is a guess.
 */
export const DECK_RENDERER = Symbol.for("deck.renderer");

/** A component carrying its renderer's name. */
export interface MarkedComponent {
  [DECK_RENDERER]?: string;
}

export interface RenderContext {
  /**
   * The component's children, already rendered to HTML.
   *
   * Cross-framework children are HTML and not a live tree, deliberately: a React subtree cannot
   * keep its state inside a Vue component, and pretending otherwise would produce the kind of bug
   * nobody can explain. Markdown inside an island arrives as markup; interactivity inside an
   * island belongs to that island's framework.
   */
  slot?: string;
  /** The deck's colour scheme at mount, for frameworks that theme once rather than reactively. */
  scheme?: "light" | "dark";
  /**
   * False while printing, exporting, or where the viewer asked for reduced motion. A renderer that
   * starts a loop should not start one.
   */
  animate: boolean;
}

/** A live island. The engine holds this and calls it when the slide moves on. */
export interface IslandMount {
  /** Undo everything: unmount, drop listeners, stop loops. Must be safe to call twice. */
  destroy(): void;
  /**
   * New props without a teardown. Optional — the engine remounts when a renderer cannot update,
   * which is correct but loses the island's internal state, so implement this where it is cheap.
   */
  update?(props: IslandProps): void;
}

export interface DeckRenderer {
  /** `framework="…"` names this. Lowercase, hyphenated: `react`, `web-components`, `vue`. */
  readonly name: string;
  /**
   * Last-resort recognition, for renderers that can genuinely tell. Return false when unsure —
   * a wrong yes is worse than no answer, because it takes the component away from the renderer
   * that did know.
   */
  owns?(component: IslandComponent): boolean;
  /** Put the component in the element and keep it alive. */
  mount(
    host: Element,
    component: IslandComponent,
    props: IslandProps,
    context: RenderContext,
  ): IslandMount;
  /**
   * HTML for a surface that will never hydrate — a print page, an export frame, a thumbnail.
   * Optional: without it such a surface shows the island's fallback instead.
   */
  ssr?(
    component: IslandComponent,
    props: IslandProps,
    context: RenderContext,
  ): string | Promise<string>;
  /**
   * The renderer whose components the deck runtime can draw directly, without an island. There is
   * exactly one — React today — and marking it lets `<Island>` keep such components inside the
   * React tree, where the deck's own context (clicks, theme, the live room) still reaches them.
   */
  readonly native?: boolean;
}

/* ── the registry ─────────────────────────────────────────────────────────── */

const registry: DeckRenderer[] = [];

/**
 * Add a renderer. Registration order is `owns()` order, so a renderer that recognises broadly
 * should be registered after one that recognises precisely. Registering a name twice replaces the
 * first, which is what a dev server doing hot reload needs.
 */
export function registerRenderer(renderer: DeckRenderer): void {
  const at = registry.findIndex((r) => r.name === renderer.name);
  if (at >= 0) registry[at] = renderer;
  else registry.push(renderer);
}

export function registeredRenderers(): readonly DeckRenderer[] {
  return registry;
}

export function rendererNamed(name: string): DeckRenderer | null {
  return registry.find((r) => r.name === name) ?? null;
}

/** The renderer the deck runtime draws directly, if one is registered. */
export function nativeRenderer(): DeckRenderer | null {
  return registry.find((r) => r.native) ?? null;
}

/** Forget every renderer. For tests; nothing in the engine calls this. */
export function clearRenderers(): void {
  registry.length = 0;
  deferred.clear();
}

/* ── renderers that arrive later ──────────────────────────────────────────── */

/**
 * WHY A FRAMEWORK MUST BE ABLE TO ARRIVE LATE
 *
 * Registering a renderer imports it, and importing it imports its framework. Measured on the
 * showcase deck, registering Vue eagerly put 64 kB (25 kB gzipped) of Vue runtime into the first
 * chunk — paid on slide one, by every viewer, for one island nineteen slides away. Ten frameworks
 * would make that a quarter of a megabyte of runtimes a given deck never runs.
 *
 * So a renderer may be registered as a name and an import instead. Resolution by name
 * (`framework="vue"`) and by stamp (`DECK_RENDERER`) both work on a string, so the engine can know
 * which renderer a component needs before that renderer's code exists in the page — which is the
 * whole trick, and the reason the contract went to a marker rather than a sniff.
 *
 * The cost is deliberate and small: `owns()` cannot run for a renderer that has not loaded, so a
 * deferred renderer's components must be named or stamped. A web component is recognised by its tag
 * and React is the native one, so neither is affected.
 */
export type RendererLoader = () => Promise<DeckRenderer | { default: DeckRenderer }>;

const deferred = new Map<string, RendererLoader>();
const loading = new Map<string, Promise<DeckRenderer | null>>();

/**
 * Register a renderer by name, loading it only when a slide actually needs it.
 *
 *     registerLazyRenderer("vue", () => import("@kadal/deck-vue").then((m) => m.vueRenderer));
 *
 * An eager registration of the same name wins: it is already here, so there is nothing to wait for.
 */
export function registerLazyRenderer(name: string, load: RendererLoader): void {
  deferred.set(name, load);
}

/** Names that are registered, loaded or not. */
export function knownRendererNames(): string[] {
  return [...new Set([...registry.map((r) => r.name), ...deferred.keys()])];
}

/**
 * The renderer called `name`, loading it if that is what it takes. Null when no such renderer is
 * registered, or when its import failed — a failed import is reported once and then retried on the
 * next ask, because a deck that lost its network on slide three should recover on slide four.
 */
export function loadRenderer(name: string): Promise<DeckRenderer | null> {
  const here = rendererNamed(name);
  if (here) return Promise.resolve(here);

  const inFlight = loading.get(name);
  if (inFlight) return inFlight;

  const load = deferred.get(name);
  if (!load) return Promise.resolve(null);

  const promise = load()
    .then((module) => {
      const renderer =
        module && typeof module === "object" && "default" in module ? module.default : module;
      if (!renderer || typeof (renderer as DeckRenderer).mount !== "function") {
        throw new Error(`the module registered for “${name}” did not export a renderer`);
      }
      registerRenderer(renderer as DeckRenderer);
      return renderer as DeckRenderer;
    })
    .catch((error: unknown) => {
      console.error(`[deck] could not load the “${name}” renderer:`, error);
      return null;
    })
    .finally(() => {
      loading.delete(name);
    });

  loading.set(name, promise);
  return promise;
}

export type Resolution =
  | { renderer: DeckRenderer; how: "named" | "marked" | "owned" }
  /** A renderer by this name is registered but not loaded. `loadRenderer(name)` finishes the job. */
  | { renderer: null; how: "deferred"; name: string }
  | { renderer: null; how: "unknown"; reason: string };

/**
 * Which renderer draws this component, and on what grounds.
 *
 * The order is deliberate: what the author said, then what the build stamped, then what a renderer
 * can prove about the component itself. `how` is carried out of here so a failure can say which
 * step it got to rather than "no renderer".
 */
export function resolveRenderer(component: IslandComponent, framework?: string): Resolution {
  if (framework) {
    const named = rendererNamed(framework);
    if (named) return { renderer: named, how: "named" };
    if (deferred.has(framework)) return { renderer: null, how: "deferred", name: framework };
    const known = knownRendererNames();
    return {
      renderer: null,
      how: "unknown",
      reason: `no renderer named “${framework}” is registered${
        known.length ? ` (have: ${known.join(", ")})` : " — none are"
      }`,
    };
  }

  const marked = (component as MarkedComponent | null | undefined)?.[DECK_RENDERER];
  if (typeof marked === "string") {
    const stamped = rendererNamed(marked);
    if (stamped) return { renderer: stamped, how: "marked" };
    if (deferred.has(marked)) return { renderer: null, how: "deferred", name: marked };
    return {
      renderer: null,
      how: "unknown",
      reason: `this component was built for “${marked}”, which is not registered`,
    };
  }

  for (const renderer of registry) {
    try {
      if (renderer.owns?.(component)) return { renderer, how: "owned" };
    } catch {
      // A renderer that throws while sniffing simply does not own it.
    }
  }

  return {
    renderer: null,
    how: "unknown",
    reason:
      'no renderer claimed it — pass framework="…", or have the build stamp DECK_RENDERER on it',
  };
}

/**
 * Resolution, including the renderers that have to be fetched first.
 *
 * This is what the engine calls. The synchronous `resolveRenderer` above stays exactly as honest as
 * it was — it reports what is in the page right now — and this one takes its `deferred` answer and
 * finishes it.
 */
export async function resolveRendererAsync(
  component: IslandComponent,
  framework?: string,
): Promise<Resolution> {
  const now = resolveRenderer(component, framework);
  if (now.how !== "deferred") return now;

  const renderer = await loadRenderer(now.name);
  return renderer
    ? { renderer, how: framework ? "named" : "marked" }
    : {
        renderer: null,
        how: "unknown",
        reason: `the “${now.name}” renderer is registered but could not be loaded`,
      };
}
