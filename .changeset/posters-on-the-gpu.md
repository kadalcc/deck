---
"@kadal/deck": patch
---

Posters of maps show the map. `kadal-deck export` photographed embedded pages on software WebGL (SwiftShader), where a map is so slow that in ten seconds it had fetched almost none of its tiles, so the poster was the markers floating over an empty grid. Posters are now taken on the machine's GPU when it has one (SwiftShader remains the fallback, as on CI), only after the page's requests have gone quiet, and at 2× so they stay sharp in the PDF.
