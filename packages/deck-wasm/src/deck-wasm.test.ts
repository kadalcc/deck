import { describe, expect, mock, test } from "bun:test";
import { clearRenderers, registerRenderer, resolveRenderer } from "@kadal/deck/renderers/contract";

import { type WasmIslandHandle, wasmBindgenModule, wasmRenderer } from "./index.ts";

const host = () => ({ replaceChildren: mock(() => {}), dataset: {} }) as unknown as Element;
const context = { animate: true } as const;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("recognising a WASM island", () => {
  test("this one CAN recognise its own, because the engine defined the shape", () => {
    // Every other renderer refuses: a Vue options object was the last thing that could be
    // identified honestly. Here the agreement is the engine's own, and a module exporting a
    // function called `deckMount` said so on purpose — nothing arrives at that name by accident.
    expect(wasmRenderer.owns?.({ deckMount: () => ({ destroy() {} }) })).toBe(true);
    expect(wasmRenderer.owns?.({ mount: () => {} })).toBe(false);
    expect(wasmRenderer.owns?.(() => null)).toBe(false);
    expect(wasmRenderer.owns?.(null)).toBe(false);
  });

  test("so it resolves with no stamp and no framework attribute", () => {
    clearRenderers();
    registerRenderer(wasmRenderer);
    expect(resolveRenderer({ deckMount: () => ({ destroy() {} }) }).how).toBe("owned");
    clearRenderers();
  });
});

describe("props crossing into another language", () => {
  test("JSON-shaped values pass; a function is dropped, not thrown", async () => {
    let seen: Record<string, unknown> = {};
    const module = {
      deckMount: (_h: Element, props: Record<string, unknown>) => {
        seen = props;
        return { destroy() {} } satisfies WasmIslandHandle;
      },
    };
    const mounted = wasmRenderer.mount(
      host(),
      module,
      { label: "hi", step: 3, ok: true, nothing: null, nested: { a: [1, 2] }, cb: () => {} },
      context,
    );
    await settle();
    expect(seen).toEqual({ label: "hi", step: 3, ok: true, nothing: null, nested: { a: [1, 2] } });
    // One unserialisable prop must not take the slide down.
    expect("cb" in seen).toBe(false);
    mounted.destroy();
  });
});

describe("the asynchronous mount", () => {
  test("awaits the wasm-bindgen initialiser before calling deckMount", async () => {
    const order: string[] = [];
    const module = {
      default: async () => {
        order.push("init");
      },
      deckMount: () => {
        order.push("mount");
        return { destroy() {} } satisfies WasmIslandHandle;
      },
    };
    const mounted = wasmRenderer.mount(host(), module, {}, context);
    await settle();
    expect(order).toEqual(["init", "mount"]);
    mounted.destroy();
  });

  test("a presenter leaving during instantiation never creates the island at all", async () => {
    let mounts = 0;
    const module = {
      default: async () => {},
      deckMount: () => {
        mounts++;
        return { destroy() {} };
      },
    };
    const mounted = wasmRenderer.mount(host(), module, {}, context);
    // Leave immediately — the module is still instantiating.
    mounted.destroy();
    await settle();
    // Nothing was built, so there is nothing to tear down. The cost of a slide stepped past
    // quickly is one instantiation, not a leaked island.
    expect(mounts).toBe(0);
  });

  test("an island that wins the race against destroy is torn down anyway", async () => {
    let destroyed = 0;
    let release!: () => void;
    const module = {
      deckMount: async () => {
        // Resolve only once the test says so, so `destroy` lands while deckMount is in flight —
        // the window where a handle exists and nobody is holding it yet.
        await new Promise<void>((r) => (release = r));
        return {
          destroy() {
            destroyed++;
          },
        };
      },
    };
    const mounted = wasmRenderer.mount(host(), module, {}, context);
    await settle();
    mounted.destroy();
    release();
    await settle();
    expect(destroyed).toBe(1);
  });

  test("props that arrive during instantiation are not lost", async () => {
    let given: Record<string, unknown> | null = null;
    const module = {
      default: async () => {},
      deckMount: (_h: Element, props: Record<string, unknown>) => {
        given = props;
        return {
          update(next: Record<string, unknown>) {
            given = next;
          },
          destroy() {},
        };
      },
    };
    const mounted = wasmRenderer.mount(host(), module, { step: 0 }, context);
    mounted.update?.({ step: 4 });
    await settle();
    expect(given).toEqual({ step: 4 });
    mounted.destroy();
  });

  test("a module that fails to instantiate reports and does not throw into the slide", async () => {
    const h = host();
    const module = {
      default: async () => {
        throw new Error("bad magic number");
      },
      deckMount: () => ({ destroy() {} }),
    };
    const mounted = wasmRenderer.mount(h, module, {}, context);
    await settle();
    expect((h as unknown as HTMLElement).dataset.islandError).toBe("bad magic number");
    mounted.destroy();
  });

  test("destroy is safe to call twice", async () => {
    let destroyed = 0;
    const mounted = wasmRenderer.mount(
      host(),
      {
        deckMount: () => ({
          destroy() {
            destroyed++;
          },
        }),
      },
      {},
      context,
    );
    await settle();
    mounted.destroy();
    mounted.destroy();
    expect(destroyed).toBe(1);
  });
});

describe("the wasm-bindgen adapter", () => {
  test("runs the initialiser and hands back only the component shape", async () => {
    let inited = 0;
    const generated = {
      // What `wasm-bindgen --target web` emits: `default` is the INITIALISER, not the component.
      default: async () => {
        inited++;
      },
      deckMount: () => ({ destroy() {} }) as WasmIslandHandle,
      initSync: () => {},
      TickerHandle: class {},
    };
    const adapted = await wasmBindgenModule(generated);
    expect(inited).toBe(1);
    expect(typeof adapted.deckMount).toBe("function");
    // No `default` on the way out. <Island> unwraps `default` when it finds one, and unwrapping
    // this module yielded `__wbg_init` — the island then called the raw WebAssembly export with a
    // DOM element where it wanted an integer, reported itself mounted, and drew nothing.
    expect("default" in adapted).toBe(false);
    expect(wasmRenderer.owns?.(adapted)).toBe(true);
  });

  test("free() is called after destroy, because the JS collector cannot see wasm memory", async () => {
    const order: string[] = [];
    const mounted = wasmRenderer.mount(
      host(),
      {
        deckMount: () => ({
          destroy: () => order.push("destroy"),
          free: () => order.push("free"),
        }),
      },
      {},
      context,
    );
    await settle();
    mounted.destroy();
    expect(order).toEqual(["destroy", "free"]);
  });
});
