---
"@kadal/deck": patch
---

A deck's picture on the host now looks like its first slide as people see it. `kadal-deck publish`
used to photograph slide 1 in light only and without the host's Pro library, so a deck with a
`pro/` background showed the free fallback, and a dark visitor's slide looked nothing like it.
The picture is now taken with the Pro library fetched through the host for the deck's workspace
(a Free deck still gets the fallback, as it does live), in the deck's own `colorScheme` — and, for a
deck that follows the viewer, in both light and dark (sent as `&scheme=dark`, then `&scheme=light`;
a host that predates schemes keeps the light one). It
waits for `pro/` items and the network to settle, and lays out slide 1 alone.

New: `kadal-deck thumbnail [--slug s | --all] [--out dir]` takes the picture again for the version
that is live, reading the build from the host, without publishing. `export.thumbnail` takes a
`scheme` (an `auto` deck pictured in it without flipping the screen) and answers with `scheme` and
`auto`; the print view (export, screenshots) waits for `pro/` items before it says it is ready.
