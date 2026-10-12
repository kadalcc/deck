# @kadal/deck

## 0.1.1

### Patch Changes

- a433d50: Ship the map-room and sign backgrounds. 0.1.0's build dropped `src/backgrounds/gis.tsx` and `sign.tsx`, which register themselves on import, because `sideEffects` named only `dist/` paths. So `background: globe` (and raster, choropleth, lattice, thiessen, voronoi, cells, compass, neatline, scan, track, plane, floor, signer, variants, handshapes, trails, window and embedding) showed "Unknown background" instead.
