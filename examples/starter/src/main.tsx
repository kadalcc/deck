import { Deck } from "@kadal/deck";
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
