---
"@kadal/deck": patch
---

`kadal-deck contrast` no longer fails the whole run when one page's picture takes more than 30 s (a busy machine, a CI runner under load). That page is pictured again with 120 s to wait, and its second picture starts with the wait its first needed. If it still doesn't come, the page is listed as `not measured: slide N, no picture in 150 s`, and the run goes on to the rest of the deck.

The exit code still means what it did: 0 only when every page was measured and every text reads. A run with a page left unmeasured exits 1, says "No text measured below 4.5:1, but not every page was measured" rather than "Every text reads", and lists those pages in `--json` as `unmeasured`.
