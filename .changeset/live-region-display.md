---
"@kadal/deck": patch
---

The screen-reader live region reads a slide even where `getComputedStyle` reports no `display` (a stubbed or partial one), instead of throwing.
