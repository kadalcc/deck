---
"@kadal/deck": minor
---

`kadal-deck contrast` (and `kadal-deck check --contrast`): a legibility check for every text on
every slide, click step and colour scheme. Each print-view page is read twice in headless
Chromium — the text from the DOM (colour, opacity, size, weight), and a picture with every glyph
made transparent, so the background is measured as the audience sees it, over images, gradients,
canvas and WebGL backgrounds alike. The WCAG 2.x ratio is taken at the worst 10% of a grid of
samples under each line, so a caption crossing a bright patch fails. Normal text needs 4.5:1,
large text (24px, or 18.66px bold, on the 1920 × 1080 stage) 3:1; large text between 3 and 4.5 is
listed as a warning. Exits 1 on any failure.

`--scheme light|dark|both` (both), `--min`, `--min-large`, `--percentile`, `--range`,
`--no-clicks`, `--theme`, `--url` (a published deck), `--dev`, `--json`, and `--out <dir>` for a
picture of each failing page with the text outlined and its ratio. Purely decorative text opts out
with `data-contrast="ignore"` (aria-hidden text is measured: a chart's labels are often
aria-hidden); hidden or clipped text, the words a background draws (a marquee's texture) and the engine's own
dimmed parts (`.is-dim` code lines) are not. `SlideRenderer.withPrintView` opens the
print view for any such reader.
