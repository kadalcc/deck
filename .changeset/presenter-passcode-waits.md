---
"@kadal/deck": patch
---

A presenter view opened without its passcode, on a host that needs one, no longer knocks on the room every 15 seconds for as long as it stays open, with a console error each time. Until the passcode is given, the room waits: no socket is opened and nothing is retried. The page now leads with **Presenter passcode required**. Once the passcode is accepted, the room connects at once. A presenter room that keeps failing to open asks the host again whether this window may present (a ticket that ran out), and brings the passcode form back if it may not.

`RoomClient.hold(on)` is what the presenter view uses for this: while held, the client opens no socket and schedules no retry, and releasing it connects straight away.
