export function tally(which) {
  const t = (window.__rustIsland ??= { mounted: 0, destroyed: 0 });
  t[which]++;
}
