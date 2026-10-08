import {
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WEBASSEMBLY RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every renderer before this one drives a framework. This one drives an *agreement*, because once
 * the component stops being JavaScript there is nothing left to drive.
 *
 * WHY AN ABI AND NOT A FRAMEWORK. Vue could be recognised by its options object; Svelte and Solid
 * could not be recognised at all but could at least be *called*, because a compiled component is
 * still a function this renderer can invoke. A WebAssembly module is neither. It cannot touch the
 * DOM — the host object graph is not reachable from linear memory — so every WASM UI framework
 * already ships a JavaScript shim, and that shim is the only thing a renderer can hold. Leptos,
 * Dioxus and Yew all produce one through `wasm-bindgen`; Pyodide produces one of its own shape.
 * What differs between them is spelling, so the engine writes the spelling down and asks each
 * language to meet it.
 *
 * THE AGREEMENT IS THREE FUNCTIONS AND A PROMISE. A WASM island is a factory: give it an element
 * and some props, get back a handle with `update` and `destroy`. The factory may be async, because
 * instantiating a module is, and `wasm-bindgen`'s generated `default` export is exactly such an
 * initialiser. That makes this the second renderer whose mount is asynchronous, after Qwik, and the
 * contract's insistence on a synchronous `IslandMount` handles it the same way.
 *
 * PROPS CROSS A WALL. Everywhere else `update` hands over a live JavaScript object. Here it crosses
 * into another language's memory, so the agreement says **plain JSON-shaped values only**: strings,
 * numbers, booleans, null, and arrays and objects of those. A function or a DOM node would have to
 * be proxied, and every WASM language proxies differently. Saying so in the contract is cheaper
 * than discovering it in four languages.
 */

/** The handle a WASM island hands back. The same shape the engine's `IslandMount` has. */
export interface WasmIslandHandle {
  /** New props. Optional — without it the engine remounts, which for WASM means re-instantiating. */
  update?(props: IslandProps): void;
  /** Tear down: drop listeners, stop loops, release the view. Safe to call twice. */
  destroy(): void;
  /**
   * Release the handle's own memory on the module side, if the language has a word for that.
   *
   * `wasm-bindgen` gives every exported struct a `free()`, because the JavaScript object is a
   * pointer into linear memory and the JavaScript collector does not know what it points at.
   * Newer versions register a `FinalizationRegistry` so it is eventually reclaimed, but
   * "eventually" on a deck means the island's bytes sit there for the rest of the talk. The
   * renderer calls it when it exists. Pyodide has the identical problem and spells it `destroy`;
   * see `@kadal/deck-python` for why that one collides.
   */
  free?(): void;
}

/**
 * What a `.wasm` island exports, in any language.
 *
 *     // Rust, through wasm-bindgen
 *     #[wasm_bindgen(js_name = deckMount)]
 *     pub fn deck_mount(host: HtmlElement, props: JsValue) -> TickerHandle { … }
 *
 * The module may also export a `default` initialiser — `wasm-bindgen --target web` generates one —
 * and the renderer awaits it before calling `deckMount`.
 */
export interface WasmIslandModule {
  /** `wasm-bindgen --target web` names this `default`; it instantiates the module. */
  default?: (() => Promise<unknown>) | undefined;
  /** Called once per island, with the element to draw into. */
  deckMount(host: Element, props: IslandProps): WasmIslandHandle | Promise<WasmIslandHandle>;
}

/** A WASM island as `<Island>` receives it: the module, or a thunk that produces one. */
export type WasmIslandComponent = WasmIslandModule | (() => Promise<WasmIslandModule>);

function isModule(value: unknown): value is WasmIslandModule {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WasmIslandModule).deckMount === "function"
  );
}

/**
 * Props that can cross into another language's memory.
 *
 * Structured-clone rules, roughly: JSON-shaped values pass, everything else is dropped with a
 * warning rather than thrown, because one unserialisable prop should not take the slide down.
 */
function crossable(props: IslandProps): IslandProps {
  const out: IslandProps = {};
  for (const [key, value] of Object.entries(props)) {
    const type = typeof value;
    if (value === null || type === "string" || type === "number" || type === "boolean") {
      out[key] = value;
      continue;
    }
    if (type === "object") {
      try {
        // The cheapest honest test for "will this survive the crossing".
        out[key] = JSON.parse(JSON.stringify(value)) as unknown;
        continue;
      } catch {
        /* falls through to the warning */
      }
    }
    console.warn(
      `[deck] wasm island: prop “${key}” (${type}) cannot cross into the module and was dropped`,
    );
  }
  return out;
}

/**
 * Adapt a `wasm-bindgen --target web` module into an island component.
 *
 *     <Island framework="wasm" load={() => import("./chart.js").then(wasmBindgenModule)} />
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONVENIENCE. `<Island load={…}>` takes the `default` export
 * of whatever the thunk resolves to, because for Vue, Svelte, Solid and Preact the default export
 * *is* the component. A wasm-bindgen module's `default` is its **initialiser** — so the island
 * received `__wbg_init`, called it, and then called the raw WebAssembly export `deckMount(a, b)`
 * with a DOM element and an object where it wanted two integers. The Rust ran, the island reported
 * itself mounted, and no DOM appeared. Nothing threw.
 *
 * The engine could guess its way out of this and the guess would be wrong eventually, so the author
 * says it instead: this runs the initialiser and hands back the module shape the renderer wants.
 */
export async function wasmBindgenModule(module: {
  default: () => Promise<unknown>;
  deckMount: WasmIslandModule["deckMount"];
}): Promise<WasmIslandModule> {
  await module.default();
  return { deckMount: module.deckMount };
}

export const wasmRenderer: DeckRenderer = {
  name: "wasm",

  /**
   * This is the one renderer that CAN recognise its own, and only because the engine defined the
   * shape itself. A module exporting a function called `deckMount` said so on purpose; nothing
   * arrives at that name by accident.
   */
  owns(component: IslandComponent) {
    return isModule(component);
  },

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const first = crossable(context.slot ? { ...props, deckSlot: context.slot } : props);

    let gone = false;
    let handle: WasmIslandHandle | null = null;
    let latest = first;

    const start = async () => {
      const module = isModule(component)
        ? component
        : await (component as () => Promise<WasmIslandModule>)();

      // `wasm-bindgen --target web` exports its initialiser as `default`. Calling it twice is
      // harmless — it resolves immediately once the module is instantiated.
      if (typeof module.default === "function") await module.default();

      if (gone) return;
      const live = await module.deckMount(host, latest);
      if (gone) {
        live.destroy();
        return;
      }
      handle = live;
      // Props that arrived while the module was instantiating.
      if (latest !== first) handle.update?.(latest);
    };

    void start().catch((error: unknown) => {
      console.error("[deck] wasm island failed to mount:", error);
      (host as HTMLElement).dataset.islandError =
        error instanceof Error ? error.message : String(error);
    });

    return {
      destroy() {
        if (gone) return;
        gone = true;
        try {
          handle?.destroy();
        } finally {
          // The island is down; now give the module back its memory.
          try {
            handle?.free?.();
          } catch {
            // A handle freed twice throws in some bindings; a slide being left is not the moment.
          }
          handle = null;
          host.replaceChildren();
        }
      },
      update(next: IslandProps) {
        if (gone) return;
        latest = crossable(context.slot ? { ...next, deckSlot: context.slot } : next);
        handle?.update?.(latest);
      },
    };
  },

  // No `ssr`. A module that cannot reach the DOM cannot produce HTML for a page that will never
  // run it; the deck's print and export paths run a real browser.
};

export { deckWasm } from "./build.ts";
