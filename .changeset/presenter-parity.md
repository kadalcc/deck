---
"@kadal/deck": minor
---

Presenting, on a par with Slidev and past it:

- The presenter's timer is a stopwatch or a countdown (`timer: countdown`, `duration: 30min` — also `1h`, `90s`, `25:00` or minutes) that pauses, resumes and resets, fills a progress bar with a tick where this slide should be, and goes red in overtime. The pacing badge stays, and the phone remote and the room panel show the same timer (tap the remote's timer to pause it).
- Speaker notes can be edited in the presenter view, on `/notes`, on the new `/overview` and on the new batch editor `/notes-edit` while `kadal-deck dev` runs: the dev server rewrites only that slide's notes in deck.mdx and the views update without a reload. Saves are conflict-safe. A built deck stays read-only; a host can pass `<Deck notesEditor>`.
- `[click]` markers in notes are buttons that jump to their step, past/current/future parts are styled and the current one is kept in view — in the presenter, on `/notes`, `/overview` and the phone remote. `[click:N]` names a step.
- `/overview`: every slide with a slider through its steps and its notes.
- Display settings (`,`): brightness, contrast, saturation, sepia, hue and invert for the slides, per deck per browser, shared live between its windows.
- A right-click context menu (`contextMenu: true | false | "dev" | "build"`), keyboard accessible, with custom items through `<Deck contextMenu>` or `deck.menu.add`.
- Custom shortcuts: `<Deck shortcuts>`, `defineShortcuts`, `deck.shortcuts.add`, listed in the `?` sheet. The `keyboard: { KeyX: action | null }` map now works as documented.
- Navigation direction: `data-nav-direction` on the root, stage and moving slides, `--deck-nav-sign`, `forward:` / `backward:` Tailwind variants in the starter and plain `deck-instant-back`-style classes. Tailwind utilities can now change a click's timing.
- `useSlideEnter` / `useSlideLeave` (and `onSlideEnter` / `onSlideLeave`), `useIsSlideActive`, `useNavDirection`.
