---
"@kadal/theme-reveal": minor
"@kadal/deck": minor
---

`theme: reveal`, a new first-party theme: reveal.js's twelve themes in one, picked with
`themeConfig: { variant: moon }` — black (the default), white, league, beige, night, serif,
simple, solarized, moon, dracula, sky and blood. Their fonts, colours, heading case, weights and
shadows, type sizes and spacing come from reveal's own theme variables (MIT), in reveal's
960 × 700 box; every variant draws light and dark, and passes `kadal-deck contrast`.

`kadal-deck import reveal` now writes `theme: reveal` with the variant the page linked (it wrote
`minimal`), reveal's default `margin: 0.04`, its slide size as `themeConfig.width` / `height`,
and scales inline lengths by the factor reveal fits its slide with (×1.543 for 960 × 700, was ×2).
A slide's colour scheme follows its background colour or gradient in either deck scheme, a box
the author painted keeps legible text, and a dark first slide no longer turns black-on-navy when
the deck is shown light.
