---
"@kadal/deck": minor
---

Printed pages and the presenter view carry the slide number the way reveal.js's `showSlideNumber` says: `all` (the default) and `print` number every printed page, so `kadal-deck export` PDFs are numbered, and `speaker` shows the number only in the presenter view's header. `pdfMaxPagesPerSlide` works: a slide taller than a page runs onto up to that many pages, broken where the page ends, and the PDF's bookmarks still point at each slide's first page.
