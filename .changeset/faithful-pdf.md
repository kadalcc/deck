---
"@kadal/deck": patch
---

`kadal-deck export` makes a PDF that looks like the deck in every viewer. The browser's printer turned CSS effects into PDF features that viewers draw differently: Glass cards came out filled with their edge gradient, Preview and Quick Look painted grey slabs wherever a blurred shadow fell, and gradient text picked up hairlines. Now each page is a picture of the slide with its text hidden, with the text printed over it as text, so it stays sharp at any zoom and can still be selected and searched. The PDF is also about a third of the size. `--vector-pdf` prints with the browser alone, as before.
