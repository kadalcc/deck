---
"@kadal/deck": patch
---

`kadal-deck thumbnail --all` (and the picture `publish` takes) no longer waits forever when the host
never answers a premium picture: that request now gives up after a minute, and the local server
stops waiting on what's still in flight after 5 seconds.
