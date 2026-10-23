---
"@kadal/deck": patch
---

`kadal-deck publish` prints the full address of the published deck. A host that answers with only a path (`/@ana/talk/`) got that path printed on its own; it is now resolved against https://decks.kadal.cc for the default host, or against the host's own origin for a self-hosted one.
