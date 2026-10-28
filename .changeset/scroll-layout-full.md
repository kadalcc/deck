---
"@kadal/deck": minor
---

The scroll view takes reveal.js's `scrollLayout` and runs auto-animate:

- **`scrollLayout: full`** gives each slide the whole viewport, with the slide letterboxed and
  centred inside it, as reveal.js does by default. `compact` stays the default: each slide is as
  wide as the viewport and as tall as its aspect ratio makes it.
- **Auto-animate in the scroll view.** When the slide being read becomes one that auto-animates
  from its neighbour, its elements morph in place from where they were on that slide. The same
  rules apply as on the stage: `autoAnimateId`, `autoAnimateRestart`, per-slide timing, the
  matcher and the state attributes.
