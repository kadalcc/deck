import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { DEFAULT_TILE, resolveBackground } from "../core/model.ts";
import { createStore } from "../core/store.ts";
import { BackgroundLayer } from "./Backgrounds.tsx";
import { DeckContext, type DeckRuntime } from "./context.ts";

const PATTERN =
  "https://deck.kadal.cc/api/v1/media/store/files/kse_abcdefghijklmnopqrst/0123456789ab.png";

function render(background: unknown): string {
  const deck = {
    manifest: { dev: false },
    mode: "play",
    config: { width: 1920, height: 1080 },
    ui: createStore({ theme: "classic", colorScheme: "light" }),
  } as unknown as DeckRuntime;
  return renderToString(
    createElement(
      DeckContext.Provider,
      { value: deck },
      createElement(BackgroundLayer, { bg: resolveBackground({ background }), active: true }),
    ),
  );
}

describe("pattern and wallpaper backgrounds", () => {
  test("repeat: true tiles; a number size is the tile's width in stage pixels", () => {
    const bg = resolveBackground({ background: { image: PATTERN, repeat: true, size: 256 } })!;
    expect(bg).toMatchObject({ image: PATTERN, repeat: "repeat", size: "256px", stageSize: true });
    expect(
      resolveBackground({ background: { image: PATTERN, repeat: true, size: "300" } })!.size,
    ).toBe("300px");
  });

  test("the builder's spelling, repeat: repeat and a px size, is stage pixels too", () => {
    const bg = resolveBackground({
      background: { image: PATTERN, repeat: "repeat", size: "480px", provider: "kadal-store" },
    })!;
    expect(bg).toMatchObject({ repeat: "repeat", size: "480px", stageSize: true });
    // Not tiled: a CSS size as before.
    expect(resolveBackground({ background: { image: PATTERN, size: "480px" } })!.stageSize).toBe(
      false,
    );
  });

  test("repeat: true with no size: tiles of the default width, not one stretched over the slide", () => {
    const bg = resolveBackground({ background: { image: PATTERN, repeat: true } })!;
    expect(bg.size).toBe(`${DEFAULT_TILE}px`);
    expect(bg.stageSize).toBe(true);
  });

  test("reveal's spellings are as they were: CSS sizes, the layer's own pixels", () => {
    const bg = resolveBackground({
      backgroundImage: PATTERN,
      backgroundRepeat: "repeat-x",
      backgroundSize: "64px",
    })!;
    expect(bg).toMatchObject({ repeat: "repeat-x", size: "64px", stageSize: false });
    expect(resolveBackground({ background: { image: PATTERN, repeat: false } })!.repeat).toBe(
      "no-repeat",
    );
  });

  test("a wallpaper covers: the bare address, or { image }", () => {
    for (const background of [PATTERN, { image: PATTERN }, { image: PATTERN, size: "cover" }]) {
      const bg = resolveBackground({ background })!;
      expect(bg).toMatchObject({
        image: PATTERN,
        size: "cover",
        repeat: "no-repeat",
        stageSize: false,
      });
    }
  });

  test("a tiled pattern is drawn on the stage, so its tiles scale with the slide", () => {
    const tiled = render({ image: PATTERN, repeat: true, size: 256, color: "#102030" });
    expect(tiled).toContain("deck-background-tiles");
    expect(tiled).toContain("deck-background-stage");
    expect(tiled).toContain("background-size:256px");
    expect(tiled).toContain("background-repeat:repeat");
    // The colour stays under it, on the layer itself.
    expect(tiled).toContain("background-color:#102030");
    const cover = render({ image: PATTERN });
    expect(cover).not.toContain("deck-background-tiles");
    expect(cover).toContain("background-size:cover");
  });
});
