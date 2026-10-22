---
"@kadal/deck": patch
---

The phone remote now works for a deck built with `kadal-deck build` and served from any static host (GitHub Pages, Netlify, S3, a plain file server): run `kadal-deck relay` (add `--tunnel` for a `wss://` address) and point the deck at it with `remote: { relay: "wss://…" }` or `?relay=` on the presenter view's address. Pairing is the same rotating QR code as `kadal-deck dev`, and the presenter view asks once for the relay's password.
