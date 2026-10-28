---
"@kadal/deck": patch
---

A step pressed while a slide's library (`pro/`) layout is still loading now waits for the layout's own click steps instead of skipping to the next slide. The click registry gains a generic `hold()`: anything on a slide that will take steps it cannot count yet holds the slide's total open (for at most 8 s), and the presses made meanwhile are taken once it lets go. A declared `clicks:` needs no hold.
