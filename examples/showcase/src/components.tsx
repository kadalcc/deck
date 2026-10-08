import { Island, Sketch, useClickIndex, type SketchStep } from "@kadal/deck";
import { deckPython } from "@kadal/deck-python/build";
import { wasmBindgenModule } from "@kadal/deck-wasm";
import { FlipBoard } from "@kadal/deck/backgrounds";
import { sketch } from "@kadal/deck/sketch";

import "./island-demo.ts";
import { Rocket, Sparkles, Users, Zap } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Components the slides use without importing. Anything here is available as `<Name />` in
 * deck.mdx; a `layout:name` entry registers a custom layout for `layout: name`.
 */
function Feature({
  icon,
  title,
  children,
}: {
  icon?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  const Icon =
    { rocket: Rocket, zap: Zap, users: Users, sparkles: Sparkles }[icon ?? "sparkles"] ?? Sparkles;
  return (
    <div className="feature">
      <Icon className="feature-icon" strokeWidth={1.75} />
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

/** A sketch drawn in code: two regions, an arrow across them, a tour of three clicks. */
const flow = sketch({ width: 720, height: 330, size: 18 });
flow.region("write", { x: 10, y: 10, w: 330, h: 310, title: "you write", tone: "purple" });
flow.node("mdx", {
  x: 40,
  y: 60,
  w: 270,
  h: 80,
  label: "deck.mdx\nslides split at ---",
  tone: "purple",
  region: "write",
});
flow.node("cfg", {
  x: 40,
  y: 190,
  w: 270,
  h: 80,
  label: "deck.config.ts\ntheme · transition · live",
  tone: "purple",
  fill: "hachure",
  region: "write",
});
flow.region("run", {
  x: 380,
  y: 10,
  w: 330,
  h: 310,
  title: "the engine",
  titleAt: "right",
  tone: "accent",
});
flow.node("vite", {
  x: 410,
  y: 60,
  w: 270,
  h: 80,
  label: "vite plugin\none module per slide",
  tone: "accent",
  region: "run",
});
flow.node("deck", {
  x: 410,
  y: 190,
  w: 270,
  h: 80,
  shape: "pill",
  label: "<Deck />\nkeys · clicks · live room",
  tone: "teal",
  region: "run",
});
flow.arrow("mdx", "vite", { label: "virtual:deck", size: 14 });
flow.arrow("cfg", "deck", { dashed: true });
flow.arrow("vite", "deck");
const FLOW_STEPS: SketchStep[] = [
  { focus: "write", caption: "Two files: the slides and a config that overrides the headmatter." },
  {
    focus: "run",
    caption: "The plugin compiles each slide to its own module; the runtime does the rest.",
  },
  { focus: null, caption: "Click the corner button (or F, then its label) to open the canvas." },
];
function FlowSketch() {
  return <Sketch scene={flow.build()} steps={FLOW_STEPS} />;
}

/**
 * A Vue component fed by the deck's own click state.
 *
 * Two things are on show. The island hands Vue new props as you step and Vue keeps what it was
 * holding, which is the whole argument for `update` existing. And nothing here imports Vue: the
 * component arrives with the slide that needs it, and so does the renderer — measured at 64 kB off
 * this deck's first chunk.
 */
/**
 * A Svelte 5 component, resolved with no `framework` attribute and no stamp written by hand: the
 * build plugin put `DECK_RENDERER` on the compiled module, which is the only thing that can, since
 * a production-compiled Svelte component carries no trace of being one.
 */
/**
 * A Solid component. Its body runs once; only the expressions that read `step` re-run when the
 * deck hands over new props, which is why the renderer passes a store rather than an object.
 */
/**
 * A Preact component. Nothing bridges reactivity for it: the renderer re-renders into the same
 * container and Preact diffs, which is what a React-shaped framework does instead.
 */
/**
 * A Qwik component. Its props arrive as signals — the renderer makes one per prop, because signal
 * propagation is how Qwik updates anything.
 */
/**
 * An Angular standalone component, mounted into a shared zoneless Angular application. Its props
 * go in through `ref.setInput`, which marks the view dirty — assigning to the instance would leave
 * the island looking healthy and showing stale props.
 */
/**
 * A Fresh island, written as Fresh islands are: a Preact component using `@preact/signals`. It
 * resolves to its own renderer, which is the Preact one under a different name — because that is
 * what Fresh's client runtime is.
 */
/**
 * A WebAssembly island with no framework and no language runtime at all: 30 lines of hand-written
 * WebAssembly text, assembled to 195 bytes, plus a shim that paints what the module computes. It
 * is the WASM equivalent of the custom element at the start of the row — the smallest honest
 * demonstration that the seam is a seam.
 */
/**
 * A Python island: CPython compiled to WebAssembly, reading `python-ticker.py` as source when the
 * slide comes up. `?raw` is the whole build step — there isn't one, which is the point.
 *
 * It is also the most expensive thing on the deck by two orders of magnitude: Pyodide is a
 * six-megabyte download fetched from a pinned CDN URL, so this island needs the network and the
 * others do not.
 */
/**
 * A Leptos island: Rust compiled to WebAssembly, 110 kB after wasm-bindgen.
 *
 * There is no Rust-specific renderer. `wasm-bindgen --target web` emits a module exporting
 * `deckMount`, which is the `@kadal/deck-wasm` ABI as written — one
 * `#[wasm_bindgen(js_name = deckMount)]` attribute in `rust-ticker/src/lib.rs` is the whole
 * integration on the Rust side.
 *
 * `wasmBindgenModule` runs the module's `default` initialiser and hands back the module shape the
 * renderer wants. Without it the island takes `default` for the component — because for Vue,
 * Svelte, Solid and Preact it is — and ends up calling the raw WebAssembly export with a DOM
 * element where it wanted an integer. It mounts, reports success, and draws nothing.
 */
/**
 * A custom element — no framework at all, which is how we know the seam is honest. Its props are
 * attributes, because that is all the platform offers, and `attributeChangedCallback` is its
 * `update`.
 */
function ElementIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      component="showcase-ticker"
      client="slide"
      props={{ label: label ?? "a custom element", step }}
    />
  );
}

function RustIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      framework="wasm"
      className="from-rust"
      load={() => import("./rust-ticker/rust-ticker.js").then(wasmBindgenModule)}
      client="slide"
      props={{ label: label ?? "a rust island", step }}
      fallback={<div className="ticker is-pending">fetching rust…</div>}
    />
  );
}

function PythonIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      framework="python"
      load={() => import("./python-ticker.py?raw").then((m) => deckPython(m.default as string))}
      client="slide"
      props={{ label: label ?? "a python island", step }}
      fallback={<div className="ticker is-pending">starting python…</div>}
    />
  );
}

function WasmIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      framework="wasm"
      load={() => import("./wasm-ticker.ts")}
      client="slide"
      props={{ label: label ?? "a wasm island", step }}
      fallback={<div className="ticker is-pending">fetching wasm…</div>}
    />
  );
}

function FreshIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      load={() => import("./fresh-ticker.fresh.tsx").then((m) => m.FreshTicker)}
      client="slide"
      props={{ label: label ?? "a fresh island", step }}
      fallback={<div className="ticker is-pending">fetching fresh…</div>}
    />
  );
}

function AngularIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      load={() => import("./angular-ticker.angular.ts").then((m) => m.AngularTicker)}
      client="slide"
      props={{ label: label ?? "an angular island", step }}
      fallback={<div className="ticker is-pending">fetching angular…</div>}
    />
  );
}

function QwikIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      load={() => import("./qwik-ticker.qwik.tsx").then((m) => m.QwikTicker)}
      client="slide"
      props={{ label: label ?? "a qwik island", step }}
      fallback={<div className="ticker is-pending">fetching qwik…</div>}
    />
  );
}

function PreactIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      load={() => import("./preact-ticker.preact.tsx").then((m) => m.PreactTicker)}
      client="slide"
      props={{ label: label ?? "a preact island", step }}
      fallback={<div className="ticker is-pending">fetching preact…</div>}
    />
  );
}

function SolidIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      load={() => import("./solid-ticker.solid.tsx").then((m) => m.SolidTicker)}
      client="slide"
      props={{ label: label ?? "a solid island", step }}
      fallback={<div className="ticker is-pending">fetching solid…</div>}
    />
  );
}

function SvelteIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      load={() => import("./svelte-ticker.svelte")}
      client="slide"
      props={{ label: label ?? "a svelte island", step }}
      fallback={<div className="ticker is-pending">fetching svelte…</div>}
    />
  );
}

function VueIsland({ label }: { label?: string }) {
  const step = useClickIndex();
  return (
    <Island
      framework="vue"
      load={() => import("./vue-ticker.ts").then((m) => m.VueTicker)}
      client="slide"
      props={{ label: label ?? "a vue island", step }}
      fallback={<div className="ticker is-pending">fetching vue…</div>}
    />
  );
}

export const components: Record<string, ComponentType<Record<string, unknown>>> = {
  VueIsland: VueIsland as ComponentType<Record<string, unknown>>,
  SvelteIsland: SvelteIsland as ComponentType<Record<string, unknown>>,
  SolidIsland: SolidIsland as ComponentType<Record<string, unknown>>,
  PreactIsland: PreactIsland as ComponentType<Record<string, unknown>>,
  QwikIsland: QwikIsland as ComponentType<Record<string, unknown>>,
  AngularIsland: AngularIsland as ComponentType<Record<string, unknown>>,
  FreshIsland: FreshIsland as ComponentType<Record<string, unknown>>,
  WasmIsland: WasmIsland as ComponentType<Record<string, unknown>>,
  PythonIsland: PythonIsland as ComponentType<Record<string, unknown>>,
  RustIsland: RustIsland as ComponentType<Record<string, unknown>>,
  ElementIsland: ElementIsland as ComponentType<Record<string, unknown>>,
  FlowSketch: FlowSketch as ComponentType<Record<string, unknown>>,
  Feature: Feature as ComponentType<Record<string, unknown>>,
  FlipBoard: FlipBoard as ComponentType<Record<string, unknown>>,
  Island: Island as unknown as ComponentType<Record<string, unknown>>,
};
