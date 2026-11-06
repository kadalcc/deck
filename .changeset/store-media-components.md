---
"@kadal/deck": minor
---

Kadal Store's media in any deck, credited, and the components it needs.

- `<Lottie src poster loop autoplay at pauseAt speed size x y />` plays a Lottie JSON or a `.lottie`
  (lottie-web's light SVG player, loaded only when a slide has one); `<Model src poster alt
  camera autoRotate controls />` shows a `.glb` you can turn (Google's `<model-viewer>`, lazy).
  Both are placed like a `<Sticker>` with `x`/`y`/`pos` or sit in the flow, and print, exports, the
  overview and reduced motion show the poster.
- `lut="/x.cube"` and `lutStrength` grade an `<Image>` or a `<Video>` with a 3D LUT on WebGL2;
  a graded image prints and exports graded.
- `<Audio>` takes `<Video>`'s click options: `at` for a sound effect on a click, `pauseAt`,
  `steps`, plus `fade` and `volume` for music under a slide. It sounds only in the deck itself and
  is not drawn in print.
- `<Video>` and `<Audio>` take `provider`, `id`, `credit`, `creditUrl`, `license` and
  `licenseUrl` like `<Sticker>`; `provider="kadal-store"` lists an item under **Kadal Store** in
  `<Credits />`, with the Kadal Deck licence and a link to get the files. A slide's `background:`
  mapping with those keys is credited too, and `lutCredit`/`lutCreditUrl` credit a grade.
- `background: { image, repeat: true, size: 512 }` (or `repeat: repeat` with a `px` size) tiles a
  pattern in stage pixels, the same in every view and in print.
- `kadal-deck media search store <words> [--type pattern|music|lottie|…]` and the MCP's
  `kind: store` search Kadal Store's shelf on the deck host.
