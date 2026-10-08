import { Deck, registerLazyRenderer } from "@kadal/deck";
import "@kadal/deck/styles.css";
import "@kadal/deck/themes/minimal.css";
import "@kadal/deck/themes/rla.css";
import "@kadal/deck/themes/stack.css";
import "@kadal/deck/backgrounds";
import { AudiencePage } from "@kadal/deck/audience";
import { LiveProvider } from "@kadal/deck/live";
import { NotesPage, PresenterPage, StatsPage } from "@kadal/deck/presenter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import manifest from "virtual:deck";

import { config } from "../deck.config.ts";
import { components } from "./components.tsx";
import "./styles.css";

// One line per framework: a renderer is the whole extension point. By name and not by import, so
// the Vue runtime is fetched by the slide that has a Vue island on it and by no other.
registerLazyRenderer("vue", () => import("@kadal/deck-vue").then((m) => m.vueRenderer));
registerLazyRenderer("svelte", () => import("@kadal/deck-svelte").then((m) => m.svelteRenderer));
registerLazyRenderer("solid", () => import("@kadal/deck-solid").then((m) => m.solidRenderer));
registerLazyRenderer("preact", () => import("@kadal/deck-preact").then((m) => m.preactRenderer));
registerLazyRenderer("fresh", () => import("@kadal/deck-fresh").then((m) => m.freshRenderer));
registerLazyRenderer("wasm", () => import("@kadal/deck-wasm").then((m) => m.wasmRenderer));
registerLazyRenderer("python", () => import("@kadal/deck-python").then((m) => m.pythonRenderer));
registerLazyRenderer("qwik", () => import("@kadal/deck-qwik").then((m) => m.qwikRenderer));
registerLazyRenderer("angular", () => import("@kadal/deck-angular").then((m) => m.angularRenderer));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck
      manifest={manifest}
      config={config}
      components={components}
      pages={{
        presenter: PresenterPage,
        audience: AudiencePage,
        notes: NotesPage,
        stats: StatsPage,
      }}
    >
      <LiveProvider />
    </Deck>
  </StrictMode>,
);
