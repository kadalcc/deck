---
"@kadal/deck": patch
---

The audience page tells the truth about questions, and its poll toast no longer covers the poll:

- **"Question sent" only when the room took it.** The room takes one question per viewer every
  five seconds and dropped the rest without a word, while the page said "Question sent" anyway.
  A second question within five seconds now gets "Too fast. Try again in a few seconds." and
  stays in the box. Each ask carries a `ref`; a room that acknowledges (`qa:ack`) settles it, with
  the wait when it refuses. From a room that sends no ack, the question coming back in the room's
  list confirms it, and one that never does is reported as not arrived after eight seconds.
- **The new-poll toast.** "A poll just opened · Vote" stayed up after the viewer reached Polls by
  the tab bar, over the poll's last option on a phone. It now goes once the viewer is on Polls,
  and while any toast shows, the panel's end scrolls clear of it.
