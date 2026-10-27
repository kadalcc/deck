---
"@kadal/deck": patch
---

The print view (`?print-pdf&clicks=1`) prints a page per click step again for a deck whose every slide sets `clicks:` in its frontmatter. Such a slide reports its total from its first effect, before the print view had subscribed to the navigation store, and nothing reported it again, so each slide printed once, at click 0: `kadal-deck export` and `kadal-deck contrast` saw only the first state of every slide. The print view now reads the totals already in the store.
