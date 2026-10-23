---
"@kadal/deck": patch
"@kadal/prettier-plugin": patch
---

A Comark block's YAML props (`---` lines straight after `::card`) no longer cut the slide in two. The splitter, and the Prettier plugin's copy of it, skip `---` inside a Comark block that is closed; a block left open still ends at the next separator.
