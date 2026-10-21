---
"@kadal/deck": patch
---

`export.thumbnail` no longer hangs when the page is in a background tab or a hidden window. It used to wait for the browser to draw a frame, and a hidden page draws none, so publishing from a tab you had just left saved no picture. Every later picture in that visit also queued behind the stuck one. Now a picture goes ahead without waiting for a frame. If one still takes more than 30 seconds, it fails and the next one runs.
