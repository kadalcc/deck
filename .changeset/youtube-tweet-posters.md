---
"@kadal/deck": patch
---

`<Youtube>` and `<Tweet>` get posters. `kadal-deck export --posters` now captures them, which it skipped before, so the print, the overview and the next-slide box showed an empty card. A video's poster is its player, opened with a referrer so YouTube draws the video instead of "Error 153". A post gets one per colour scheme, captured at the card's own width and painted to its edges. Both components also take a `poster` prop of their own.
