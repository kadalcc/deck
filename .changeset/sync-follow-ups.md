---
"@kadal/deck": patch
---

Quick edit and sync fixes from end-to-end testing:

- A deck's editing kit now carries the files its `<<<` snippet imports read (`<<< @/snippets/tide.ts#model`), so the web builder shows them and a deck published from the builder no longer loses them. A snippet the last CLI build did not read says so plainly, as an unknown import does.
- `mergeMdx` pairs a slide with the base slide in the same place when its neighbours line up, so a short slide edited on both sides (`# Hi` to `# Hello` and to `# Hey`) is a conflict instead of two slides. A slide added on both sides at the same place still keeps both.
- `kadal-deck pull` (and the MCP `deck_pull`) downloads the library media a quick edit added (`assets/media/<hash>.<ext>`, a sticker or an image picked in the builder) into the project's `public/assets/media/`, checked against its hash, so `kadal-deck dev` shows it and the next publish carries it. What the host does not have is a note, never a failed pull.
