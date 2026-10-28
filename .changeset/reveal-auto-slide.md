---
"@kadal/deck": minor
---

Auto-slide as reveal.js has it. `autoSlide: false` turns it off outright, slides' own intervals and
`A` included. `autoSlideMethod` picks the step by name ("right" skips vertical stacks; reveal's
`Reveal.navigateRight` and any command id work too). With `autoSlideStoppable`, a key the deck
answers now stops it as a press does (`A` excepted). A step that carries `data-autoslide` (reveal's
per-fragment interval) waits that long before the next step, over the slide's own.
