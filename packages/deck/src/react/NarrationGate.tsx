import { lazy, Suspense, useMemo, useState } from "react";
import { z } from "zod";

import { parseFlags } from "../core/hash.ts";
import { narrationOn } from "../narrate/text.ts";
import { cmd, useCommand } from "./commands.ts";
import { useDeck } from "./context.ts";

const Narration = lazy(() => import("../narrate/Narration.tsx"));

/** Is narration on for this deck (config, and notes to read)? */
export function useNarrationOn(): boolean {
  const rt = useDeck();
  return useMemo(
    () =>
      narrationOn(
        rt.config.narration.enabled,
        rt.columns.flatMap((c) => c.slides),
      ),
    [rt.config.narration.enabled, rt.columns],
  );
}

/**
 * The narration bar on the deck itself — rehearsing on the main screen. Hidden until `?narrate`
 * or R (narrate.toggle) asks for it, and its code is a separate chunk until then. Until the bar
 * has loaded, two stand-in commands open it; the bar's own `narrate.*` commands shadow them.
 */
export function NarrationGate() {
  const rt = useDeck();
  const on = useNarrationOn() && !rt.projector;
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && parseFlags(window.location.search).narrate,
  );
  const [autoplay, setAutoplay] = useState<{ from?: number } | false>(false);
  const standIn = on && !open;
  useCommand(
    standIn
      ? cmd({
          id: "narrate.toggle",
          title: "Narrate or pause",
          description: "Start narrating, or pause it if it is playing.",
          group: "narrate",
          keys: "R",
          run: () => {
            setAutoplay({});
            setOpen(true);
            return { playing: true };
          },
        })
      : null,
  );
  useCommand(
    standIn
      ? cmd({
          id: "narrate.play",
          title: "Narrate",
          description:
            "Read the speaker notes aloud and turn the pages, from the current step or from the start of slide `from` (0-based).",
          group: "narrate",
          params: z.object({ from: z.number().int().min(0).optional() }).strict(),
          run: (p) => {
            setAutoplay(p.from === undefined ? {} : { from: p.from });
            setOpen(true);
            return { playing: true };
          },
        })
      : null,
  );
  if (!on || !open) return null;
  return (
    <Suspense fallback={null}>
      <div className="deck-narration-dock">
        <Narration
          autoplay={autoplay}
          onClose={() => {
            setOpen(false);
            setAutoplay(false);
          }}
        />
      </div>
    </Suspense>
  );
}
