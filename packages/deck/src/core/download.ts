import type { DeckConfig } from "./model.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DOWNLOAD  —  what the deck's Download button offers
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   download: "https://…/talk.pdf"   that file (a same-site path works too)
 *   download: true                   the PDF `kadal-deck build --download` wrote beside the deck
 *                                    (DOWNLOAD_FILE), checked when the button is pressed; when
 *                                    there is none, the browser exporter (/export) opens instead
 *   download: false (the default)    no button
 *
 * The host has the last word (`window.__KADAL_DECK__.download`, see model.ts withHostOverride):
 * deck.kadal.cc shows the button on paid plans only, and can point it at the PDF it archived.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The file `kadal-deck build --download` writes into dist/, beside index.html. */
export const DOWNLOAD_FILE = "deck.pdf";

export type DownloadTarget =
  | { kind: "none" }
  | { kind: "url"; url: string }
  /** The built PDF if it is there, else the exporter. */
  | { kind: "built"; pdf: string; exporter: string };

/** What the button does for this config, with `base` the deck's root path ("/talk/"). */
export function downloadTarget(config: Pick<DeckConfig, "download">, base: string): DownloadTarget {
  const d = config.download;
  const root = base.endsWith("/") ? base : `${base}/`;
  if (typeof d === "string" && d.trim()) {
    const url = d.trim();
    // A relative path is the deck's own file (public/talk.pdf → "talk.pdf").
    return {
      kind: "url",
      url: /^(https?:)?\/\//.test(url) || url.startsWith("/") ? url : root + url,
    };
  }
  if (d === true)
    return { kind: "built", pdf: `${root}${DOWNLOAD_FILE}`, exporter: `${root}export` };
  return { kind: "none" };
}
