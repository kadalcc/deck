---
"@kadal/deck": minor
---

Slide numbers count the way reveal.js counts. A slide with `visibility: uncounted` is left out of the slide number, the total and the progress bar (an appendix after the end now reads "5 / 5", not "7 / 7"); `slideNumber` may be a function in deck.config.ts, called with `{ h, v, click, index, total, id }` and returning one string or reveal.js's three; and jump-to takes `6/2` as well as `6.2` for column 6, row 2.
