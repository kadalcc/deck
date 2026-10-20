---
"@kadal/deck": patch
---

Phone remote: one phone at a time, paired by a code that keeps changing, and the air pointer on iPhone.

- The QR holds a one-time pairing code, not the presenter's ticket. It changes every 30 seconds while the dialog is open (each code works for a minute), so a photo of the screen is soon worthless.
- The newest phone to scan becomes the remote; any other is disconnected and says "Another phone took over as the remote." A paired phone keeps a lease for its tab, so a reload or a dropped connection reconnects without scanning again.
- Disconnect drops the phone even while it is offline, voids its lease and changes the code.
- iPhone: the air pointer asks for motion with a tap ("Tap to allow motion · then hold to point"). iOS only shows its prompt from a tap; asked on the press that starts a hold, it refused without asking ("Motion access was not allowed").
- Rooms need the matching server (deck.kadal.cc has it). Against an older room the QR falls back to the presenter ticket.
