---
"@kadal/deck": patch
"@kadal/deck-shell": patch
---

Drawn backgrounds look the same at every size. The background stack covers the stage's box in screen pixels, and component backgrounds drew in those pixels — aurora's swell and blur, waves' strokes, the mesh's and glows' `vmax` blobs — so a small preview (the builder's, a thumbnail, the presenter's) showed bands twice as tall and twice as soft as the full window. Component and `pro/` backgrounds now lay out at the deck's own size and are scaled to cover their box, as the stage is; canvas blurs follow the bitmap's scale (`ctx.filter` and `shadowBlur` are in bitmap pixels); the mesh and glows size their blobs off their own box (`cqmax`). Colours, gradients, images and video are unchanged.
