---
"@kadal/deck": patch
---

A clearer autoplay (narration) bar.

- The timeline marks chapters, not every slide: a point at each `layout: section` slide (or at each column when a deck has no sections). Points fill in as the talk passes them, and the current one stands out. Hovering a point names the chapter, its slides and when it starts. Hovering anywhere else names the slide and its time. A click plays from there. From the keyboard, the arrow keys move a slide, Page Up/Down (or Shift+arrows) a chapter, and Home/End go to the ends.
- Speed, voice and engine are the engine's own lists instead of the browser's selects, so they match every theme in light and dark. Voices are grouped (Kokoro, this browser), each option says what it is, and an engine that isn't installed shows as unavailable. They work with the keyboard: arrows, Home/End, typing to find, Enter, Escape.
- A slimmer volume slider and evenly sized controls: playback and position on the left, settings on the right. Labels fold away on narrower screens, and on a phone the bar fits in two rows.
- The phone remote's "Pointer" setting uses the same list, sized for a thumb.
