---
"@kadal/deck": patch
---

Presenter-view fixes from launch testing.

- **Drawings stay.** A stroke or shape now stays on the slide until it is erased or cleared, in the presenter view, the play window and on every phone. It used to fade a few seconds after it was drawn unless the pin on the toolbar was on, which looked like changing the colour or the tool had wiped the slide. The pin still turns strokes into fading scribbles, and that choice is remembered.
- **Typing in a text field never drives the deck.** Single-key shortcuts (L, T, D, C, the arrows…) were taken from a field inside a shadow root, such as a host's side panel, because the deck looked only at the event's target. It now looks at where the key was really typed.
- **The pen's toolbar sits above the narration bar** in the presenter view instead of covering the play and seek controls.
- **Escape closes the theme menu while the pen is on**, instead of turning the pen off and leaving the menu open.
- **The overview opens in the presenter view.** Esc, O and an Overview button used to change a state nothing showed (and Space then closed it instead of moving on). It is the presenter's own: the audience keeps the current slide until a tile is picked.
- **The spotlight works without the laser.** The Spotlight button on its own lit nothing; it now follows the cursor on the presenter's screen and every follower's. Under the spotlight the lit circle is the pointer.
- **The window that opens the presenter view follows it**, even after it had been moved by hand first. Before, a deck you had clicked through and then pressed S on stayed where it was while you presented.
- **`/stats` opened in a new tab** shows the presenter's sign-in (the passcode, or the author's sign-in) in the deck's styling, and the stats once it is passed, instead of a line of unstyled text.
- The current part of the speaker notes is marked with a light wash and an underline rather than a selection-blue block, and notes without `[click]` markers are not marked at all.
