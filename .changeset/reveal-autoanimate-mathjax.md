---
"@kadal/deck": patch
---

reveal.js's `autoanimate` event: `deck.events` (and `deck:autoanimate` on the deck's root, and `postMessageEvents`) tells when an Auto-Animate morph starts, with `fromSlide`, `toSlide`, `indexh`, `indexv` and the morph's Web `animations` (Kadal's stand-in for reveal's `sheet`), on the stage and in the scroll view.

`kadal-deck import reveal` carries a MathJax deck's macros into KaTeX: MathJax 2's `TeX.Macros` (under `mathjax2` or `math`) and MathJax 3/4's `tex.macros`, a body or `[body, args]`, become `katex.macros`, as do the KaTeX plugin's own macros and plain KaTeX options. A macro with an optional argument, a declared argument count its body does not use, and MathJax's own settings are reported.
