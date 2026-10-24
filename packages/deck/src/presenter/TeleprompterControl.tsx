import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { readItem, writeItem } from "../core/storage.ts";
import {
  preferredScreen,
  SCREEN_KEY,
  type ScreenChoice,
  screenChoices,
  type ScreenLike,
  throttle,
} from "../core/teleprompter.ts";
import { type PresenterState, roomGlance, sameState } from "../core/window-messages.ts";
import { useLiveOptional } from "../live/context.ts";
import { useCommand } from "../react/commands.ts";
import { type DeckRuntime, useDeck } from "../react/context.ts";
import { useActions, useUi } from "../react/hooks.ts";
import { presenterTimer } from "../react/pacing.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TELEPROMPTER'S BUTTON  —  and what the presenter view tells the teleprompter
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The teleprompter (presenter/Teleprompter.tsx) is a window of its own, to put on whichever display
 * the speaker reads from: a monitor at the lectern, the glass of a prompter. This is how it gets
 * there, from the presenter's toolbar:
 *
 *   Teleprompter ▾        a menu of this computer's screens (the Window Management API, Chrome
 *    ├ DELL U2720Q        and Edge): its name and size, "this screen", "primary". Picking one
 *    │ 2560 × 1440        opens the teleprompter filling it, and is remembered (by name and
 *    ├ Built-in display   place) for next time, for Shift T and the `present.teleprompter`
 *    ├ A window to drag   command, which open it there without asking
 *    └ Close
 *
 * Where the API is missing (Firefox, Safari) the button opens a plain window to drag, and says so.
 * Where the browser was told not to place windows, the menu says where that is undone. Fullscreen
 * is the teleprompter's own button: only a click IN that window may ask for it.
 *
 * And the other half: the presenter view answers a teleprompter's `presenter:ask` with its timer
 * and the room at a glance, then sends them again whenever they change, at most four times a
 * second (core/window-messages.ts). The teleprompter never joins the room itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The Window Management API, as much of it as is used here. */
interface ScreenDetails {
  screens: readonly ScreenLike[];
  currentScreen: ScreenLike | null;
}
type WithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

type Permission = "granted" | "prompt" | "denied" | "unsupported";

const hasScreensApi = () =>
  typeof window !== "undefined" && typeof (window as WithScreens).getScreenDetails === "function";

async function screenPermission(): Promise<Permission> {
  if (!hasScreensApi()) return "unsupported";
  try {
    const status = await navigator.permissions.query({
      name: "window-management" as PermissionName,
    });
    return status.state;
  } catch {
    // A browser with the API but an older permission name: asking is the only way to know.
    return "prompt";
  }
}

/** The screens, asking for permission if need be (a click must be behind the first call). */
async function readScreens(): Promise<ScreenChoice[]> {
  const details = await (window as WithScreens).getScreenDetails!();
  return screenChoices(details.screens, details.currentScreen);
}

/** Open (or move) the teleprompter where it went last time, or on another screen than this. */
async function openOnPreferred(deck: DeckRuntime): Promise<string | null> {
  if ((await screenPermission()) === "granted") {
    try {
      const pick = preferredScreen(await readScreens(), readItem(SCREEN_KEY));
      if (pick) {
        deck.actions.openTeleprompter(pick.place);
        return pick.label;
      }
    } catch {
      /* the screens could not be read: a window to drag */
    }
  }
  deck.actions.openTeleprompter(null);
  return null;
}

const DRAG_HINT = "Teleprompter open — drag its window to the screen you read from";

export function TeleprompterControl() {
  const deck = useDeck();
  const actions = useActions();
  const open = useUi((s) => s.teleprompterOpen);
  const [menu, setMenu] = useState(false);

  useCommand({
    id: "present.teleprompter",
    title: "Teleprompter",
    description:
      "Open or close the teleprompter: a window of its own with this slide's notes, big, following the presenter, the timer and the room's hands and pace. It opens on the screen chosen last time (or another screen than the presenter's, when the browser may place windows).",
    group: "present",
    keys: "Shift+T",
    enabled: () => deck.mode === "presenter",
    params: z
      .object({
        on: z.boolean().optional().describe("true to open, false to close; omit to toggle"),
      })
      .strict(),
    run: async (p) => {
      const isOpen = deck.ui.get().teleprompterOpen;
      if (p.on === false || (p.on === undefined && isOpen)) {
        actions.closeTeleprompter();
        return { open: false };
      }
      const screen = await openOnPreferred(deck);
      if (!screen && deck.ui.get().teleprompterOpen) actions.toast(DRAG_HINT);
      return { open: deck.ui.get().teleprompterOpen, screen };
    },
  });

  return (
    <div className="deck-tp-control">
      <button
        type="button"
        className={open ? "is-on" : ""}
        aria-haspopup={hasScreensApi() ? "dialog" : undefined}
        aria-expanded={hasScreensApi() ? menu : undefined}
        onClick={() => {
          if (hasScreensApi()) {
            setMenu((m) => !m);
            return;
          }
          // No way to place a window: the toggle the Share window button is.
          if (open) actions.closeTeleprompter();
          else {
            actions.openTeleprompter(null);
            actions.toast(DRAG_HINT);
          }
        }}
        title="Your notes, big, in a window of their own for another screen (Shift T)"
      >
        <Icon name="scroll-text" /> Teleprompter
      </button>
      {menu ? <ScreenMenu open={open} onClose={() => setMenu(false)} /> : null}
    </div>
  );
}

function ScreenMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actions = useActions();
  const box = useRef<HTMLDivElement>(null);
  const [permission, setPermission] = useState<Permission | null>(null);
  const [screens, setScreens] = useState<ScreenChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remembered = readItem(SCREEN_KEY);

  const find = async () => {
    setError(null);
    try {
      setScreens(await readScreens());
      setPermission("granted");
    } catch {
      setPermission(await screenPermission());
      setError("The browser did not share the screens.");
    }
  };
  // Already allowed: the list straight away. Not yet: a button, so the browser's question comes
  // from a click that asked for it, not from opening a menu.
  useEffect(() => {
    let alive = true;
    void screenPermission().then((p) => {
      if (!alive) return;
      setPermission(p);
      if (p === "granted") void find();
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!box.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, [screens, permission]);

  const choose = (c: ScreenChoice | null) => {
    writeItem(SCREEN_KEY, c ? c.key : "");
    actions.openTeleprompter(c ? c.place : null);
    if (!c) actions.toast(DRAG_HINT);
    onClose();
  };

  return (
    <div
      ref={box}
      className="deck-tp-menu"
      role="dialog"
      aria-label="Where the teleprompter goes"
      data-deck-own-keys
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="deck-tp-menu-head">
        {open ? "Move the teleprompter to" : "Open the teleprompter on"}
      </p>
      {permission === null ? <p className="deck-tp-menu-note">Looking for screens…</p> : null}
      {permission === "prompt" && !screens ? (
        <button type="button" className="deck-tp-menu-item" onClick={() => void find()}>
          <Icon name="monitor" />
          <span>
            <b>Find my screens…</b>
            <small>The browser asks once whether this deck may place windows</small>
          </span>
        </button>
      ) : null}
      {permission === "denied" ? (
        <p className="deck-tp-menu-note">
          This browser was told not to place windows. Allow “Window management” in the site's
          settings to pick a screen here.
        </p>
      ) : null}
      {screens?.map((c) => (
        <button
          key={c.key}
          type="button"
          className={["deck-tp-menu-item", c.key === remembered ? "is-last" : ""].join(" ")}
          onClick={() => choose(c)}
        >
          <Icon name={c.current ? "laptop" : "monitor"} />
          <span>
            <b>{c.label}</b>
            <small>
              {c.size}
              {c.current ? " · this screen" : ""}
              {c.primary ? " · primary" : ""}
              {c.key === remembered ? " · last used" : ""}
            </small>
          </span>
        </button>
      ))}
      {screens && screens.length < 2 ? (
        <p className="deck-tp-menu-note">One screen found: connect another, or use a window.</p>
      ) : null}
      {error ? <p className="deck-tp-menu-note">{error}</p> : null}
      <button type="button" className="deck-tp-menu-item" onClick={() => choose(null)}>
        <Icon name="app-window" />
        <span>
          <b>A window to drag</b>
          <small>Opens here; move it to any screen</small>
        </span>
      </button>
      {open ? (
        <button
          type="button"
          className="deck-tp-menu-item is-close"
          onClick={() => {
            actions.closeTeleprompter();
            onClose();
          }}
        >
          <Icon name="x" />
          <span>
            <b>Close the teleprompter</b>
          </span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * The presenter view's half of the teleprompter's status strip: once a teleprompter has asked, its
 * timer and the room at a glance, now and on every change (four a second at most).
 */
export function usePresenterStateFeed(): void {
  const deck = useDeck();
  const live = useLiveOptional();
  useEffect(() => {
    const windows = deck.windows;
    if (!windows) return;
    let asked = false;
    let last: Pick<PresenterState, "timer" | "room"> | null = null;
    const send = throttle(() => {
      const next = {
        timer: presenterTimer.get(),
        room: live ? roomGlance(live.client.state.get()) : null,
      };
      if (sameState(last, next)) return;
      last = next;
      windows.post({ type: "presenter:state", from: deck.windowId, ...next });
    }, 250);
    // Nobody has asked, nobody is told: the room's counts stay in this window until a
    // teleprompter of this browser wants them.
    const changed = () => {
      if (asked) send();
    };
    const offAsk = windows.subscribe((m) => {
      if (m.type !== "presenter:ask") return;
      asked = true;
      last = null;
      send.flush();
    });
    const offTimer = presenterTimer.subscribe(changed);
    const offRoom = live?.client.state.subscribe(changed);
    return () => {
      offAsk();
      offTimer();
      offRoom?.();
      send.cancel();
    };
  }, [deck, live]);
}
