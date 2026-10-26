import { lazy, Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { createStore, useStore } from "../core/store.ts";
import { useLiveOptional } from "../live/context.ts";
import { usePanel } from "../media/MediaControls.tsx";
import { cmd, useCommand } from "../react/commands.ts";
import { useDeck } from "../react/context.ts";
import { useNarrationOn } from "../react/NarrationGate.tsx";
import { timelineShown } from "./rehearsal.ts";

/** The narrator's own settings: in its chunk, which the presenter view loads for the bar anyway. */
const RehearsalSettings = lazy(() =>
  import("../narrate/Narration.tsx").then((m) => ({ default: m.RehearsalSettings })),
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SESSION BUTTON AND THE REHEARSAL MENU  (presenter toolbar)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Built as Camera is (media/MediaControls.tsx): the button, and an arrow beside it that opens a
 * panel. With a live room the button is "Start session" / "Live"; without one, on a deck that
 * narrates, it is the menu's own button, "Rehearsal". The panel shows or hides the rehearsal
 * timeline at the bottom (presenter/rehearsal.ts) and holds the narrator's speed, voice, engine
 * and following, which then need no room on the bar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NO_ROOM = createStore<null>(null);

/** The deck's key for per-deck choices: its slug, or where it is served. */
export const deckKey = (deck: { config: { slug: string }; base: string }) =>
  deck.config.slug || deck.base;

/** `narrate.timeline`: show or hide the presenter's rehearsal timeline (Shift R). */
export function useTimelineCommand(on: boolean) {
  const deck = useDeck();
  const store = timelineShown(deckKey(deck));
  useCommand(
    on
      ? cmd({
          id: "narrate.timeline",
          title: "Show or hide the rehearsal timeline",
          description:
            "The presenter view's narration bar at the bottom: show it, hide it, or toggle (omit `on`). Hiding never stops narration that is playing.",
          group: "narrate",
          keys: "Shift R",
          params: z.object({ on: z.boolean().optional() }).strict(),
          run: (p) => {
            store.set(p.on ?? !store.get());
            return { shown: store.get() };
          },
        })
      : null,
  );
}

export function SessionControl() {
  const deck = useDeck();
  const live = useLiveOptional();
  const narrate = useNarrationOn();
  const store = timelineShown(deckKey(deck));
  const shown = useStore(store);
  const started = useStore(
    live?.client.state ?? NO_ROOM,
    (s) => (s as { startedAt?: number | null } | null)?.startedAt ?? null,
  );
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  const { panel, style } = usePanel(anchor, open, close);

  const session = live ? (
    <button
      type="button"
      className={started ? "is-on" : ""}
      onClick={() => live.client.send({ type: "session", action: started ? "end" : "start" })}
      title="Mark the session for the stats"
    >
      <Icon name={started ? "radio" : "play"} /> {started ? "Live" : "Start session"}
    </button>
  ) : null;
  if (!narrate) return session;

  return (
    <span ref={anchor} className="deck-record deck-session">
      {session ?? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Rehearsal: the timeline at the bottom, speed and voice"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Icon name="audio-lines" /> Rehearsal <Icon name="chevron-down" />
        </button>
      )}
      {session ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Rehearsal: the timeline at the bottom, speed and voice"
          aria-label="Rehearsal settings"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Icon name="chevron-down" />
        </button>
      ) : null}
      {open
        ? createPortal(
            <div
              ref={panel}
              className="deck-record-panel deck-rehearsal-panel"
              style={style}
              role="dialog"
              aria-label="Rehearsal settings"
              data-deck-own-keys
            >
              <h3>Rehearsal</h3>
              <label className="deck-record-check">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={(e) => store.set(e.target.checked)}
                  autoFocus
                />
                Show rehearsal timeline
                <kbd className="deck-rehearsal-key">Shift R</kbd>
              </label>
              <Suspense fallback={<p className="deck-record-note">Loading the narrator…</p>}>
                <RehearsalSettings />
              </Suspense>
              <p className="deck-record-note">
                Hiding the timeline never stops the narrator: while it reads, a small pill at the
                bottom has pause and the way back. Remembered for this deck in this browser.
              </p>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
