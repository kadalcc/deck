# @kadal/deck-shell

## 0.5.0

### Minor Changes

- 453585a: Remote packs: `pro/` backgrounds and layouts from the host's library. A `pro/<name>` in
  `background:`, `layout:` or `<Background name>` resolves through `window.__KADAL_DECK__.premium`
  (a new `HostOverride` field, http(s) only): the engine fetches the host's `catalog.json` once,
  only when a slide uses such a name, and `import()`s the item's module, which borrows the engine's
  React through the new `window.__KADAL_DECK_RUNTIME__` global (`{ contract, version, React, jsx,
  components, hooks }`). Without a host — or when the host refuses — the slide keeps the theme's
  own background and the default layout, silently in a published deck; under `kadal-deck dev` and
  in a builder preview a dismissible "Pro background — available on Kadal Deck Pro" chip says
  why. An item's static `poster` is used in print, export, thumbnails and with reduced motion.

## 0.4.10

No changes in this release.

## 0.4.9

No changes in this release.

## 0.4.8

No changes in this release.

## 0.4.7

No changes in this release.

## 0.4.6

No changes in this release.

## 0.4.5

No changes in this release.

## 0.4.4

No changes in this release.

## 0.4.3

No changes in this release.
