import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HStack, VStack } from "./content.tsx";

describe("HStack / VStack", () => {
  test("render reveal's r-hstack / r-vstack as a centred flex row or column", () => {
    expect(renderToStaticMarkup(<HStack>a</HStack>)).toBe('<div class="deck-hstack">a</div>');
    expect(
      renderToStaticMarkup(
        <VStack gap="1rem" align="start" justify="space-between" className="x">
          b
        </VStack>,
      ),
    ).toBe(
      '<div class="deck-vstack x" style="gap:1rem;align-items:start;justify-content:space-between">b</div>',
    );
  });
});
