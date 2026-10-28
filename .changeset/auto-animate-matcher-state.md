---
"@kadal/deck": minor
---

Auto-animate takes reveal.js's custom matcher and sets its state attributes:

- **`autoAnimateMatcher(fromSlide, toSlide)`** in deck.config.ts returns the pairs to morph,
  `[{ from, to }]`, in place of matching by `data-id` and text. As in reveal.js it replaces the
  built-in matching, and the arriving slide's other elements fade in as unmatched.
- **State attributes for CSS.** Both slides get `data-auto-animate="pending"` while the morph is
  set up, and the arriving one gets `"running"` once it starts. Each element taking part gets
  `data-auto-animate-target`: a number for a matched one, `unmatched` for one fading in. They are
  cleared at the next slide change.
