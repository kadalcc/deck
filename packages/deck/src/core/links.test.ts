import { describe, expect, test } from "bun:test";

import {
  NAVIGATE_SELECTOR,
  navigateEnabled,
  navigateOf,
  PREVIEW_SELECTOR,
  previewOf,
  previewOptedOut,
} from "./links.ts";
import type { Routes } from "./navigation.ts";

const classy = (...names: string[]) => ({
  classList: { contains: (n: string) => names.includes(n) },
});
const attrs = (a: Record<string, string>) => ({
  getAttribute: (n: string) => (n in a ? a[n]! : null),
  hasAttribute: (n: string) => n in a,
});
const none: Routes = {
  left: false,
  right: false,
  up: false,
  down: false,
  prevClick: false,
  nextClick: false,
};

describe("navigate-* links", () => {
  test("every reveal class is in the selector", () => {
    for (const d of ["left", "right", "up", "down", "prev", "next"])
      expect(NAVIGATE_SELECTOR).toContain(`.navigate-${d}`);
  });

  test("the class names the way", () => {
    expect(navigateOf(classy("button", "navigate-next"))).toBe("next");
    expect(navigateOf(classy("navigate-up"))).toBe("up");
    expect(navigateOf(classy("navigate"))).toBeNull();
  });

  test("enabled follows the routes; prev and next count click steps", () => {
    expect(navigateEnabled("right", { ...none, right: true })).toBe(true);
    expect(navigateEnabled("left", { ...none, right: true })).toBe(false);
    expect(navigateEnabled("next", { ...none, down: true })).toBe(true);
    expect(navigateEnabled("next", { ...none, nextClick: true })).toBe(true);
    expect(navigateEnabled("prev", none)).toBe(false);
    expect(navigateEnabled("prev", { ...none, prevClick: true })).toBe(true);
  });
});

describe("previews", () => {
  test('data-preview-link="false" is an opt-out, not an address', () => {
    expect(PREVIEW_SELECTOR).toContain(':not([data-preview-link="false"])');
    expect(previewOptedOut(attrs({ href: "https://x.dev", "data-preview-link": "false" }))).toBe(
      true,
    );
    expect(previewOptedOut(attrs({ href: "https://x.dev", "data-no-preview": "" }))).toBe(true);
    expect(previewOptedOut(attrs({ href: "https://x.dev" }))).toBe(false);
  });

  test("a flag opens the link's own href; a value is the address", () => {
    expect(previewOf(attrs({ href: "https://a.dev", "data-preview-link": "" })).src).toBe(
      "https://a.dev",
    );
    expect(previewOf(attrs({ href: "https://a.dev", "data-preview-link": "true" })).src).toBe(
      "https://a.dev",
    );
    expect(previewOf(attrs({ href: "#", "data-preview-link": "https://b.dev" })).src).toBe(
      "https://b.dev",
    );
    expect(previewOf(attrs({ src: "a.png", "data-preview-image": "" }))).toEqual({
      kind: "image",
      src: "a.png",
      fit: "scale-down",
    });
  });
});
