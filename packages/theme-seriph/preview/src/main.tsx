import { Deck } from "@kadal/deck";
import "@kadal/deck/styles.css";
import { PresenterPage } from "@kadal/deck/presenter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import manifest from "virtual:deck";

// The theme needs no import here: deck.mdx names it (`theme: ../`), and the deck plugin brings its
// stylesheet and module in.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck manifest={manifest} pages={{ presenter: PresenterPage }} />
  </StrictMode>,
);
