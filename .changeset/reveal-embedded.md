---
"@kadal/deck": minor
---

`embedded` (and `?embedded`) and `keyboardCondition`, as reveal.js has them. An embedded deck fits
its own element instead of the window and follows it as it resizes, takes keys only while it has
focus (a press inside it, or tabbing in; it then carries `.focused`), listens for swipes and clicks
on itself alone, goes fullscreen as itself, and leaves the page's hash, title, head and colour
scheme alone unless `hash` is set outright, so several decks can share one page.
`keyboardCondition: "focused"`, or a function of the key from deck.config.ts, gates the keys of any
deck.
