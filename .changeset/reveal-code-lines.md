---
"@kadal/deck": minor
---

`lineNumbers: true` in the headmatter numbers every code block, magic moves and Monaco editors included; a block's own `{lines:false}` opts it out. It was declared but did nothing. reveal.js's bracket highlight form, ```` ```js [1-2|3] ```` and ```` [712: 1-2|3] ````, now reads as highlight steps and a line-number offset instead of a title bar; `kadal-deck check` points at the brace form. Like reveal.js, the steps in the bracket form and in `data-line-numbers` with `data-ln-start-from` count from the block's first line.
