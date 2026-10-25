import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { resolveBackground } from "../core/model.ts";
import { REMOVED_BACKGROUNDS, removedBackgroundHint } from "../core/removed.ts";
import { createStore } from "../core/store.ts";
import "../backgrounds/index.tsx";
import { BackgroundLayer, backgroundComponent } from "./Backgrounds.tsx";
import { DeckContext, type DeckRuntime } from "./context.ts";

/** Just enough of a deck for a background layer: the manifest's `dev` flag and the ui store. */
function render(name: string, dev: boolean, colorScheme: "light" | "dark" = "light"): string {
  const deck = {
    manifest: { dev },
    ui: createStore({ theme: "classic", colorScheme }),
  } as unknown as DeckRuntime;
  return renderToString(
    createElement(
      DeckContext.Provider,
      { value: deck },
      createElement(BackgroundLayer, { bg: resolveBackground({ background: name }), active: true }),
    ),
  );
}

describe("backgrounds removed in 0.6", () => {
  test("none of the eight is registered any more; the rest still are", () => {
    for (const name of REMOVED_BACKGROUNDS) expect(backgroundComponent(name)).toBeNull();
    for (const name of ["aurora", "gradient-mesh", "globe", "thiessen", "cells", "plane", "topo"])
      expect(backgroundComponent(name)).not.toBeNull();
  });

  test("the hint names the background and the docs anchor, only for those eight", () => {
    expect(removedBackgroundHint("signer")).toBe(
      "`signer` was removed in Kadal Deck 0.6. Copy it into your deck: https://deck.kadal.cc/docs/backgrounds/#removed-in-06",
    );
    expect(removedBackgroundHint("lattice")).toContain("`lattice` was removed");
    expect(removedBackgroundHint("nope")).toBeNull();
    expect(removedBackgroundHint(undefined)).toBeNull();
  });

  test("a published deck shows the theme's background and says nothing", () => {
    for (const name of ["signer", "track", "no-such-thing"]) {
      const html = render(name, false);
      expect(html).not.toContain("deck-background-missing");
      expect(html).not.toContain("Unknown background");
    }
  });

  test("the dev server gets the notice, and for a removed name where it went", () => {
    const removed = render("signer", true);
    expect(removed).toContain("Unknown background “signer”");
    expect(removed).toContain("was removed in Kadal Deck 0.6");
    expect(removed).toContain("https://deck.kadal.cc/docs/backgrounds/#removed-in-06");
    const other = render("no-such-thing", true);
    expect(other).toContain("Unknown background “no-such-thing”");
    expect(other).not.toContain("was removed");
  });
});

describe("light-page treatments", () => {
  test("sweep's default palette is pale on a light page and night navy on a dark one", () => {
    expect(render("sweep", false, "light")).toContain("#dbeafe");
    expect(render("sweep", false, "dark")).toContain("#0f172a");
  });
});
