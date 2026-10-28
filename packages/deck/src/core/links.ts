import type { Routes } from "./navigation.ts";

/**
 * Links on a slide that the deck itself answers, as reveal.js does (https://revealjs.com/links/):
 *
 *   - `.navigate-left`, `-right`, `-up`, `-down`, `-prev`, `-next` on any element move the deck,
 *     and carry `.enabled` while that way leads somewhere;
 *   - `data-preview-link`, `data-preview-image`, `data-preview-video` open the lightbox, and
 *     `previewLinks: true` opens every outside link there, unless the link says
 *     `data-preview-link="false"` (reveal's opt-out; `data-no-preview` is Kadal's older name).
 *
 * Elements are read through the few DOM methods used here, so the rules are testable without one.
 */

export type NavigateLink = "left" | "right" | "up" | "down" | "prev" | "next";

export const NAVIGATE_LINKS: readonly NavigateLink[] = [
  "left",
  "right",
  "up",
  "down",
  "prev",
  "next",
];

export const NAVIGATE_SELECTOR = NAVIGATE_LINKS.map((d) => `.navigate-${d}`).join(", ");

interface Classy {
  classList: { contains(name: string): boolean };
}

/** Which way an element marked `.navigate-*` moves the deck (the first class, in reveal's order). */
export function navigateOf(el: Classy): NavigateLink | null {
  return NAVIGATE_LINKS.find((d) => el.classList.contains(`navigate-${d}`)) ?? null;
}

/**
 * Whether a link that way leads anywhere from here (reveal's controls.update): the arrows by the
 * routes, and prev / next by any route back or on, the click steps of the slide included.
 */
export function navigateEnabled(link: NavigateLink, routes: Routes): boolean {
  switch (link) {
    case "left":
      return routes.left;
    case "right":
      return routes.right;
    case "up":
      return routes.up;
    case "down":
      return routes.down;
    case "prev":
      return routes.left || routes.up || routes.prevClick;
    case "next":
      return routes.right || routes.down || routes.nextClick;
  }
}

/** The elements that open the lightbox; an explicit `data-preview-link="false"` is not one of them. */
export const PREVIEW_SELECTOR =
  '[data-preview-image], [data-preview-video], [data-preview-link]:not([data-preview-link="false"])';

interface Linky {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

/** A link that has opted out of the lightbox (reveal's `data-preview-link="false"`, or `data-no-preview`). */
export function previewOptedOut(a: Linky): boolean {
  return a.getAttribute("data-preview-link") === "false" || a.hasAttribute("data-no-preview");
}

export interface Preview {
  kind: "image" | "video" | "iframe";
  src: string;
  fit: string;
}

/** What a `[data-preview-*]` element opens. */
export function previewOf(el: Linky): Preview {
  const fit = el.getAttribute("data-preview-fit") ?? "scale-down";
  const own = (name: string) => el.getAttribute(name) || null;
  if (el.hasAttribute("data-preview-image"))
    return { kind: "image", src: own("data-preview-image") ?? own("src") ?? "", fit };
  if (el.hasAttribute("data-preview-video"))
    return { kind: "video", src: own("data-preview-video") ?? own("src") ?? "", fit };
  // reveal's `data-preview-link` is a flag on the link (its href is the page); Kadal also lets it
  // carry the address itself. "true" is the flag spelled out.
  const link = own("data-preview-link");
  return { kind: "iframe", src: (link !== "true" && link) || own("href") || "", fit };
}
