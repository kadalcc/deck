---
"@kadal/deck": patch
"@kadal/deck-shell": patch
---

The builder's preview no longer replays the slide's entrance on every recompile. Each compile mounts a new runtime, which landed on the hash's slide and then moved to the editor's `at` — a move, so the slide slid in again on every keystroke and every tweak. A recompile now opens on the slide being edited as a cut (`<Deck startAt>`), and the slide (and background) a deck mounts on cuts in, at #/5 too. Moving to another slide keeps its transition.
