---
"@kadal/deck": patch
---

The phone remote's laser goes off when the finger lifts (or the air pointer's button is let go), even
when that moment's "off" is lost on the wire. It was sent once, without waiting for an answer, so a
socket blip at the lift (iOS suspends a page's sockets for Control Center or a screen recording)
left the dot on the presenter view and the projector until the phone disconnected for good. The off
is now owed until the presenting window answers it: tried again while the link stays open and each
time it opens again. A phone that pairs (or takes over from another) also clears a laser the
previous one left on.
