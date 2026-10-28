---
"@kadal/deck": minor
---

`center` works: `center: true` centres the default layout's content vertically, as reveal.js does. Kadal's default is now `center: false`, which is how every deck already looked (the old `true` default was never read). `kadal-deck import reveal` writes `center: true` unless the reveal deck turned it off.
