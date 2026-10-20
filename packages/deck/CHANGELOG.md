# @kadal/deck

## 0.3.1

### Patch Changes

- bc47947: Phone remote: one phone at a time, paired by a code that keeps changing, and the air pointer on iPhone.

  - The QR holds a one-time pairing code, not the presenter's ticket. It changes every 30 seconds while the dialog is open (each code works for a minute), so a photo of the screen is soon worthless.
  - The newest phone to scan becomes the remote; any other is disconnected and says "Another phone took over as the remote." A paired phone keeps a lease for its tab, so a reload or a dropped connection reconnects without scanning again.
  - Disconnect drops the phone even while it is offline, voids its lease and changes the code.
  - iPhone: the air pointer asks for motion with a tap ("Tap to allow motion · then hold to point"). iOS only shows its prompt from a tap; asked on the press that starts a hold, it refused without asking ("Motion access was not allowed").
  - Rooms need the matching server (deck.kadal.cc has it). Against an older room the QR falls back to the presenter ticket.

## 0.3.0

### Minor Changes

- 1af5183: Commands: everything a person can do to a running deck is now a command in one registry —
  `deck.commands` (and `window.__deck.commands`), with stable ids (`nav.next`, `present.blackout`,
  `draw.shape`, `deck.slide` …), descriptions, and zod parameters exported as JSON Schema. The
  keyboard runs through it, so a phone remote or an AI agent can do exactly what the keys and
  buttons do. New commands aim the laser (`present.laserAt`), drive the pen from a touchpad
  (`draw.pen`), mark a region (`draw.shape`: circle, box, underline, arrow), zoom to a point, and
  read the deck (`deck.state`, `deck.outline`, `deck.slide`, `deck.search`). The manifest now
  carries each slide's speaker notes as plain text (`notesText`). `useCommand` registers your own.
- e960d13: Narration: rehearse with the deck reading its own notes. Each `[click]` part of a slide's
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

- 2473f77: Phone remote: the presenter view's new **Phone remote** button shows a QR, and the phone that
  scans it becomes a one-handed remote at `/<slug>/remote` (`RemotePage` from
  `@kadal/deck/remote`; add `remote: RemotePage` to `<Deck pages>`). It shows a live copy of the
  current slide, rendered by the deck's own components. Touch the slide to aim the laser or the
  spotlight, draw on it with the pen, or tap to zoom. Hold the air-pointer button and move the
  phone to point (DeviceOrientation with iOS's permission prompt, or a Gyroscope where there is one,
  smoothed by a One Euro filter). It also has next and back (or a swipe), blackout, focus labels, a
  slide list, the notes for the current click step, the timer with pacing, buzzes at chosen
  minutes, haptic ticks and a screen wake lock. Everything it does runs as a command in the
  presenting window.

  With a room, the phone is a presenter socket holding the ticket from the QR's fragment. The
  protocol gains `command`, `command:result`, `remote:state`, `remote:kick` and `remote:bye`, plus
  validators. Without a room, `kadal-deck dev` relays it over the dev server's HMR socket with a
  pairing code. `kadal-deck dev --https` serves a self-signed certificate so phones get motion
  sensors. In the presenter view without a room, the laser now shows on the current slide, and the
  remote's laser, ink and zoom reach the play window.

- 71ad8e8: The presenter gate follows the host: when it says the deck has no passcode (`passcode: false`) the
  gate stops asking for one, and when it gives a `signIn` URL it offers "Sign in as the author" —
  on its own, or below the passcode field. Only http(s) links are followed.
- 2d862df: Decks without a build. `@kadal/deck/runtime` compiles a deck from its text in the browser —
  the same remark/rehype passes, Shiki highlighting, notes, magic move and glossary as the Vite
  plugin (both now share `compiler/pipeline.ts`) — and returns diagnostics with lines instead of
  throwing. The new `@kadal/deck-shell` package is one prebuilt static page that runs any
  `deck.mdx` served beside it, under any path; with `?preview` it is an editor's live iframe,
  speaking a small `postMessage` protocol (source in; diagnostics, outline, position, command
  results and picked points out). `<Deck base>` sets the URL root explicitly. Slides compiled
  this way use the engine's components and cannot `import`.

### Patch Changes

- ac41497: A deck compiled again in the same page (an editor's live preview) now shows the new slides: the
  slide-module cache is keyed by each manifest entry's loader instead of the slide's index.

## 0.2.2

### Patch Changes

- 524ff4b: `kadal-deck export` makes a PDF that looks like the deck in every viewer. The browser's printer turned CSS effects into PDF features that viewers draw differently: Glass cards came out filled with their edge gradient, Preview and Quick Look painted grey slabs wherever a blurred shadow fell, and gradient text picked up hairlines. Now each page is a picture of the slide with its text hidden, with the text printed over it as text, so it stays sharp at any zoom and can still be selected and searched. The PDF is also about a third of the size. `--vector-pdf` prints with the browser alone, as before.
- 2d5f6da: Posters of maps show the map. `kadal-deck export` photographed embedded pages on software WebGL (SwiftShader), where a map is so slow that in ten seconds it had fetched almost none of its tiles, so the poster was the markers floating over an empty grid. Posters are now taken on the machine's GPU when it has one (SwiftShader remains the fallback, as on CI), only after the page's requests have gone quiet, and at 2× so they stay sharp in the PDF.

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
