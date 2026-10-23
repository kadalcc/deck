---
"@kadal/deck": patch
---

`kadal-deck screenshot --slide` counts from 1, as `export --range` and the deck's own slide counter do, and takes ranges (`--slide 2-4`) and ids. Files are named from 1 too (`slide-001.png` is the first slide) and `--json` reports the same numbers. `--slide 0` is still read as the first slide, with a note. Both commands' help says how they count.
