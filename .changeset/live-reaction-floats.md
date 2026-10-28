---
"@kadal/deck": patch
---

Live room reactions:

- **One tap floats one emoji.** The reaction overlay on the presenter view and the play window
  floated `min(6, total)` emojis per message, so once six reactions had come in, every tap floated
  six. Each message now floats the step since the last total the window saw: one, or the gap after
  missed messages, never more than six.
- **The room state keeps the totals.** The live client dropped the running total each `react`
  message carries, so `state.reactions` (the `<Reactions>` bar's counts) moved only when the room
  sent a tally, and the room sends those to the presenter alone.
