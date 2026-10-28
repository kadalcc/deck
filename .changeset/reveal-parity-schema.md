---
"@kadal/deck": minor
---

reveal.js's remaining options are deck options of the same names, so a deck or an imported
reveal.js page can set them without an unknown-key warning: `preloadIframes`,
`respondToHashChanges`, `keyboardCondition` (`"focused"`, or a function in deck.config.ts),
`autoSlide: false`, `autoSlideMethod`, `autoAnimateStyles`, `autoAnimateMatcher` (deck.config.ts),
`scrollLayout` (`"compact"`, today's scroll page, or `"full"`, reveal's), the four
`parallaxBackground*` keys, `disableLayout`, `postMessage`, `postMessageEvents` and
`focusBodyOnPageVisibilityChange`; `slideNumber` takes a function in deck.config.ts. A slide sets
its own `autoAnimateEasing`, `autoAnimateDuration` and `autoAnimateUnmatched`. They are in the
catalog, the frontmatter schema and REFERENCE.md, and `kadal-deck import reveal` keeps them.
