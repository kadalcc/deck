---
"@kadal/deck": patch
---

`kadal-deck contrast` counts a heavy text outline as the text's own background, as it already did
for SVG labels: `paint-order: stroke` with a `-webkit-text-stroke` of 3px or more. Classic meme
captions (white Anton outlined in black) no longer fail on light templates; they read on any
picture. The meme template credit chip keeps its white text under a theme's link colour (it read
2.65:1 on the minimal theme).
