---
"@kadal/deck": minor
"@kadal/theme-classic": minor
"@kadal/theme-seriph": minor
"@kadal/theme-crisp": minor
"@kadal/theme-bricks": minor
"@kadal/theme-shibainu": minor
---

Slidev's five official themes, ported as Kadal theme packages: `@kadal/theme-classic` (Slidev's default theme), `@kadal/theme-seriph`, `@kadal/theme-crisp`, `@kadal/theme-bricks` and `@kadal/theme-shibainu`. Each keeps its Slidev original's layouts with the same names, slots and frontmatter (crisp's `intro-image`, `3-images` and `bullets`; bricks' `items` and `<Polygon1>`–`<Polygon11>`; shibainu's fourteen backgrounds), its `themeConfig` (`primary`), colour schemes, fonts and Shiki themes, and Slidev's proportions exactly. Install one and write `theme: seriph`; the prebuilt shell bundles all five. Each package has a preview deck that reproduces the original theme's example deck. THEMES.md has the Slidev → Kadal name mapping, and the catalog lists the packages (`THEME_PACKAGES`, `kadal-deck info themes`).

Fixed: slides now take the theme's text colour and body face. They used to inherit the base stylesheet's #111 and system-ui whatever the theme or the headmatter's `fonts` said, because html and body read those tokens before the theme's class applies.
