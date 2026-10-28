---
"@kadal/deck": minor
---

Embedded media behaves as it does in reveal.js. Every iframe on a slide, and a background iframe,
hears `slide:start` and `slide:stop` (`postMessage`) as its slide is shown and left. A raw YouTube
or Vimeo `<iframe>` gets its player API switched on, plays with `data-autoplay` (or
`autoPlayMedia: true`) and pauses when its slide is left instead of playing on, hidden. `data-src`
on `<img>`, `<video>`, `<audio>` and `<source>` loads once the slide is within `viewDistance` (a
`<source>` makes its video load again). `preloadIframes` works: `true` loads every frame within
`viewDistance` and keeps it loaded, `false` only when its slide is shown (not even the slide
ahead), and `null` leaves it to each frame's `data-preload`, which now loads a frame within
`viewDistance` rather than only keeping it once loaded. A lazy frame left behind is unloaded
through `about:blank`, which actually stops it, and a frame that stays loaded no longer comes back
behind its poster.
