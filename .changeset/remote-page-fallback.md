---
"@kadal/deck": patch
---

A deck with a presenter view now always serves the phone remote. Decks made before the remote existed passed only the presenter, audience, notes and stats pages to `<Deck pages>`. The presenter still showed the remote's QR code, and scanning it opened "This deck was built without the remote page". When `pages.remote` is missing, the engine now uses its own remote page. It is loaded in a separate chunk, only when a phone opens `/remote`, so the deck itself doesn't grow. A deck that passes its own remote page is unchanged.
