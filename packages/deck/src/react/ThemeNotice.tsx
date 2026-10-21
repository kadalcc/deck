import { useEffect, useState } from "react";

import { useDeck } from "./context.ts";

/**
 * A theme (or addon) the deck asked for that this player does not have: said once, on screen, in
 * words a presenter can act on, and dismissible — the deck still runs, in the fallback theme. The
 * same lines go to the console. Never on a printed page or a projector (nobody there can act).
 */
export function ThemeNotice() {
  const deck = useDeck();
  const warnings = deck.manifest.packages?.warnings ?? [];
  const key = warnings.join("\n");
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    for (const w of key ? key.split("\n") : []) console.warn(`[deck] ${w}`);
  }, [key]);

  if (!key || dismissed === key || deck.projector || deck.mode === "audience") return null;
  return (
    <div className="deck-theme-notice" role="status">
      <div className="deck-theme-notice-text">
        {warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
      <button
        type="button"
        className="deck-theme-notice-close"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => setDismissed(key)}
      >
        ×
      </button>
    </div>
  );
}
