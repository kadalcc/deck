---
"@kadal/deck": patch
---

A slide off screen can no longer draw over the one on show. The stage keeps the slides around the
current one mounted (`viewDistance`) and hid them with `visibility: hidden` alone, which a child can
undo: anything styled `visibility: visible` (an author's CSS, a Pro item, a component) showed
through, over the current slide. Those slides are now also `opacity: 0`, which nothing inside can
undo, and `inert`, so nothing in them takes focus or the pointer; the same holds for the slide just
left when its way out is a cut, a view transition or reduced motion. Transitions, auto-animate, the
overview, the presenter's next slide, print, the scroll view and thumbnails are unchanged.
