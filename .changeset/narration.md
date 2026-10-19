---
"@kadal/deck": minor
---

Narration: rehearse with the deck reading its own notes. Each `[click]` part of a slide's
`<Notes>` is spoken at its step, then the deck turns the page with `nav.next` — through the
command registry, so the presenter window, a projector and the room follow. A bar at the bottom
of the presenter view (and on the deck behind `?narrate`, or the new `R` key) has prev / play /
next / stop, speed, mute and volume, voice and engine menus, "follow the narrator", and a
timeline with a mark per slide to seek. Every control is a `narrate.*` command.

Three voices behind one interface, picked per segment: baked clips from the new
`kadal-deck narrate` (Kokoro-82M on the CPU, MP3/Opus via ffmpeg or WAV, indexed by SHA-256 in
`public/narration.json`), Kokoro-82M in the browser in a Web Worker (WebGPU fp32 or WebAssembly
q8, downloaded on the first play and cached), and the browser's `speechSynthesis`. Kokoro needs
`kokoro-js`, a new optional peer dependency (`kadal-deck narrate --setup` installs it); without it
nothing of it is built. Config: `narration: { enabled, engine, voice, rate, gap, silent, model,
dtype }`; slide frontmatter `say:` and `narration: false`. Licences of the pieces it reaches for,
including eSpeak NG (GPL-3.0-or-later) inside the phonemizer, are in `THIRD_PARTY_NOTICES.md`.
