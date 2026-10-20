# The live room

A deck becomes interactive when it has a room: the audience opens the join page on their phones
(no app), follows the presenter's slide, reacts, asks, votes and plays quizzes.

## Turning it on

- `npx kadal-deck publish` puts the deck on deck.kadal.cc with a room (the user signs in once
  with `npx kadal-deck login`). The URL it prints is the deck; `<url>join` is the audience page,
  `<url>presenter` the presenter view (passcode-gated on the host).
- Self-hosted: run a room server against `@kadal/deck/protocol` and set `live.api` in
  `deck.config.ts`. While developing, `KADAL_DECK_API=http://localhost:8797 npm run dev` proxies
  `/api` to such a host.
- Without a room (a local or static build) the live components render as placeholders; the deck
  still works.

## Components

| component | use |
| --- | --- |
| `<QrJoin />` | QR code + short link to the join page — put it on the title or second slide |
| `<Presence />` | how many are following |
| `<Poll id question options kind />` | `kind`: `choice` (default), `multi`, `rating` (with `scale`), `words` |
| `<WordCloud id question />` | one- or two-word answers, growing as they repeat |
| `<Quiz id question options correct seconds />` | timed; `correct` is the 0-based index; points for speed |
| `<Leaderboard top />` | quiz standings |
| `<Questions limit />` | audience questions, most upvoted first |
| `<Reactions />` | a reaction bar on the slide (the phone page always has one) |
| `<Pace />` | the room's slower/faster gauge |

Rules: every `Poll`, `Quiz` and `WordCloud` needs an `id` that is **unique in the deck** (results
are stored by it; `kadal-deck check` flags duplicates). Keep options short — they are buttons on
a phone. The presenter opens and closes polls from the presenter view; `liveResults={false}`
hides results until the poll closes.

## How following works

Viewers start in step with the presenter. Any move of their own (key, swipe, overview) stops
following, and a pill offers to follow again. The presenter's drawings, confetti and shared term
cards reach every screen; the laser and spotlight do not.

## Phone remote

The presenter view's **Phone remote** button shows a QR. The phone that scans it opens
`/<slug>/remote` and drives that window: next/back, blackout, focus labels, a slide list, pen,
zoom, a laser aimed by touching a live copy of the slide or by holding a button and moving the
phone, the notes for the current step, the timer with pacing, and time-warning buzzes. Every
button runs a command (`nav.next`, `present.laserAt`, `draw.pen` …) in the presenting window, so a
remote can do what the keyboard can and nothing else.

- The deck's `main.tsx` passes `remote: RemotePage` from `@kadal/deck/remote` in `<Deck pages>`.
- One phone at a time. The QR holds a pairing code that works once and changes every 30 seconds
  while the dialog is open (each code works for a minute). The newest phone to scan becomes the
  remote and any other is disconnected and told so. A paired phone keeps a lease for its tab, so a
  reload or a dropped connection reconnects without a new scan, until another phone takes over.
- Hosted deck: the QR is `remote#pair=CODE`. The code travels in the URL fragment, so it never
  reaches a server log, and it is not the presenter's ticket. The room relays the phone's commands
  to the presenter windows only, and a phone can send nothing else.
- `kadal-deck dev`: the dev server relays it with a 6-character code (`remote?pair=CODE`). Run
  `kadal-deck dev --host` so the phone can reach the computer on the same Wi-Fi. Add `--https`
  (a self-signed certificate) for the air pointer, because motion sensors need a secure page. On
  plain http the phone points by touch instead.
- On an iPhone the air pointer first asks for one tap to allow motion (iOS only asks from a tap);
  after that the button is a hold.
- **Disconnect** in the dialog drops the phone, even one that is offline right now, voids its lease
  and changes the code.

## A good interactive talk

- Open with `<QrJoin />` and a warm-up poll so people join early.
- One interaction every 8–10 minutes; more becomes a quiz show.
- Put the poll on its own slide, with the question as the heading, and talk through the results.
- End with `<Questions />` for Q&A instead of asking "any questions?".
