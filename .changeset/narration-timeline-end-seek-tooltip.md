---
"@kadal/deck": patch
---

The narration timeline, fixed in three ways.

- **The bar reaches the end on the last slide.** The bar now ends where the last slide starts, so that slide's point sits at the far right, and once you are on the last slide the bar is full, whether it is playing, paused or stopped. Before this, the bar stopped at about 88% with grey track after it. Every other point, and where a hover or a click lands, uses the same scale. The time beside the bar ("0:40 / 0:46") is still the real time of the talk. In a one-slide deck the bar fills across that slide's own talk.
- **Clicking the timeline no longer starts the voice.** A click on the bar, or the arrow, Page, Home and End keys on it, moves the deck to that slide and leaves play alone. Paused or stopped stays that way, and Play starts from there. If it was playing, it plays on from the new slide. A click after the end waits there too, and Play goes on from that slide instead of starting the talk over. Agents can do the same with the new `narrate.seek` command (`{ to }`, a 0-based slide index).
- **The hover card.** It is now a fixed width: the picture of the slide with the same padding on every side, however long the title is. The slide number ("7.") and the time ("0:36 ·") stay put. A title or chapter name that is too long ends in an ellipsis, then slowly slides along to show the rest, waits, and slides back. With reduced motion it keeps the ellipsis and does not move. The picture is now drawn exactly as the stage draws the slide: the card's own text styles no longer reach into it, so a paragraph that wraps on the slide wraps in the picture too, instead of staying on one cut-off line.
