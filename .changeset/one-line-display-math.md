---
"@kadal/deck": patch
---

`$$x$$` written on one line is display maths, as it is in reveal.js (MathJax and KaTeX), GitHub and
Pandoc. remark-math read it as inline maths, so an equation brought over from a reveal.js deck came
out at text size, its fraction squeezed. A `$$…$$` paragraph is now a display block, the same as
`$$` on lines of their own, and one inside a sentence renders in display mode, as `\[…\]` already
did.
