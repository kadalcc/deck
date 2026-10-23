---
"@kadal/deck": patch
---

`kadal-deck check` reads the headmatter as the deck's settings. A key both the deck and a slide take is checked against the deck's meaning at the top of deck.mdx, so `narration: { engine: browser, rate: 1.1 }` (or `zoom: true`) no longer fails as "expected false".
