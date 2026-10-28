---
"@kadal/deck": minor
---

Backgrounds behave as they do in reveal.js. A background video takes reveal's comma-separated list
of sources (`/loop.webm, /loop.mp4`), each a typed `<source>`, so the browser plays the first it
can; it pauses when its slide is left and plays from the start when shown again (and not at all
with `autoPlayMedia: false`). An animated GIF background, and a GIF `<img>` on a slide, starts
again from its first frame each time its slide is shown. `parallaxBackgroundImage` (with
`parallaxBackgroundSize`, `-Horizontal` and `-Vertical`) draws reveal's parallax background: one
large image under every slide that moves with each slide, by reveal's own arithmetic.
