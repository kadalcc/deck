---
"@kadal/deck": patch
---

Fixes found while rebuilding the showcase: custom-element and React islands work in production
builds; `layout: name` resolves a deck's own layouts; `transition: zoom-in fade-out` animates both
halves; a slide's `autoSlide` works without a deck-wide one (and `A` works anywhere); print and
export give one page per click step; `<Notes>` and magic-move examples inside code stay code;
`<Clicks every>` groups within each list; `colorScheme` slides paint their scheme's background;
autoFit ignores `<Background>`, `<Absolute>` and `<Arrow>`; the starfield no longer freezes;
magic move uses the code font and honours `{lines: true}`; Typewriter and Encrypted print
finished; renamed lucide icons resolve; icons stay inline under Tailwind; offline polls say
"offline".
