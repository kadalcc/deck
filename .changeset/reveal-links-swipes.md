---
"@kadal/deck": minor
---

reveal.js's links and swipes. `data-preview-link="false"` opts a link out of the lightbox again:
it used to be caught by the lightbox and opened a frame whose address was the word "false". An
element with `navigate-left`, `-right`, `-up`, `-down`, `-prev` or `-next` moves the deck and
carries `enabled` while that way leads somewhere. A touch that starts inside `data-prevent-swipe`
(or on media controls) no longer turns the page, and `rtl` mirrors the horizontal swipes.
