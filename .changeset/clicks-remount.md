---
"@kadal/deck": patch
---

A slide whose content mounts again — most often when a Pro library layout arrives and replaces the
fallback layout — no longer doubles its clicks. The new elements were placed after the steps the
old ones held, so a six-step slide needed twelve clicks and the first six did nothing; steps that
stay released are now dropped and the rest laid out again.

The same arrival no longer leaves the slide scaled for the fallback: auto-fit's "only shrink within
a showing" now belongs to one layout element, so the library layout is measured afresh.
