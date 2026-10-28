---
"@kadal/deck": patch
---

The pace badge ("+2m"), the presenter sidebar's schedule line, the teleprompter's pace and the phone
remote's now work for a deck timed slide by slide with `timing:` and no `defaultTiming`. The timer
already took its length and progress bar from those timings, but the pace needed `defaultTiming`, so
it never showed. A slide without a `timing:` plans no time.
