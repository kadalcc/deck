---
"@kadal/deck": patch
---

`tools/browser-check.mjs` (the scaffolded deck in a browser, after the smoke test) no longer takes the fixed ports 5399 and 5398: the dev server and the served `dist/` each ask the system for a free port, and `--port <n>` picks the dev server's. A machine with something already on 5399 used to fail the check.
