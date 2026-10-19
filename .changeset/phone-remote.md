---
"@kadal/deck": minor
---

Phone remote: the presenter view's new **Phone remote** button shows a QR, and the phone that
scans it becomes a one-handed remote at `/<slug>/remote` (`RemotePage` from
`@kadal/deck/remote`; add `remote: RemotePage` to `<Deck pages>`). It shows a live copy of the
current slide, rendered by the deck's own components. Touch the slide to aim the laser or the
spotlight, draw on it with the pen, or tap to zoom. Hold the air-pointer button and move the
phone to point (DeviceOrientation with iOS's permission prompt, or a Gyroscope where there is one,
smoothed by a One Euro filter). It also has next and back (or a swipe), blackout, focus labels, a
slide list, the notes for the current click step, the timer with pacing, buzzes at chosen
minutes, haptic ticks and a screen wake lock. Everything it does runs as a command in the
presenting window.

With a room, the phone is a presenter socket holding the ticket from the QR's fragment. The
protocol gains `command`, `command:result`, `remote:state`, `remote:kick` and `remote:bye`, plus
validators. Without a room, `kadal-deck dev` relays it over the dev server's HMR socket with a
pairing code. `kadal-deck dev --https` serves a self-signed certificate so phones get motion
sensors. In the presenter view without a room, the laser now shows on the current slide, and the
remote's laser, ink and zoom reach the play window.
