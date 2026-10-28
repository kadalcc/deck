---
"@kadal/deck": patch
"@kadal/theme-bricks": patch
"@kadal/theme-classic": patch
"@kadal/theme-seriph": patch
"@kadal/theme-shibainu": patch
---

A fresh deck passes its own `kadal-deck contrast` in light and dark. Code a deck highlights without
naming a Shiki pair now wears GitHub's high-contrast pair (`github-light-high-contrast` /
`github-dark-high-contrast`) instead of `github-light` / `github-dark`, whose orange and red
measured 2.9–4.4:1 on the code panels and the stepped-line band (the starter's slide 5). Every
token of the new pair clears 4.5:1 on every built-in theme's panel and band, which a test now
holds. Over such a deck, bricks keeps its light code colours and shibainu its dark ones when the
scheme is toggled (their panels do not change), and the code title in classic, seriph and stack is
dark enough to read on the panel. A deck or theme that names its own `shiki` pair is unchanged.
