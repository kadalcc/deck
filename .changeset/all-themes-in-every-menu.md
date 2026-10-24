---
"@kadal/deck": patch
"@kadal/theme-brand": patch
"@kadal/theme-bricks": patch
"@kadal/theme-classic": patch
"@kadal/theme-crayon": patch
"@kadal/theme-crisp": patch
"@kadal/theme-folio": patch
"@kadal/theme-lecture": patch
"@kadal/theme-neon": patch
"@kadal/theme-ocean": patch
"@kadal/theme-seriph": patch
"@kadal/theme-shibainu": patch
"@kadal/theme-swiss": patch
"@kadal/theme-terminal": patch
---

Every deck's theme menu (T) now offers all sixteen first-party themes, whatever the deck declares.

- **Nothing to install.** @kadal/deck ships a copy of each of the thirteen theme packages
  (`dist/themes/<name>`), so a deck with only the engine installed can pick any of them, or name
  one (`theme: ocean`). An installed `@kadal/theme-<name>` still wins over the copy.
- **`themes:` orders the menu; it does not narrow it.** The deck's `theme` comes first, then its
  `themes` in order, then every first-party theme it did not name.
- **No heavier first paint.** A theme the deck did not name loads its stylesheet and layouts only
  when someone picks it (or points at its row). Its code keeps the deck's colours; name it in
  `themes:` to give its code its own Shiki colours.
- **Swatches before the CSS.** Theme packages gain `kadal.theme.swatch`, two colours the menu
  paints before the theme's stylesheet has loaded.
- The prebuilt shell (the builder) offers all sixteen too.
