---
"@kadal/deck": patch
"@kadal/deck-shell": patch
---

Quick edit and sync fixes from end-to-end testing:

- A deck's editing kit now carries the files its `<<<` snippet imports read (`<<< @/snippets/tide.ts#model`), so the web builder shows them and a deck published from the builder no longer loses them. A snippet the last CLI build did not read says so plainly, as an unknown import does.
- `mergeMdx` pairs a slide with the base slide in the same place when its neighbours line up, so a short slide edited on both sides (`# Hi` to `# Hello` and to `# Hey`) is a conflict instead of two slides. A slide added on both sides at the same place still keeps both.
- `kadal-deck pull` (and the MCP `deck_pull`) downloads the library media a quick edit added (`assets/media/<hash>.<ext>`, a sticker or an image picked in the builder) into the project's `public/assets/media/`, checked against its hash, so `kadal-deck dev` shows it and the next publish carries it. What the host does not have is a note, never a failed pull.
- The runtime compiler (the prebuilt shell, and every deck's editing kit) names the Shiki grammars it loads one by one instead of importing Shiki's whole bundle, which put all ~230 grammars in every kit although only the defaults were ever loaded. A deck's kit adds the languages its `deck({ shiki: { langs } })` lists, so the builder now highlights what the build did (the tour's `mdx` blocks). The tour's kit goes from 38.5 MB in 761 files to 32.4 MB in 549, the starter's from 22.6 MB in 631 files to 16.5 MB in 420.
- `kadal-deck status` no longer reports a file whose only difference from the synced version is its line endings (a CRLF checkout of a pulled file), and `pull --dry-run` prints whole words ("would add", "would delete", "would download") with the paths spaced out, and says nothing was written.
- When `publish` is refused because the deck moved (exit 4, and the MCP `deck_publish` diverged result), the message now says what moved it: "changed on the web" for a quick edit or an agent, "was published from another copy" for a teammate's or another machine's CLI publish, "was rolled back" for a rollback, and "This folder has never synced with the published deck" when there is no `.kadal-deck/sync.json`. The advice is the same each time: `pull` to merge, or `--force` to replace (the replaced version stays in the history).
