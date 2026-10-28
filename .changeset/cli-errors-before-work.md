---
"@kadal/deck": patch
---

The CLI now names what's missing before it starts any work:

- **`export` without Playwright** exits 4 with the command to install it (`npm install -D playwright && npx playwright install chromium`), as `contrast` and `screenshot` already did. It used to build the whole deck first and then fail with exit 1 and `Cannot find package 'playwright'`.
- **A mistyped `-C` folder** with `build`, `dev` or `export` now says `No deck.mdx in <folder>` (exit 4). It used to say `spawn …/node ENOENT`, which pointed at Node rather than at the folder.
- **`new --ci` with a misspelt host** is refused before the scaffold and its install. It used to leave a half-made folder behind, which a second try then called "not empty".
- **`new` pointed at a file** says so, instead of a raw `ENOTDIR`.
- **`check` given another file** (`check talk.mdx`) is a usage error. It used to lint `deck.mdx` and pass. `check deck.mdx` and `check .` still work.
