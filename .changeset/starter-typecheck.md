---
"@kadal/create-deck": patch
"@kadal/deck": patch
---

`npm run typecheck` passes in a new deck. The starter's `vite.config.ts` read `process.env`, which needs `@types/node`, and a fresh scaffold does not have it; it now reads the environment through Vite's `loadEnv(mode, false, "")`.
