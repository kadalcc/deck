---
"@kadal/deck": minor
"@kadal/deck-shell": minor
---

`kadal-deck import reveal <index.html | folder>` converts a reveal.js deck into a new Kadal deck
folder, beside `import slidev`. Sections become slides and a section of sections a vertical stack;
plain HTML becomes Markdown and the rest JSX; `class="fragment"` becomes `<Click>` with its style
as the effect and `data-fragment-index` as `at` (a list of fragments, `<Clicks>`);
`data-background-color`, `-image`, `-video`, `-gradient` and `-iframe` become background
frontmatter; `<aside class="notes">` becomes `<Notes>`; `data-auto-animate` becomes `autoAnimate`;
code blocks keep their language and `data-line-numbers` steps; `data-markdown` sections (inline or
a file) pass through, with `.slide` and `.element` comments read. Local images are copied into
public/, and `IMPORT-REPORT.md` lists what did not carry over before `check` runs. The converter is
`convertReveal` in `@kadal/deck/import`.

Rich text while editing on the slide: Cmd/Ctrl+B, I and K make the selection bold, italic or a
link (the address asked for in a field under the text), shown at once and saved into the source as
`**bold**`, `_italic_` and `[text](url)`; Cmd/Ctrl+Z takes the last one back. An editor opts in
with `{type:"edit", on:true, marks:true}` and spells `edited.marks` with `markdownWithMarks` from
`@kadal/deck/runtime`.
