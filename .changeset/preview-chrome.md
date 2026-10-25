---
"@kadal/deck": patch
"@kadal/deck-shell": patch
---

An editor's preview can hide the deck's own chrome. The preview bridge gains `{type:"chrome", on}` (advertised as `"chrome"` in `ready.features`; on by default, so editors that never send it see no change): off hides the arrows pill with the slide number, the corner tools, the progress bar, the notes footer, the theme button and the unknown-theme notice, for an editor whose stage has its own controls, and stays off across recompiles. The free plan's watermark and ads, the premium notice, and what a key or the slide opens (help, jump-to, search, pause, toasts, confetti) stay. `<Deck chrome={false}>` does the same for any host. Published decks are unchanged.
