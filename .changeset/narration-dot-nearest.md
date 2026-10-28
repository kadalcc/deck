---
"@kadal/deck": patch
---

On the narration timeline, the pointer at a slide's dot names that slide, and a click goes there.
Each dot's target is wider than the gap between dots, so a dot's neighbour (drawn on top) took the
pointer at the very centre of the dot: on the showcase, 24 dots showed the next slide's tooltip and
a click on them seeked one slide too far. The dot nearest the pointer now wins.
