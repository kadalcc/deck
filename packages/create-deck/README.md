# @kadal/create-deck

```sh
npm create @kadal/deck@latest my-talk
cd my-talk && npm install && npm run dev
```

Scaffolds a [Kadal Deck](https://deck.kadal.cc): slides in MDX with clicks, stepping code,
layouts, speaker notes and a poll, ready to `npx kadal-deck publish`.

A theme or an addon package instead, ready to publish (package.json per the contract, a stylesheet
with every token and layout class in light and dark, a layout, a layer, a README and a preview deck):

```sh
npm create @kadal/deck@latest -- --theme aurora     # kadal-theme-aurora/
npm create @kadal/deck@latest -- --addon qr         # kadal-addon-qr/
```

The contract is THEMES.md in @kadal/deck.
