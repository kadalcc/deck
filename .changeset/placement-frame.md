---
"@kadal/deck": patch
"@kadal/deck-shell": patch
---

A host can ask where placed elements start. The new `layout.frame` command (advertised as `"frame"` in the preview's `ready.features`) answers `{ slide, x, y, unit, width, height }` for the slide shown: where `x`/`y` of `<Sticker>`, `<Arrow>` and `<Drag>` start, in stage pixels. Those are positioned inside the slide's layout box (the theme's padding, a layout's own, a slide's `zoom`), not on the stage, so an editor that places something where a person dropped it converts a stage point P to `(P − x) / unit`. It is measured in the page, so it is right for any theme, including a deck's own. Nothing about how decks render changes.
