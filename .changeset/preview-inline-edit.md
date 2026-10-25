---
"@kadal/deck": patch
"@kadal/deck-shell": patch
---

Editing in place in an editor's preview. The preview bridge (`@kadal/deck/runtime`) gains `{type:"edit", on}`: while it is on, the shell outlines the element under the pointer, reports a click as `located` (file, line, column and offset in the source the editor sent), and lets a double-click retype a heading, paragraph, list item or table cell whose text is one plain run of the source. Enter or leaving the element posts `edited` (file, `from`–`to` UTF-16 offsets, `before`, `after`); Esc puts it back. The shell never changes the deck: the editor applies the edit and sends the source again. Offsets are into each file exactly as sent — headmatter, frontmatter, CRLF line ends and included `pages/*.mdx` files included — and an element whose text cannot be mapped exactly says "Edit in source" instead. `ready` now carries `features: ["edit"]`, so an editor offers this only to shells that have it. Only `?preview` compiles tag elements with their positions (`compileDeck({ editable: true })`); published decks are unchanged.
