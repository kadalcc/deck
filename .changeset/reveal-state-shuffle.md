---
"@kadal/deck": minor
---

reveal.js's `data-state`, `shuffle`, `respondToHashChanges` and `focusBodyOnPageVisibilityChange`.
A slide's `state` now also goes on the deck root, as `<name>` and `state-<name>`, and fires an event
of that name there (plus `deck:state`), so CSS and scripts for the whole page can follow it.
`shuffle: true` deals the columns and each stack anew on every load of the play view and hands the
order to its presenter view and share window; it used to do nothing. `respondToHashChanges: false`
keeps a hash change from moving the deck. When the tab becomes visible again, focus left in an
embedded page or a control goes back to the page so the keys work (a text field keeps its caret).
