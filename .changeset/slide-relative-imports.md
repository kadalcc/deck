---
"@kadal/deck": patch
---

A relative import inside a slide (`import data from "./data.ts"` in deck.mdx) resolves from the file the slide is written in: deck.mdx, or the file a `src:` include brings in. It used to fail the build with `UNRESOLVED_IMPORT`, because a slide is compiled as a virtual module with no folder of its own.
