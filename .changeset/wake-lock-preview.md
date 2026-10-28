---
"@kadal/deck": patch
---

A deck in a frame that may not keep the screen awake no longer asks to. The builder's `?preview`
iframe (and any embed without `allow="screen-wake-lock"`) logged "Permissions policy violation:
screen-wake-lock is not allowed in this document" on every load, which no `catch` silences. The
deck now checks the document's permissions policy first; a top-level window keeps its wake lock.
