# Licensing

**Kadal Deck** (`@kadal/deck` and the `@kadal/deck-*` renderers) is dual-licensed.

## 1 · AGPL-3.0-or-later (the default)

The engine is free software under the **GNU Affero General Public License, version 3 or later** —
the full text is in [`LICENSE`](./LICENSE). You may use it, change it, and build on it, for anything,
including commercially.

The one obligation that matters in practice: **if you run a modified version of this engine as a
network service, the people using that service must be able to get your modified source.** That is
AGPL §13, and it is the whole reason this licence was chosen rather than MIT. Running an unmodified
copy, embedding the engine in a site you publish, or presenting with it, triggers nothing.

If you are self-hosting your own decks, this licence is all you need and you owe nobody anything.

## 2 · Commercial licence

If you want to build a **hosted or proprietary product on top of the engine** without publishing
your own source, a commercial licence removes the AGPL obligations. That is the arrangement that
funds the engine's development, in the same way Slides.com funds reveal.js.

Ask: **pmithunish@gmail.com**.

## Why this split

The engine is the part that should belong to everyone: the compiler, the runtime, the components,
the themes, the export, the framework renderers. A deck you wrote should keep rendering with no
account, no network and no company, for as long as a browser exists.

The parts that cost money to run — the live room, publishing, accounts, the share window's hosted
half, analytics — are the product. That boundary is honest about where the expense actually is:
a Durable Object holding a room for thirty phones is somebody's bill.

## What a contributor is agreeing to

Contributions are accepted under the AGPL, and dual licensing means they may also appear in the
commercial offering. A CLA will be added before the repository opens to outside contributions; until
then the only contributor is the author.
