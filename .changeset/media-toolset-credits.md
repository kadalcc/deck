---
"@kadal/deck": minor
---

Find media from the command line and from your agent, and credit it automatically.

- `kadal-deck media search <kind> <words>` and `kadal-deck media trending <kind>` (kinds `icon`,
  `emoji`, `sticker`, `gif`, `meme`, `template`, `kadal`; `--limit`, `--set`, `--json`) search the
  hosted builder's sources — Iconify, the emoji sets, KLIPY, Imgflip and Kadal's own library — and
  print each result with the exact MDX the builder's Insert media panel writes, a preview URL, its
  size and its credit. KLIPY is asked from your machine with the host's key once you `login`, in
  KLIPY's order, with `content_filter=high`; `kadal-deck media used klipy <id>` is its share trigger.
- `kadal-deck mcp` has three more tools, `media_search`, `media_trending` and `media_used` (24 in
  all); KLIPY results that an edit tool writes into a slide are reported to KLIPY on their own.
- `credits: true` in the headmatter (or `{ slide: "end", footer: false, title: "Thanks to" }`)
  collects every attributed GIF, sticker, meme template, emoji set, icon set, Kadal item and
  `<Image credit>` the slides use when the deck compiles, and lists them by source with licences
  and links on a Credits slide before the last slide, with a small link to it in the corner of
  every other slide — outside the layout, so nothing moves; a line of text in print and the
  exports. It works the same in `kadal-deck build`, the hosted player and the audience page.
  `<Credits />` places the list on a slide of your own.
- `<Sticker>`, `<Gif>` and `<Meme>` take `provider="kadal"` for Kadal's own library: credited
  "Kadal", and drawn (their `still` first) in print and every export where a provider's GIF gets a
  link card. `<Sticker>` also takes `still`, `credit`, `creditUrl`, `license`; `<Image>` takes
  `credit`, `creditUrl`, `license`, `licenseUrl`.
