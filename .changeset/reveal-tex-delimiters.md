---
"@kadal/deck": minor
---

LaTeX's maths delimiters, as reveal.js's KaTeX plugin reads them: `\(a^2\)` inline and `\[ … \]` display, beside the dollars. A `\[ … \]` that is a paragraph of its own is a display block exactly as `$$ … $$` is. Write `\\(` for a literal `\(`; code is never read.
