---
"@kadal/deck": minor
---

Commands: everything a person can do to a running deck is now a command in one registry —
`deck.commands` (and `window.__deck.commands`), with stable ids (`nav.next`, `present.blackout`,
`draw.shape`, `deck.slide` …), descriptions, and zod parameters exported as JSON Schema. The
keyboard runs through it, so a phone remote or an AI agent can do exactly what the keys and
buttons do. New commands aim the laser (`present.laserAt`), drive the pen from a touchpad
(`draw.pen`), mark a region (`draw.shape`: circle, box, underline, arrow), zoom to a point, and
read the deck (`deck.state`, `deck.outline`, `deck.slide`, `deck.search`). The manifest now
carries each slide's speaker notes as plain text (`notesText`). `useCommand` registers your own.
