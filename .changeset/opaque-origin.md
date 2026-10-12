---
"@kadal/deck": minor
---

Run safely in an opaque origin. A host may serve a deck with `Content-Security-Policy: sandbox`
(no `allow-same-origin`) so the deck can't act as the visitor on the host's own origin; the
engine now works there:

- Storage (`localStorage`, `sessionStorage`) degrades to memory for the page instead of failing,
  and the anonymous viewer id stays the same for the page's beacons and reconnects.
- The deck's windows (play, presenter view, share window) stay in step over a window bus:
  BroadcastChannel where it reaches, plus `postMessage` between a window and the windows it
  opened. A presenter view ignores navigation from the page that opened it.
- Presenters prove themselves with a ticket the host issues, kept in memory: from the URL
  fragment (`#ticket=…`, wiped on arrival), from `window.__KADAL_DECK__.ticket`, or from the
  passcode form's answer. It rides on the room WebSocket (`?ticket=`) and on presenter calls
  (`x-deck-ticket`); the passcode form no longer reloads the page.
- Host calls no longer send `credentials: "include"`; beacons go as `text/plain`.
- A host can name a viewer-verification page (`window.__KADAL_DECK__.verify`) for Turnstile,
  which can't run inside an opaque origin.
