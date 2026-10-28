---
"@kadal/deck": patch
---

CI now runs `tools/narration-check.mjs`, and `tools/remote-check.mjs` both through `kadal-deck dev`'s relay and for a static build through `kadal-deck relay`, on every pull request. They're separate jobs and not required checks, so a red one is a reason to look rather than a merge block. They used to run only by hand, which is how the narration check went stale. The narration check's "play advances clicks, then the slide" step records every position in the page instead of polling from outside. At the check's brisk narration rate a click step could be over between two polls, and the step then waited out its timeout.
