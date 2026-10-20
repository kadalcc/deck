/**
 * The prebuilt shell's entry: every engine stylesheet, theme, background and page, then
 * `startShell`. Nothing here is deck-specific — the deck arrives as deck.mdx at run time.
 */
import "@kadal/deck/styles.css";
import "@kadal/deck/themes/minimal.css";
import "@kadal/deck/themes/rla.css";
import "@kadal/deck/themes/stack.css";
import "@kadal/deck/backgrounds";

import { AudiencePage } from "@kadal/deck/audience";
import { LiveProvider } from "@kadal/deck/live";
import { NotesPage, PresenterPage, StatsPage } from "@kadal/deck/presenter";
import { RemotePage } from "@kadal/deck/remote";
import { startShell } from "@kadal/deck/runtime";

startShell({
  root: document.getElementById("root")!,
  config: {
    colorScheme: "auto",
    transition: "slide",
    slideNumber: "c/t",
    controls: true,
    progress: true,
    // The host turns the room on by injecting window.__KADAL_DECK__ ({ api, room, base, files }).
    live: { api: null, room: null },
  },
  pages: {
    presenter: PresenterPage,
    audience: AudiencePage,
    notes: NotesPage,
    stats: StatsPage,
    remote: RemotePage,
  },
  providers: LiveProvider,
});
