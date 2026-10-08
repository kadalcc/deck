/**
 * Posters stand in for an embedded page wherever it cannot be live: the print pages, the
 * overview tiles, the presenter's next-slide box, the scroll view — and behind the shield while
 * the real page loads. A deck names one (`poster: shots/map.jpg` on an iframe slide, or
 * `<Iframe poster>`); without one, `deck export` captures a screenshot of the URL at the pane's
 * size into `public/posters/` under a name both sides derive from the URL, so nothing else has
 * to be wired.
 */
export const POSTER_DEFAULT_SIZE: readonly [number, number] = [1600, 900];

/** FNV-1a over the URL, in base 36: short, stable, filename-safe. */
export function posterHash(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The path under `public/` where a captured poster for this URL at this pane size lives. */
export function posterName(url: string, width: number, height: number): string {
  return `posters/${posterHash(url)}@${Math.round(width)}x${Math.round(height)}.jpg`;
}

/** A poster path as written in a deck → a URL the page can load. */
export function resolvePoster(path: string, base: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:") || path.startsWith("/")) return path;
  return `${base.replace(/\/?$/, "/")}${path}`;
}
