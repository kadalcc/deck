---
"@kadal/deck": patch
---

`kadal-deck login --workspace <handle>` opens the approval page with that workspace chosen, and
refuses (rather than saves) a token approved for any other workspace, saying which token to revoke.
