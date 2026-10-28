# @kadal/theme-reveal

## 0.11.0

### Minor Changes

- 3c8ffc0: `theme: reveal`, a new first-party theme: reveal.js's twelve themes in one, picked with
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

### Patch Changes

- 6758296: Code in the light scheme is legible: the panel is reveal's monokai in both schemes, so its Shiki colours now stay the dark ones (as theme-neon's do) instead of drawing light-theme tokens at 1–2:1 on a dark panel.
- 991c745: `kadal-deck import reveal` keeps more of a reveal.js deck:

  - reveal's layout helpers become components: `r-stretch` a `<Stretch>`, `r-fit-text` a
    `<FitText>` sized as reveal sizes it, a bare `r-stack` a `<Stack>`; `r-frame`, `r-hstack` and
    `r-vstack` stay classes.
  - `center: true` is written unless the page turned it off (reveal centres every slide).
  - `<!-- .element: -->` keeps every attribute (style, data-id, id, classes), set on the element
    before the comment as reveal's Markdown plugin does: the heading, paragraph or image, or the
    link, bold or code the line ends with.
  - `data-src` stays `data-src`, for the engine to load near the slide.
  - A slide's own `data-auto-animate-duration`, `-easing` and `-unmatched` are kept as its
    frontmatter.
  - A list item that is a fragment is a `<Click as="li">`, hidden bullet and all; a picture's
    `width` and `height` scale with the slide like its styles.

  The reveal theme paints the bars beside the stage in the theme's background and centres a
  picture that stands on its own, as reveal does.

- Updated dependencies [2bfc840]
- Updated dependencies [c80b6e9]
- Updated dependencies [4b1c4a9]
- Updated dependencies [47abf8c]
- Updated dependencies [0a91cd7]
- Updated dependencies [cbb8e02]
- Updated dependencies [1345856]
- Updated dependencies [b006d0a]
- Updated dependencies [bee0a2b]
- Updated dependencies [1d09dcd]
- Updated dependencies [c3178e6]
- Updated dependencies [d6e20d1]
- Updated dependencies [7d4eb21]
- Updated dependencies [12a26b8]
- Updated dependencies [4df054b]
- Updated dependencies [ea1874d]
- Updated dependencies [62f9490]
- Updated dependencies [f0511d2]
- Updated dependencies [b1d3514]
- Updated dependencies [ccb1746]
- Updated dependencies [93eb028]
- Updated dependencies [d0a267f]
- Updated dependencies [687e177]
- Updated dependencies [e1b5781]
- Updated dependencies [7c4a4cb]
- Updated dependencies [fbff0ee]
- Updated dependencies [8761ede]
- Updated dependencies [331abf9]
- Updated dependencies [823592a]
- Updated dependencies [589e950]
- Updated dependencies [98d5256]
- Updated dependencies [5c320c9]
- Updated dependencies [991c745]
- Updated dependencies [4c4e5a3]
- Updated dependencies [b83cec8]
- Updated dependencies [3f9608d]
- Updated dependencies [66b47ee]
- Updated dependencies [5f0a022]
- Updated dependencies [ceb1f44]
- Updated dependencies [eb58a0e]
- Updated dependencies [b40515e]
- Updated dependencies [e0f9a5d]
- Updated dependencies [31583cc]
- Updated dependencies [3c8ffc0]
- Updated dependencies [bbd9547]
  - @kadal/deck@0.11.0
