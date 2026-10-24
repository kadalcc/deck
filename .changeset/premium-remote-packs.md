---
"@kadal/deck": minor
"@kadal/deck-shell": minor
---

Remote packs: `pro/` backgrounds and layouts from the host's library. A `pro/<name>` in
`background:`, `layout:` or `<Background name>` resolves through `window.__KADAL_DECK__.premium`
(a new `HostOverride` field, http(s) only): the engine fetches the host's `catalog.json` once,
only when a slide uses such a name, and `import()`s the item's module, which borrows the engine's
React through the new `window.__KADAL_DECK_RUNTIME__` global (`{ contract, version, React, jsx,
components, hooks }`). Without a host — or when the host refuses — the slide keeps the theme's
own background and the default layout, silently in a published deck; under `kadal-deck dev` and
in a builder preview a dismissible "Pro background — available on Kadal Deck Pro" chip says
why. An item's static `poster` is used in print, export, thumbnails and with reduced motion.
