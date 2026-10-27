---
"@kadal/deck": patch
---

- A print or export with a page per step draws a click-aware background at that page's step, not
  step 0 (a frontmatter `background:`; an in-slide `<Background>` already did).
- `kadal-deck check` accepts a `pro/` layout's own keys when the layout comes from the
  headmatter's `defaults.layout`, as it already did for a slide's own `layout:`.
