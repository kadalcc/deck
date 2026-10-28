---
"@kadal/deck": minor
---

Auto-animate follows reveal.js more closely:

- **`autoAnimateRestart`** works. It was read and then ignored, so a slide that set it still
  morphed from the one before. Now the later of two slides breaks the chain, whichever way the
  deck is going, and the two get the slide's normal transition.
- **Per-slide timing.** `autoAnimateDuration`, `autoAnimateEasing` and `autoAnimateUnmatched` on a
  slide set the animation into it, over the deck's values.
- **`autoAnimateStyles`** picks the CSS that morphs. The default is reveal's twelve properties, so
  padding, line-height, letter-spacing, borders and outlines now animate too instead of jumping.
  An element whose box changes size because of these properties (a heading going from h1 to h2)
  is moved but not also scaled. Scaling it as well had counted the change twice.
- A slide with `autoAnimate` that is reached from one that does not auto-animate into it now
  gets its normal transition. It used to cut.
- The arriving slide no longer slides in under its own morph. The stage switched its transition
  back on a frame after an auto-animate started, so with `transition: slide` the whole slide
  slid in while its elements moved.
