/**
 * The bundled copies of remote assets the runtime itself asks for (`bundleRemoteAssets`, see
 * vite/remote-assets.ts). Most remote URLs are rewritten in the build's code and CSS directly;
 * the web-font stylesheets are not in any file — theming/react.tsx makes their URLs from the
 * `fonts` key as the deck loads — so the build leaves a map of them on the window, set by the
 * `virtual:deck` manifest module before anything renders, and the font loader asks it here.
 */
declare global {
  // oxlint-disable-next-line no-var -- a global the manifest module sets
  var __KADAL_DECK_ASSETS__: Record<string, string> | undefined;
}

/** The bundled copy of `url`, or `url` itself when there is none. */
export function localAsset(url: string): string {
  return globalThis.__KADAL_DECK_ASSETS__?.[url] ?? url;
}
