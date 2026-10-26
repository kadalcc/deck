# Changelog

## 0.1.2

### Patch Changes

- b35fa9f: README and listing copy: the whole-talk story. Every package page now opens with "Build it. Rehearse it. Own the room." and what the package does for the talk (a theme is how it looks on the day, a renderer puts a live demo on a slide), with links to the tour and the docs. The engine's description and keywords cover rehearsal (narration, the teleprompter), the phone remote and the live room; the VS Code extension's Marketplace and Open VSX description says you build the talk there, then rehearse and present it from the same deck. No code changes.

## 0.1.1

- A new Marketplace page: screenshots and an animation taken from the extension itself (the preview following the cursor, the Slides outline, completion for settings and components), a getting-started section, every command and setting, and links to the docs, issues and Discussions.
- The listing's categories, keywords, badges and Q&A link, and the publisher contact (Kadal, hello@kadal.cc).

## 0.1.0

The first version.

- **Slides** view: the active deck's outline, numbered as the deck numbers it, vertical stacks nested; click a slide to go to it, drag one onto another to move it (whole slides, every other byte kept).
- **Preview** view: the deck from `kadal-deck dev`, following the cursor's slide; starts the dev server, or attaches to one already running on the port.
- **Kadal Deck language** for `deck.mdx` and `slides.mdx`: separators, frontmatter (as YAML), notes and their `[click]` markers, `::slot::` markers, code groups and `<<<` snippet imports highlighted; a fold per slide; each slide's number and title beside its separator.
- **IntelliSense** from the engine's catalog: deck and slide settings with their documentation, their values (layouts, transitions, themes, backgrounds…), and components with their required props.
- **Problems** from `kadal-deck check` on save; the full check (every slide compiled) as a command.
- **Formatting** with the deck's own `@kadal/prettier-plugin`.
- **Commands**: start and stop the dev server, open the deck or the presenter in the browser, export to PDF, check, format, new deck, choose the active deck.
- **AI**: `kadal-deck mcp` offered to VS Code's agents as an MCP server (VS Code 1.101 and later).
