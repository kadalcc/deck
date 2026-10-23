---
"@kadal/deck": patch
---

The presenter view and the play view's corners, tidied:

- **Presenter layout.** The presenter view now opens with the notes and the next slide on the left and the current slide beside them. A switch in the top bar picks between that, notes on the right, and a big next slide; L still steps through them, and each window remembers its choice.
- **Overview in every deck.** The presenter toolbar has its own Overview button. It used to come only from a deck's own nav-controls layer, so most decks had none.
- **Theme button.** In the presenter view it sits at the bottom-left of the current slide, as it does in the play view, and over the overview it moves to the window's bottom-left. It no longer floats above the overview from the toolbar.
- **Arrows.** The 3 × 3 cross of chevrons is now one pill in the bottom-right corner — ‹ 5 / 138 › — the same height, line and look as the theme button opposite. Up and down join it only on slides with a stack, and the number opens jump-to. `controlsLayout: "edges"` is unchanged.
- **Focus labels (F).** Every control gets a label: the deck's nav-controls buttons, "Follow the presenter", the narration bar, the notes tools, the layout switch and the presenter's timer were missed.
- **Centring.** The stage is laid out on whole device pixels, so the bars either side of a slide are exactly the same width. They could differ by a pixel before. The same holds in the presenter's panes.
- **Follow the presenter** sits on the same middle line as the corner buttons.
