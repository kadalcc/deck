---
"@kadal/deck": patch
---

`kadal-deck import reveal` scales the lengths in a deck's own CSS as it scales inline ones. The
importer already took a reveal.js deck's inline styles from reveal's 960×700 slide to Kadal's
1920×1080 stage (×1.543), but copied its `<style>` blocks and local stylesheets as written. A box
sized in the page's CSS then kept its old size while the inline heights inside it grew, so a bar
chart drawn with a 380px container and inline bar heights ran up into its own heading. `px` lengths
in declarations now take the same factor; a media query's widths, zero and 1px hairlines stay as
written.
