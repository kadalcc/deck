---
"@kadal/deck": minor
---

`<Video hevc>`: a transparent clip's HEVC-with-alpha twin for Safari and every iOS browser. WebKit decodes a VP9 WebM's alpha as black, so a Kadal Store overlay (sparks, snow, screentone) showed as an opaque rectangle there; WebKit now plays `hevc` and every other browser keeps `src`. The Kadal Store adds `hevc` to its transparent clips by itself.
