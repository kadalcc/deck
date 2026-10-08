import init from "./wasm-ticker.wasm?init";

import { deckWasm } from "@kadal/deck-wasm/build";

/**
 * The JavaScript half of a WebAssembly island — the shim.
 *
 * WebAssembly cannot reach the DOM, so every WASM UI framework ships one of these; `wasm-bindgen`
 * generates it for Leptos and Dioxus, and Pyodide generates its own shape. This one is written by
 * hand so the seam is visible: the module owns the state and does the arithmetic, this file owns
 * the element and the interval, and the engine's `deckMount` is the agreement between them.
 *
 * `?init` is Vite's own WebAssembly import — it gives back an instantiating function and keeps the
 * 195-byte module in its own chunk, so it is fetched by the slide that needs it like every other
 * framework here.
 */

declare global {
  interface Window {
    __wasmIsland?: { mounted: number; destroyed: number };
  }
}

const tally = () => (window.__wasmIsland ??= { mounted: 0, destroyed: 0 });

interface TickerExports {
  tick(): number;
  step(): number;
  set_step(n: number): void;
  whole(): number;
  tenth(): number;
  reset(): void;
}

export const deckMount = deckWasm(async (host: Element, props: Record<string, unknown>) => {
  const { exports } = await init({});
  const wasm = exports as unknown as TickerExports;
  wasm.reset();

  const label = document.createElement("span");
  label.className = "ticker-label";
  const count = document.createElement("strong");
  count.className = "ticker-count";
  const stepLine = document.createElement("em");
  stepLine.className = "ticker-step";

  const box = document.createElement("div");
  box.className = "ticker is-wasm";
  box.append(label, count, stepLine);
  host.replaceChildren(box);

  const paint = () => {
    // Every number on screen was computed inside the module.
    box.dataset.wasmTicks = String(wasm.whole() * 10 + wasm.tenth());
    box.dataset.wasmStep = String(wasm.step());
    count.textContent = `${wasm.whole()}.${wasm.tenth()}s`;
    stepLine.textContent = `deck click ${wasm.step()}`;
  };

  const show = (p: Record<string, unknown>) => {
    label.textContent = String(p.label ?? "a wasm island");
    wasm.set_step(Number(p.step ?? 0));
    paint();
  };

  show(props);
  tally().mounted++;

  const timer = window.setInterval(() => {
    wasm.tick();
    paint();
  }, 100);

  return {
    update(next: Record<string, unknown>) {
      show(next);
    },
    destroy() {
      tally().destroyed++;
      clearInterval(timer);
      host.replaceChildren();
    },
  };
});

/** The module shape `@kadal/deck-wasm` expects: a `deckMount`, and no initialiser of its own. */
export default { deckMount };
