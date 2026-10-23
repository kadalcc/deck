---
"@kadal/deck": patch
---

`kadal-deck screenshot` and the MCP server's `slide_render` no longer leave a 1px grey line along an edge of each picture. The print view's 16px gaps and page shadow landed a fraction of a pixel inside the picture at most widths (1280, the default, included); the pages are now butted together at the left edge while the pictures are taken.
