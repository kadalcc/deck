import { Deck } from "@kadal/deck";
import "@kadal/deck/styles.css";
import { PresenterPage } from "@kadal/deck/presenter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import manifest from "virtual:deck";

// No theme imports: deck.mdx lists the themes, and the deck plugin brings them in.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck manifest={manifest} pages={{ presenter: PresenterPage }} />
  </StrictMode>,
);
