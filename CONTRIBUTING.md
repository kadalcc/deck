# Contributing to Kadal Deck

Thanks for helping. Bug reports with a minimal `deck.mdx` that reproduces them are the most
useful thing you can send; pull requests are welcome too.

## Setup

You need [Bun](https://bun.sh) 1.3+ (the workspace's package manager and test runner) and
Node 20.19+ (what the published packages run on).

```sh
git clone https://github.com/kadalcc/kadal-deck && cd kadal-deck
bun install
bun run build          # every package into its dist/
bun run typecheck
bun run test
```

Work on a deck against your local engine:

```sh
cd examples/starter && bun run dev        # http://localhost:5173
cd examples/showcase && bun run dev       # every feature, every framework island
```

The examples import the packages' built `dist/`, so rebuild a package (`bun run build` in it)
after changing its source. To try the live room, run a Kadal Deck host and set
`KADAL_DECK_API=http://localhost:8797` before `bun run dev`.

## Layout

| path | |
| --- | --- |
| `packages/deck` | the engine and the `kadal-deck` CLI (`src/cli`) |
| `packages/deck-*` | framework renderers: each has `src/index.ts` (the renderer) and `src/build.ts` (helpers a Vite config can import without loading the framework in Node — keep it importing nothing but the contract) |
| `packages/create-kadal-deck` | the scaffolder; its `template/` is generated from `examples/starter` |
| `examples/` | the starter deck and the showcase |

## Tests

- `bun run test` — unit tests in every package (compiler, navigation, clicks, glossary, the
  renderer contract, the CLI's publish and login protocol against a fake host).
- **The island verifier.** A renderer is only done when it passes in a real browser against a
  *built* deck, because the bugs that matter here (a runtime in the first chunk, a remount where
  an update was meant, an island that mounts and silently does nothing) don't show up anywhere
  else:

  ```sh
  cd examples/showcase && bun run build && npx vite preview --port 4178 &
  node packages/deck/tools/verify-island.mjs --base http://localhost:4178/showcase --slide 3 \
    --framework vue --tally __vueIsland --ticks data-vue-ticks --step data-vue-step \
    --chunks 'runtime-core|vue-ticker'
  ```

  Thirteen checks per framework; `--settle 35000` for Python, which downloads an interpreter.

## Changes and releases

- Keep pull requests focused, with a test where the behaviour can be tested.
- Add a changeset (`bun run changeset`) describing the change for users; releases are cut from
  `main` by the release workflow, which publishes to npm with provenance.
- Format and lint: `bun run format`, `bun run lint`.

## Licence of contributions

The engine is AGPL-3.0-or-later and also offered under a commercial licence (see
[LICENSING.md](LICENSING.md)), so contributions may appear in both. Before the first outside
pull request is merged, a short Contributor Licence Agreement will be added and linked from the
pull request template; it grants that right and nothing else. Until then, please open an issue
first for anything larger than a fix.

## Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
