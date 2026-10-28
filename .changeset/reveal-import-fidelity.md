---
"@kadal/deck": minor
"@kadal/theme-reveal": patch
---

`kadal-deck import reveal` keeps more of a reveal.js deck:

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
