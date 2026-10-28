---
"@kadal/deck": patch
---

`kadal-deck build --json` and `dev --json` work. Both handed `--json` on to Vite, which stops at an
option it does not know (`CACError: Unknown option --json`), so `build --json` always failed. Now
`build --json` prints one object on stdout, `{ ok, builds: [{ entry, outDir, base, title }] }`,
with Vite's output on stderr, and `dev --json` keeps stdout for `{ ok: true }` when the server stops.
