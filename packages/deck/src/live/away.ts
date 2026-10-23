/**
 * A presenter view forgotten in a background tab stops presenting.
 *
 * The room counts a presenter for as long as its socket pings, and a hidden tab still pings (Chrome
 * only slows its timers to about once a minute), so a presenter view left open after the talk kept
 * every viewer's "Follow the presenter" offer, and sent each new viewer to its slide, for as long as
 * the tab lived. After `AWAY_AFTER_MS` hidden, the view reconnects as a viewer, and becomes the
 * presenter again the moment it is shown. Never while a session is live (the talk is on, from a
 * clicker or a phone) and never while a phone remote is paired (the phone drives this window,
 * which may well be hidden).
 */
export const AWAY_AFTER_MS = 15 * 60_000;
/** While hidden but kept presenting (a session, a phone), how often to look again. */
export const AWAY_RECHECK_MS = 60_000;

export interface AwayDeps {
  /** Whether the tab is hidden now. */
  hidden: () => boolean;
  /** Whether a session ("Start session") is running in the room. */
  sessionLive: () => boolean;
  /** How many phone remotes are paired. */
  remotes: () => number;
  /** Step down to a viewer (true) or back up to the presenter (false). */
  setAway: (away: boolean) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

export interface AwayWatch {
  /** The tab was shown or hidden. */
  visibility(): void;
  /** The room's state changed (a session, a phone). */
  roomChanged(): void;
  readonly away: boolean;
  dispose(): void;
}

export function createAwayWatch(deps: AwayDeps): AwayWatch {
  let timer: unknown = null;
  let away = false;
  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  const kept = () => deps.sessionLive() || deps.remotes() > 0;
  const check = () => {
    timer = null;
    if (!deps.hidden() || away) return;
    if (kept()) {
      timer = deps.setTimer(check, AWAY_RECHECK_MS);
      return;
    }
    away = true;
    deps.setAway(true);
  };
  const back = () => {
    if (!away) return;
    away = false;
    deps.setAway(false);
  };
  return {
    visibility() {
      clear();
      if (!deps.hidden()) back();
      else if (!away) timer = deps.setTimer(check, AWAY_AFTER_MS);
    },
    roomChanged() {
      // A phone paired, or a session started from somewhere: this window is presenting again.
      if (away && kept()) back();
    },
    get away() {
      return away;
    },
    dispose() {
      clear();
    },
  };
}
