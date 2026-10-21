---
"@kadal/deck": patch
---

The presenter's room panel is now a sidebar with tabs, and redesigned:

- **Room:** the join QR sits on white with the link under it. The link wraps at its slashes instead of running off the edge, and has a Copy button. Below it: a Live / Connecting / Offline pill, tiles for watching, hands up and reactions, a pace gauge that says which way the audience leans, and reaction chips.
- **Questions:** cards with a vote count and icon buttons to mark answered or delete.
- **Polls:** cards with Open and Close buttons.
- **Empty states:** each tab says what will appear there.
- **Narrow columns:** the tabs not shown fold to icons.

New `deck.panels` registry: a host can add its own tab to the sidebar (`register({ id, title, icon, mount(el) })`, `open(id)`). A panel is mounted the first time its tab is shown and kept through tab switches and folding. deck.kadal.cc uses it for the Copilot, which no longer floats over the presenter view.
