---
"@kadal/deck": patch
---

`kadal-deck thumbnail --all` holds each deck to three minutes and moves on, reporting the one that
took too long, and the renderer no longer waits on a browser that died while starting. A run over a
whole workspace had stalled on a late deck while every deck alone took seconds.
