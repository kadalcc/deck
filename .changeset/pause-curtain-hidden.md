---
"@kadal/deck": patch
---

A screen reader no longer hears "Paused — press any key" on a deck that is running. The blackout
curtain is always in the page, drawn at opacity 0 until B pauses the deck, and its words stayed in
the accessibility tree (and in anything that reads the page's text). It is `aria-hidden` until the
deck is paused.
