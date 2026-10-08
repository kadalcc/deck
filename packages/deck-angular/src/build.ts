import { DECK_RENDERER } from "@kadal/deck/renderers/contract";

/**
 * Build-time helpers for Angular islands.
 *
 * This module exists apart from the renderer for one reason: a deck's `vite.config.ts` imports it,
 * and a Vite config is evaluated by Node before any bundling happens. Anything the config reaches
 * is loaded for real, in Node, with no browser and no build step — so a build helper that sits next
 * to the renderer drags the whole framework runtime into that moment. Angular is the one that
 * proves it: importing its package from a Vite config fails outright with "the injectable is part
 * of a library that has been partially compiled", because Angular's own packages are published
 * partially compiled and need the linker the build has not run yet.
 *
 * So this file imports nothing but a type and a symbol from the engine's contract. Keep it that
 * way — the stamp lives here too, because assigning a symbol needs no framework either.
 */

/**
 * The files a deck hands to Angular's compiler, and to nothing else.
 *
 * Angular is the one framework here that cannot be reached with a JSX pragma: a `@Component` has to
 * go through Angular's own compiler to become something `createComponent` can mount. Analog's Vite
 * plugin does that, and `transformFilter` is how it is kept to these files instead of every `.ts`
 * in the deck:
 *
 *     angular({
 *       tsconfig: "tsconfig.angular.json",
 *       transformFilter: isDeckAngularFile,
 *     })
 */
export const deckAngularFiles = ["**/*.angular.ts"] as const;

/** `transformFilter` for Analog's plugin: true for the deck's Angular files only. */
export function isDeckAngularFile(_code: string, id: string): boolean {
  const [path] = id.split("?");
  return path?.endsWith(".angular.ts") ?? false;
}

/** Stamp an Angular component so the engine knows who wrote it. */
export function deckAngular<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "angular";
  return component;
}
