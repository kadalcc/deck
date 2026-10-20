import { useEffect } from "react";

import { createWindowBus, type WindowBus } from "../core/windows.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";

/**
 * WITHOUT A ROOM, the phone remote drives the presenter view, and the presenter view's position
 * and blackout already reach the play window over the window bus. Its laser, ink, zoom and labels
 * never did — with a room the laser, ink and zoom travel through it — so a remote's command for one of those is
 * passed on, as the same command, to this browser's play windows. A toggle always arrives as
 * on/off (the remote never sends a bare toggle), so running it twice is running it once.
 */
export const FORWARDED = new Set([
  "present.pointer",
  "present.spotlight",
  "present.laserAt",
  "present.laserOff",
  "draw.pen",
  "draw.shape",
  "draw.undo",
  "draw.clear",
  "view.zoom",
  "view.zoomOut",
  "view.hints",
  "view.overview",
]);

export interface ForwardedCommand {
  id: string;
  params: Record<string, unknown>;
}

export function remoteBus(deck: Pick<DeckRuntime, "config" | "base">): WindowBus<ForwardedCommand> {
  return createWindowBus<ForwardedCommand>(`${deck.config.slug || deck.base}:remote`);
}

/** In a play window with no room: run what the presenter view's phone remote passes on. */
export function RemoteMirror(): null {
  const deck = useDeck();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bus = remoteBus(deck);
    const off = bus.subscribe(({ data, via }) => {
      // The page that OPENED this deck can be any page; only this browser's own deck windows
      // (the channel) and the presenter view this window opened speak for the presenter.
      if (via === "opener" || !data || typeof data.id !== "string" || !FORWARDED.has(data.id))
        return;
      void deck.commands.run(data.id, data.params ?? {}, "remote");
    });
    return () => {
      off();
      bus.close();
    };
  }, [deck]);
  return null;
}
