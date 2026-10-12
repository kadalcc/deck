import { Deck } from "@kadal/deck";
import "@kadal/deck/styles.css";
import "@kadal/deck/themes/minimal.css";
import { AudiencePage } from "@kadal/deck/audience";
import { LiveProvider } from "@kadal/deck/live";
import { NotesPage, PresenterPage, StatsPage } from "@kadal/deck/presenter";
import { createRoot } from "react-dom/client";
import manifest from "virtual:deck";

createRoot(document.getElementById("root")!).render(
  <Deck
    manifest={manifest}
    config={{ theme: "minimal", live: { api: "/api", room: null } }}
    pages={{ presenter: PresenterPage, audience: AudiencePage, notes: NotesPage, stats: StatsPage }}
  >
    <LiveProvider />
  </Deck>,
);
