---
"@kadal/deck": minor
---

reveal.js HTML pasted into a slide keeps its meaning. The layout classes `r-stack`, `r-stretch`, `r-frame`, `r-hstack` and `r-vstack` (with reveal's `items-*` / `justify-*` modifiers) work as plain classes, and `r-fit-text` hands its text to `<FitText>`. `class="fragment"` on any HTML element compiles to a `<Click>` of that element, its fragment style the effect and `data-fragment-index` ordered as reveal.js orders fragments. New `<HStack>` and `<VStack>`: a centred flex row or column, with `gap`, `align` and `justify`.
