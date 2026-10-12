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

## A good interactive talk

- Open with `<QrJoin />` and a warm-up poll so people join early.
- One interaction every 8–10 minutes; more becomes a quiz show.
- Put the poll on its own slide, with the question as the heading, and talk through the results.
- End with `<Questions />` for Q&A instead of asking "any questions?".
