---
"@kadal/deck": minor
---

The `keyboard` map reads reveal.js's form: numeric keyCodes (`13`, `79`) as the keys they name
(`Enter`, `KeyO`), reveal's method names (`toggleOverview`, `togglePause`, `toggleHelp`,
`toggleAutoSlide`, `navigateNext`…) as Kadal's actions, a dotted command id, and a function from
deck.config.ts. A name it cannot read leaves the key alone instead of binding it to nothing.
`kadal-deck import reveal` carries a reveal deck's `keyboard` map over in Kadal's names (it was
dropped) and reports the bindings it cannot keep.
