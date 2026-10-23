---
"@kadal/deck": patch
---

Transition, navigation and room fixes, found by stepping the tour's transitions frame by frame.

- **Stepping back a click no longer replays the slide's entrance.** The stage's direction followed every click, the arriving slide's animation is keyed on it, and a changed animation restarts, so a click back made the whole slide slide in again (and so did the first click forward after arriving backward). The slide's direction now changes only when the slide does; the background layer follows the same rule.
- **Up a stack, a slide no longer flashes all its steps.** The slide above waits pre-rendered at its last step; `up` lands on its first, and the steps used to fade out under the transition. A slide now takes the step it arrived at at once.
- **`view-transition` leaves nothing behind.** The slide that left stayed visible under the new one for the length of a transition (and played its own fade afterwards); now it's gone at once, as with `none`.
- **Backgrounds follow the slide.** A slide that cuts in (`transition: none`) or uses `view-transition` changes its background with it instead of cross-fading under it; `backgroundTransition: zoom` zooms (it used to slide sideways); a slide's `transitionSpeed` applies to its background; and a sliding background moves up and down a stack instead of sideways.
- **`clicksStart` works.** A slide with `clicksStart: 1` opens at step 1, stepping back stops there, and print, export and the scroll view start from it. Before, the slide opened at 0 and its first step showed nothing.
- **`<Toc mode="onlySiblings">`** lists the current slide's own branch: its ancestors, their siblings and its children. It used to list every entry at its level across the whole deck. Depth limits now apply after the tree is worked out, so `minDepth={2}` with `onlySiblings` lists the slides of the current chapter.
- **A presenter view forgotten in a background tab stops presenting.** After 15 minutes hidden, with no session running and no phone remote paired, it reconnects to the room as a viewer, so viewers stop being offered to follow it and new viewers no longer land on its slide. It becomes the presenter again the moment it's shown, or when a phone pairs or a session starts.
- **/stats and /export no longer join the room**, and only the deck itself and /join count as views: a visit to the stats used to count as a view of the deck.
- **A link to a slide's id with a step (`#/slide-id/3`) lands on that step.** The deck writes such links itself (`fragmentInURL`, ids), but reading one dropped the step.
- The `blur` click effect is in the catalog and the `ClickEffect` type (it was in the stylesheet only).
