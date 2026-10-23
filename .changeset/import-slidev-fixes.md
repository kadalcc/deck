---
"@kadal/deck": patch
---

`kadal-deck import slidev` fixes:

- With `mdc: true` (or `comark: true`), Comark attribute lists such as `[text]{.red}`, `**bold**{.accent}` and `:badge[New]{tone="good"}` are kept as written instead of escaped into text.
- `mdc`, `monacoTypesSource`, `monacoTypesAdditionalPackages` and `monacoTypesIgnorePackages` are translated (to `comark`, `monacoTypes`, `monacoPackages`, `monacoTypesIgnore`) and no longer copied as well, so `check` has nothing to flag in the converted headmatter.
- A `{monaco-run}` block that imports a package is no longer reported: the runner fetches packages from the deck's `monacoRunImports` CDN. Imports of the deck's own files and of Node's modules are still reported, since those do fail.
