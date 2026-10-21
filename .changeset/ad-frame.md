---
"@kadal/deck": patch
---

The ad frame. When the host's override says `ads`, the play view frames the deck's first and last slides:
- **On a landscape screen:** the slide keeps its shape at 80% of its usual size, flush top-left. A tall ad takes the right-hand column, a wide ad the bottom row, and a QR code the corner, with no letterboxing.
- **On a phone or portrait window:** the slide spans the top and the ads stack below it.
- **Controls:** the arrows, slide number and progress bar move inside the slide's area, so none sits over an ad.

The host answers `GET {api}/decks/{room}/ads` with what to show. Every link is the host's own tracked redirect, and only https links or paths on the host are followed. The engine reports each showing with `POST {api}/decks/{room}/ads/seen`. The frame never appears in the presenter view, the phone remote, the audience page, the overview, or print and its exports. Self-hosted decks have no frame.
