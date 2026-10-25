---
"@kadal/deck": minor
"@kadal/deck-shell": minor
---

Eight backgrounds are removed: the six sign-language ones (`signer`, `variants`, `handshapes`, `trails`, `window`, `embedding`) and the map backgrounds `lattice` and `track`. Each was drawn for one talk and is too particular for the engine. The other 28 built-in backgrounds are unchanged.

If your deck uses one, copy it into your deck: take its source from https://deck.kadal.cc/docs/backgrounds/#removed-in-06, put it in `src/components.tsx` (or a file beside it) and register it under the same name with `registerBackground("signer", Signer)` from `@kadal/deck`. The slide then looks exactly as before. Until you do, a published deck shows the theme's own background on that slide, and `kadal-deck dev`, a builder preview and `kadal-deck check` say the name was removed in 0.6 and link to the source.

An unknown background name no longer shows its red "Unknown background" notice in a published deck: the slide keeps the theme's background, as it does for a `pro/` item it cannot load. The notice still shows to the author on the dev server and in a builder preview.

The READMEs, the reference and the agent skill now lead with the Pro library — 95 backgrounds and layouts in 15 genres (`background: pro/<slug>`, `layout: pro/<slug>`), rendered on decks published to deck.kadal.cc from a Pro or Team workspace and falling back to the theme's background and the default layout anywhere else — and show a few of the free built-in backgrounds.
