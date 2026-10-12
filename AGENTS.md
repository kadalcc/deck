# Working on the Kadal Deck engine

This repository is the open-source engine (AGPL-3.0-or-later): the `@kadal/deck` package, the
framework renderers `@kadal/deck-*`, `@kadal/create-deck`, and two example decks. Writing a deck
rather than changing the engine? Read `skills/kadal-deck/SKILL.md` instead.

## Commands (Bun 1.3+, Node 20.19+)

```sh
bun install
bun run build        # every package's dist/ (the examples import the built dist/)
bun run typecheck
bun run test         # bun test in every package
bun run lint         # oxlint
node tools/smoke.mjs # pack every package, scaffold a deck from the tarballs, npm install, build
```

In `packages/deck`: `bun run catalog` regenerates the catalog and everything derived from it;
`bun tools/catalog.ts --check` (also a test) fails when they are stale.

## Map

| path | |
| --- | --- |
| `packages/deck/src/compiler` | splitting deck.mdx (`split.ts`, with line ranges), code meta, slots, magic move, the glossary pass |
| `packages/deck/src/vite` | the Vite plugin (`virtual:deck`, one module per slide) |
| `packages/deck/src/core` | model and config (`model.ts` — every option), navigation, clicks, keyboard, hash |
| `packages/deck/src/react`, `components`, `backgrounds`, `themes` | the runtime, built-in components, backgrounds, CSS |
| `packages/deck/src/catalog` | `@kadal/deck/catalog`: everything a deck can use, as data. `generated.ts` is extracted from the source by `tools/catalog-extract.ts`; `components.ts` and `reference.ts` hold the prose |
| `packages/deck/src/authoring` | `@kadal/deck/authoring`: outline, lint and line-exact edits of a deck as text (no Node APIs) |
| `packages/deck/src/cli` | the `kadal-deck` CLI: `index.ts` (commands, exit codes, `--json`), `args.ts`, `render.ts` (Vite server + headless Chromium), `new.ts`, host/login/publish |
| `packages/deck/src/mcp` | `kadal-deck mcp`, the stdio MCP server (lazy-loaded) |
| `skills/kadal-deck` | the Agent Skill; `references/components.md` and `layouts-and-backgrounds.md` are generated |
| `.claude-plugin/marketplace.json` | makes this repo a Claude Code plugin marketplace (the skill + the MCP server) |
| `examples/starter` | the scaffold (synced into `packages/create-deck/template` and `packages/deck/template` at build) |
| `examples/showcase` | every feature on one deck |

## Rules

- Adding a component, layout, background, transition or option? Add its prose entry to
  `src/catalog/components.ts` or `src/catalog/reference.ts`, run `bun run catalog`, and commit the
  generated files. `src/catalog/catalog.test.ts` fails until the catalog and the registries agree.
- The CLI must stay fast to start: import heavy modules (MDX compiler, Playwright, the MCP SDK)
  lazily inside the command that needs them.
- In `--json` mode and in the MCP server, stdout carries only the protocol; logs go to stderr
  (`keepStdoutClean()` in `src/cli/vite.ts`).
- `package.json` files must survive `npm pkg fix` unchanged (CI checks it; npm 11 drops `bin`
  paths that start with `./`).
- Every user-facing change gets a changeset (`bun run changeset`); all `@kadal/*` packages version
  together.
