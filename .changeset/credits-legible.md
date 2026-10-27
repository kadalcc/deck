---
"@kadal/deck": patch
---

The credits read on any slide and theme. The footer's Credits line in print and the exports sits
on a wash of the deck's background, so a bright picture or a background that fills in at a later
click can't swallow it (it measured 1.94:1 on a bright slide in dark). The Credits slide's quiet
text uses a quiet ink a step toward the main one, because the cards sit on a raised surface where
a theme's muted colour can drop under 4.5:1 (minimal, light: 4.35), and its lede ignores a theme's
half-opacity subtitle rule (classic: 1.96:1). Checked with `kadal-deck contrast` on minimal, folio,
swiss, neon, classic, terminal, crayon and brand, light and dark: 0 failing.
