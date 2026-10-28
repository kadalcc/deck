---
"@kadal/deck": patch
---

`kadal-deck import reveal`: a code block with a line-number offset (`[712: 1-2]`, or `data-ln-start-from`) lights the same lines it did in reveal. reveal counts its steps from the top of the block, Kadal's name the numbers shown, so the importer now moves them by the offset (`{712-713}{lines:true,startLine:712}`) instead of lighting lines 1–2, which the block does not have.
