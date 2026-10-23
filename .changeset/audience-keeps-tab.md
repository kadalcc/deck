---
"@kadal/deck": patch
---

The audience page (`/join`) keeps the tab the viewer was on and the question they had not sent yet when the page reloads, as a phone often does when it wakes and reconnects. It used to come back on Pace with the draft gone. Both are kept in session storage for that browser tab only.
