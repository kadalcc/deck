---
"@kadal/deck": minor
---

The audience page (`/join`) is redesigned to match Kadal Deck's own look, phone first. Its controls
now use the product's palette, type, radii and focus rings in light and dark (the slide inside
keeps the deck's theme), with the tabs in a bottom bar under the thumb, 44px targets and safe-area
insets; on a tablet the panel sits beside the slide.

- A header that says who and where: the deck, a live / waiting / reconnecting / offline / ended
  status, how many are here, and a banner when the room needs explaining.
- Reactions pop where you tap and shake (instead of silently dropping) past the room's limit.
- Polls show results once you have voted or the poll closes, mark your choice and say how to
  change it; closed polls keep their final results under "Earlier". Rating polls show an average,
  word clouds how many words you have left.
- Quizzes have lettered answers, a countdown bar, "locked in", and a clear correct / not this time
  with the right answer and the top of the leaderboard. Your answer now survives the reveal.
- Ask shows which questions are yours, which are answered and on which slide; Mine lists your
  bookmarks and your questions.
- A one-time welcome asks for an optional name for the leaderboard; toasts confirm what you did
  and tell you when a poll opens while you are on another tab.
- Full screen has a slide counter, arrows in landscape and a hint to turn the phone.

Nothing changes on the wire: the page sends exactly the messages it did.
