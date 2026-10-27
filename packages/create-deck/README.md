# @kadal/create-deck

> **Build it. Rehearse it. Own the room.** [Kadal Deck](https://deck.kadal.cc) has your back for the whole talk, from the first idea to the last applause. This is where the talk starts: a new deck, ready to write, in one command.
>
> [Take the tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Docs](https://deck.kadal.cc/docs/)

Start a new [Kadal Deck](https://deck.kadal.cc) presentation in one command. The deck is one
`deck.mdx` file: Markdown slides with clicks, stepping code, layouts, speaker notes and a poll,
ready to present, export or publish.

[Getting started](https://deck.kadal.cc/docs/getting-started/) · [Docs](https://deck.kadal.cc/docs/) · [The tour](https://decks.kadal.cc/@kadal-hq/tour/) · [Source](https://github.com/kadalcc/deck/tree/main/packages/create-deck)

```sh
npm create @kadal/deck@latest my-talk
cd my-talk && npm install
npm run dev          # http://localhost:5173: edit deck.mdx and the slide you're on updates
```

pnpm, Yarn and Bun work too (`pnpm create @kadal/deck my-talk`, `bun create @kadal/deck my-talk`).

## A theme or an addon instead

A package ready to publish: `package.json` per the contract, a stylesheet with every token and
layout class in light and dark, a layout, a layer, a README and a preview deck.

```sh
npm create @kadal/deck@latest -- --theme aurora     # kadal-theme-aurora/
npm create @kadal/deck@latest -- --addon qr         # kadal-addon-qr/
```

The contract is [THEMES.md](https://github.com/kadalcc/deck/blob/main/packages/deck/THEMES.md) in
`@kadal/deck`; the guide is [Writing a theme](https://deck.kadal.cc/docs/writing-a-theme/).

## Licence

AGPL-3.0-or-later, like the engine. See
[LICENSING.md](https://github.com/kadalcc/deck/blob/main/LICENSING.md).
