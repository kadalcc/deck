---
"@kadal/deck": minor
---

Export, in depth.

- **Editable PowerPoint**: `kadal-deck export --format pptx-editable` rebuilds every slide as native PowerPoint objects — text boxes with their fonts, sizes, colours, bold/italic/underline/strike and links; lists with real bullets, numbering and levels; rectangles, rounded rectangles and ellipses with fill, border and shadow; pictures as the original files (cropped as the slide crops them); tables as tables; code as coloured monospace text. Whatever PowerPoint cannot draw (SVG, canvas, maths, diagrams, gradients, filters, decorations) is placed as a picture exactly where it stood, so nothing is lost. Speaker notes are attached.
- **Markdown**: `--format md` writes a `.md` file with a picture of every page and each slide's notes under it.
- **PDF bookmarks and metadata**: the PDF now opens with an outline built from the slide titles (vertical stacks and `level`s nested; `--no-with-toc` turns it off) and carries the deck's title, author and description.
- **Flags on every format**: `--format`, `--range 1,3-5`, `--dark` / `--scheme`, `--with-clicks` / `--no-with-clicks`, `--omit-background` (transparent pages), `--per-slide`, `--timeout`, `--wait`, `--wait-until`, `--executable-path`, `--output`, `--port`. Slidev's spelling (`--with-clicks false`) works too.
- **The browser exporter at `/export`**: every deck, hosted ones included, can be saved as a PDF (the browser's print), a zip of PNGs, an image PowerPoint file or Markdown, with a live preview, a range, click steps, colour scheme, notes, picture size, a transparent background, progress and Cancel — no Playwright needed.
- **A Download button**: `download: true` in the headmatter shows one beside the theme menu and makes `kadal-deck build` print `dist/deck.pdf` for it (`kadal-deck build --download` does it without the key); without a built PDF it opens `/export`. `download: "talk.pdf"` links a file of your own. Hosts can switch it off or point it elsewhere through `window.__KADAL_DECK__.download`.
- The print view takes `?range=`, `?clicks=`, `?notes=` and `?omit-background`, and any page `?scheme=light|dark`.
- `pptxgenjs` is now a regular dependency (it was an optional peer), so PowerPoint export works out of the box; `pdf-lib` joins it for the PDF outline.
- Fixed: the theme menu (and anything else in the corner) could not be clicked in the play view, because the confetti layer and the pause curtain took the clicks.
