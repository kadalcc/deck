---
"@kadal/deck": patch
---

A magic-move block counts its clicks on a cold load. When the block's steps arrived after the slide's first render (opening a deck straight onto a magic-move slide, most often in a tall window), the slide registered 0 clicks: the block showed its last step at once and Next skipped past it. The click registry now lays the slide out again when an element asks for different steps, and the elements after it move along.
