---
"@kadal/deck": minor
---

reveal.js's events and postMessage API. `deck.events.on(name, fn)` (and `on("*")`) hears `ready`,
`slidechanged`, `slidetransitionend`, `fragmentshown`/`hidden`, `overviewshown`/`hidden`,
`paused`/`resumed`, `autoslidepaused`/`resumed`, `resize` and slide states, with reveal's fields;
each also fires as a `deck:<name>` event on the deck's root. A page that frames the deck can drive it
with reveal's `{ method, args }` messages and gets reveal's callbacks, or run any command with
Kadal's `{ kadal: 1, type: "command" }`; `postMessageEvents: true` sends every event to it as
reveal's `{ namespace: "reveal", eventName, state }`. `postMessage: false` turns the calls off.
