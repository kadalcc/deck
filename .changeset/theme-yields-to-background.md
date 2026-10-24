---
"@kadal/deck": patch
"@kadal/theme-brand": patch
"@kadal/theme-neon": patch
"@kadal/theme-crayon": patch
"@kadal/theme-ocean": patch
"@kadal/theme-swiss": patch
"@kadal/theme-bricks": patch
"@kadal/theme-shibainu": patch
"@kadal/theme-classic": patch
"@kadal/theme-seriph": patch
"@kadal/theme-crisp": patch
---

A slide with a background of its own now shows it on every layout. Themes that decorate a layout — brand's coloured cover, neon's sun and grid, crayon's shapes, bricks' and shibainu's blocks, swiss's section ground, ocean's waves, the black end slide — step aside on a slide that sets `background:`, instead of painting over it (a background on a brand cover rendered as nothing) or stacking a second set of art on it. A library background drawn for one scheme, like a chalkboard, also gives its slide that scheme unless the slide chooses its own, so a light deck's dark text never lands on a dark board.
