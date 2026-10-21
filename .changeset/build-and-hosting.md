---
"@kadal/deck": minor
---

Build and hosting, on par with Slidev and past it:

- The built page's head comes from the headmatter: title, `info` as the description, author, `lang`, `favicon`, and `seoMeta` with Slidev's names (Open Graph, Twitter cards, canonical, theme-color, any other meta tag). The runtime keeps the document's head in step, so decks the hosted player compiles get them too.
- `seoMeta.ogImage: auto` photographs slide 1 into `og-image.png` (1200×630) during `kadal-deck build`; a committed `og-image.png` or a path is used instead, and a build without Playwright skips it with a message.
- `pwa: true` (or `build --pwa`) makes the deck an installable app that presents offline: a manifest, icons in the theme's colours (or your favicon), and a small service worker that saves the whole build, says when it is ready, and offers a new version with a Reload button instead of reloading mid-talk. It never answers the live room, the host's `/api`, the dev endpoints or the phone remote, and never runs in dev; `publish` leaves it out unless `--pwa`.
- `bundleRemoteAssets: true` (or `--bundle-remote-assets`; Slidev's `remoteAssets` too) downloads remote images, video, Google/Bunny Fonts and CSS `url()`s into the build, cached between builds, so a deck needs no network at all.
- `kadal-deck build a.mdx b.mdx` builds several decks into their own folders with a page listing them; `--out` names the folder, and `--base` now reaches `--download`'s PDF step too.
- Every build copies index.html into each route's folder and writes `404.html` and `_redirects`, so `/presenter`, `/notes` and `/remote` work on GitHub Pages, S3 or nginx without rewrites.
- New commands: `kadal-deck serve` serves a build as a static host would (its base, routes, Range requests, cache headers), and `kadal-deck ci <github-pages|netlify|vercel|cloudflare|docker>` (or `new --ci`) writes that host's deploy files for the deck.
- `kadal-deck check` warns about a missing `favicon` or `ogImage` file and an `og:image` that will not be a full URL.
