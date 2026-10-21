---
"@kadal/deck": patch
---

The narration timeline only moves forward while it plays, and reaches the end when the talk ends. Before, it jumped back for a moment at every new slide and stopped short of 100%.

Every slide now has a small point on the timeline, and the chapter points stay. Hovering anywhere on the timeline shows a small picture of the slide.

On the phone remote, the slide preview no longer picks up the remote's own dark styles, so code blocks and poll options look as they do on the big screen. In pen mode, Undo and Clear take the place of the "Hold to point" button, so the notes are no longer squeezed.

New `export.thumbnail` command: it returns a PNG of one slide. `kadal-deck publish` now sends the host a picture of slide 1 after it publishes; use `--no-thumbnail` to skip it. A picture that can't be made never fails the publish.

`check` and the builder now warn when a slide starts with settings such as `background: spotlight` but has no closing `---`. Without it, those lines show on the slide as text.
