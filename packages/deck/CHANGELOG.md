# @kadal/deck

## 0.2.1

### Patch Changes

- 96d9a55: `<Youtube>` and `<Tweet>` get posters. `kadal-deck export --posters` now captures them, which it skipped before, so the print, the overview and the next-slide box showed an empty card. A video's poster is its player, opened with a referrer so YouTube draws the video instead of "Error 153". A post gets one per colour scheme, captured at the card's own width and painted to its edges. Both components also take a `poster` prop of their own.

## 0.2.0

### Minor Changes

- 64ac55f: First-class support for AI agents.

  - `kadal-deck mcp`: a Model Context Protocol server (stdio) with tools to look up the reference, scaffold a deck, outline it, edit single slides (only their lines change; each edit is linted), check, render slides to PNG for the agent to look at, preview, build, export and publish — plus the catalog, reference and guides as resources and `draft_deck` / `review_deck` prompts.
  - New commands: `kadal-deck check` (lint frontmatter, layouts, backgrounds, MDX, components, includes, assets, glossary and code fences, with file:line), `kadal-deck info` (the reference), `kadal-deck screenshot` (PNG per slide) and `kadal-deck new <dir>` (scaffold without questions).
  - Every command but dev/build/mcp takes `--json`; flags accept `--flag=value`; documented exit codes (0 ok, 1 failed, 2 usage, 3 not signed in, 4 missing prerequisite); `--dir`/`-C` runs in another folder.
  - `@kadal/deck/catalog` (everything a deck can use, as data, kept in sync with the engine by tests), `@kadal/deck/authoring` (outline, lint and edit a deck as text) and `@kadal/deck/schema/frontmatter.json` (JSON Schema).
  - The Agent Skill (`skills/kadal-deck`, also shipped in the package) and a Claude Code plugin marketplace in the repository; new decks get an `AGENTS.md`.
  - `splitDeck` reports each slide's exact line range and can collect YAML/include problems instead of throwing (`onError`).

- 6932451: Run safely in an opaque origin. A host may serve a deck with `Content-Security-Policy: sandbox`
  (no `allow-same-origin`) so the deck can't act as the visitor on the host's own origin; the
  engine now works there:

  - Storage (`localStorage`, `sessionStorage`) degrades to memory for the page instead of failing,
    and the anonymous viewer id stays the same for the page's beacons and reconnects.
  - The deck's windows (play, presenter view, share window) stay in step over a window bus:
    BroadcastChannel where it reaches, plus `postMessage` between a window and the windows it
    opened. A presenter view ignores navigation from the page that opened it.
  - Presenters prove themselves with a ticket the host issues, kept in memory: from the URL
    fragment (`#ticket=…`, wiped on arrival), from `window.__KADAL_DECK__.ticket`, or from the
    passcode form's answer. It rides on the room WebSocket (`?ticket=`) and on presenter calls
    (`x-deck-ticket`); the passcode form no longer reloads the page.
  - Host calls no longer send `credentials: "include"`; beacons go as `text/plain`.
  - A host can name a viewer-verification page (`window.__KADAL_DECK__.verify`) for Turnstile,
    which can't run inside an opaque origin.

### Patch Changes

- 0e16dbd: Fixes found while rebuilding the showcase: custom-element and React islands work in production
  builds; `layout: name` resolves a deck's own layouts; `transition: zoom-in fade-out` animates both
  halves; a slide's `autoSlide` works without a deck-wide one (and `A` works anywhere); print and
  export give one page per click step; `<Notes>` and magic-move examples inside code stay code;
  `<Clicks every>` groups within each list; `colorScheme` slides paint their scheme's background;
  autoFit ignores `<Background>`, `<Absolute>` and `<Arrow>`; the starfield no longer freezes;
  magic move uses the code font and honours `{lines: true}`; Typewriter and Encrypted print
  finished; renamed lucide icons resolve; icons stay inline under Tailwind; offline polls say
  "offline".

## 0.1.1

### Patch Changes

- a433d50: Ship the map-room and sign backgrounds. 0.1.0's build dropped `src/backgrounds/gis.tsx` and `sign.tsx`, which register themselves on import, because `sideEffects` named only `dist/` paths. So `background: globe` (and raster, choropleth, lattice, thiessen, voronoi, cells, compass, neatline, scan, track, plane, floor, signer, variants, handshapes, trails, window and embedding) showed "Unknown background" instead.
