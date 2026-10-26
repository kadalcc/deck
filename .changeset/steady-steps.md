---
"@kadal/deck": minor
---

Nothing moves while a slide explains itself:

- `<Stepper>`: progress as fixed furniture. Equal cells, so the current step never nudges the
  others; `place="top"` or `"bottom"` draws it on the slide's rail, outside the layout (not
  centred, not auto-fitted), so it sits pixel-identical on every slide; `follow` walks it with the
  slide's clicks (give a `<Switch>` the same `at` to move an explanation in lockstep); variants
  chips, bar and dots.
- Auto-fit no longer grows a slide back between clicks: within one showing, at one size, a slide's
  scale only ever shrinks, so the whole slide stops breathing in and out as steps reveal.
- `<Counter>`, `<Typewriter>` and `<Encrypted>` hold the width of their final text from the first
  frame, so the line around them no longer reflows while they animate.
- Backgrounds receive the slide's current step (`click` in their props), so a background can move
  with an explanation — a module that fills, a light that travels — while the layout stays still.
