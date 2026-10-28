---
"@kadal/deck": patch
---

Enter in the overview goes to the ringed slide again. Enter has no key binding of its own, so the
keyboard handler returned on it as an unbound key before it reached the overview's branch, and the
overview stayed open. A tile focused with Tab still takes its own Enter.
