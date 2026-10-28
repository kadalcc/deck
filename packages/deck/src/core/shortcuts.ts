import { comboOf, KEY_BINDINGS, type KeyAction, type KeyBinding } from "./keyboard.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CUSTOM SHORTCUTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The keyboard is a list of bindings (core/keyboard.ts) a deck can add to, change or take keys
 * away from — Slidev's `setup/shortcuts.ts`, as data:
 *
 *   // main.tsx — the whole list, from the defaults
 *   <Deck shortcuts={defineShortcuts((defaults) => [
 *     ...defaults.filter((b) => b.action !== "colorScheme"),       // D does nothing now
 *     { keys: ["KeyQ"], command: "view.overview", description: "Overview" },
 *     { keys: ["Shift+KeyN"], run: () => alert("hi"), description: "Say hi" },
 *   ])} />
 *
 *   // or only additions (an array): they take their keys from whatever had them
 *   <Deck shortcuts={[{ keys: ["Enter"], action: "next", description: "Next" }]} />
 *
 *   // an addon's setup, a component, the console: layered on top, removed by the returned fn
 *   const off = deck.shortcuts.add({ keys: ["KeyM"], command: "present.spotlight", description: "Spotlight" });
 *
 *   # headmatter / deck.config.ts: rebind or unbind single keys
 *   keyboard: { KeyQ: overview, KeyD: null }
 *   # reveal.js's form reads too: keyCodes, its method names, functions (deck.config.ts)
 *   keyboard: { 13: next, 79: toggleOverview, 32: null }
 *
 * Keys are `KeyboardEvent.code` names (the physical key, so a layout change does not move them)
 * with `Ctrl+`, `Shift+`, `Alt+`, `Meta+` in that order: "Space", "KeyQ", "Shift+ArrowRight",
 * "Digit1", "Comma". A shortcut does one of: a built-in `action`, any registered `command` (with
 * `params`), or `run`. One with none of them only takes its keys away.
 *
 * Who wins a key, highest first: what was `add`ed (the newest first), the `shortcuts` prop, the
 * `keyboard` map, the defaults. A key a higher layer takes is gone from every lower binding, and
 * the help sheet (?) lists what is left — custom ones included. Two bindings in ONE layer that
 * claim the same key are a mistake, reported by `conflicts()` (and once on the console).
 *
 * Keys that never reach this list: `g` (vim's g / gg, read before it — a custom binding on
 * "KeyG" does take it), the presenter's L (layout), Escape inside an open menu, and any key while
 * focus labels (F), the jump prompt or search are open — those read keys as text.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Shortcut {
  /** `KeyboardEvent.code` combos: "KeyQ", "Shift+KeyQ", "Ctrl+Shift+KeyK", "Space", "Digit1". */
  keys: string[];
  /** A built-in action (the same command its default key runs). */
  action?: KeyAction | null;
  /** Or any command in the registry ("view.overview", "present.timer", one of your own). */
  command?: string;
  /** Parameters for the command. */
  params?: Record<string, unknown>;
  /** Or a function. */
  run?: (event: KeyboardEvent) => void;
  /** What it does, for the help sheet. */
  description: string;
  /** How the keys are printed in the help sheet; default from `keys`. */
  label?: string;
  /** Pages it works on (default: every page that has the deck's keyboard — play and presenter). */
  views?: string[];
}

export type ShortcutsInput = Shortcut[] | ((defaults: Shortcut[]) => Shortcut[]);

/** Types a shortcuts function: `shortcuts={defineShortcuts((defaults) => [...])}`. */
export function defineShortcuts(input: ShortcutsInput): ShortcutsInput {
  return input;
}

/** One binding as resolved: the keys it still owns, and where it came from. */
export interface ResolvedShortcut extends Shortcut {
  layer: "added" | "prop" | "config" | "default";
  /** Not a default: an addition or a change. */
  custom: boolean;
}

export interface ShortcutConflict {
  key: string;
  /** Descriptions of the bindings that claimed it in one layer; the first one wins. */
  claimedBy: string[];
}

export interface ShortcutRegistry {
  /** Layer shortcuts over everything else; the returned function removes exactly these. */
  add(shortcuts: Shortcut | Shortcut[]): () => void;
  /** The `shortcuts` prop and the `keyboard` config map (the runtime sets these). */
  configure(options: { prop?: ShortcutsInput | null; keyboard?: unknown }): void;
  /** Every binding with the keys it still owns, highest layer first; empty ones left out. */
  list(): ResolvedShortcut[];
  /** The binding a key event runs on a page, or null. */
  match(event: KeyboardEvent, view?: string): ResolvedShortcut | null;
  /** Keys claimed twice within one layer. */
  conflicts(): ShortcutConflict[];
  onChange(listener: () => void): () => void;
}

const KEY_NAMES: Record<string, string> = {
  ArrowRight: "→",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "Space",
  Escape: "Esc",
  Slash: "/",
  Backslash: "\\",
  Period: ".",
  Comma: ",",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Enter: "Enter",
  Backspace: "Backspace",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

/** "Shift+KeyQ" → "Shift Q", "Digit1" → "1", "ArrowRight" → "→". */
export function keyLabel(combo: string): string {
  return combo
    .split("+")
    .map((part) => {
      if (KEY_NAMES[part]) return KEY_NAMES[part];
      const key = /^Key([A-Z])$/.exec(part);
      if (key) return key[1]!;
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(part);
      if (digit) return digit[1]!;
      return part;
    })
    .join(" ");
}

/** The defaults, as shortcuts (what a shortcuts function receives). */
export function defaultShortcuts(bindings: readonly KeyBinding[] = KEY_BINDINGS): Shortcut[] {
  return bindings.map((b) => ({
    keys: [...b.keys],
    action: b.action,
    description: b.description,
    label: b.label,
  }));
}

/**
 * reveal.js's numeric `keyCode`s (its `keyboard: { 13: "next" }` keys) as `KeyboardEvent.code`
 * names, for the keys a slide deck binds: letters, digits, the arrows, the editing and function
 * keys, punctuation on a US layout. A code names the physical key, as `keyCode` did.
 */
const KEY_CODES: Record<number, string> = {
  8: "Backspace",
  9: "Tab",
  13: "Enter",
  27: "Escape",
  32: "Space",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  186: "Semicolon",
  187: "Equal",
  188: "Comma",
  189: "Minus",
  190: "Period",
  191: "Slash",
  192: "Backquote",
  219: "BracketLeft",
  220: "Backslash",
  221: "BracketRight",
  222: "Quote",
};
for (let n = 0; n <= 9; n++) {
  KEY_CODES[48 + n] = `Digit${n}`;
  KEY_CODES[96 + n] = `Numpad${n}`;
}
for (let n = 0; n < 26; n++) KEY_CODES[65 + n] = `Key${String.fromCharCode(65 + n)}`;
for (let n = 1; n <= 12; n++) KEY_CODES[111 + n] = `F${n}`;

/** A `keyboard` map's key as a combo: "KeyQ" as it is, reveal's 13 (or "13") as "Enter". */
export function keyFromConfig(key: string): string | null {
  if (!/^\d+$/.test(key)) return key || null;
  return KEY_CODES[Number(key)] ?? null;
}

/**
 * reveal.js's API method names, as its `keyboard` map names them, and the action that does the
 * same here. `slide` (it needs a slide number) and anything else reveal-only have none.
 */
const REVEAL_METHODS: Record<string, KeyAction> = {
  next: "next",
  prev: "prev",
  left: "left",
  right: "right",
  up: "up",
  down: "down",
  navigateNext: "next",
  navigatePrev: "prev",
  navigateLeft: "left",
  navigateRight: "right",
  navigateUp: "up",
  navigateDown: "down",
  nextFragment: "next",
  prevFragment: "prev",
  toggleOverview: "overview",
  togglePause: "pause",
  toggleHelp: "help",
  toggleAutoSlide: "autoSlide",
  toggleJumpToSlide: "jump",
};

const ACTIONS = new Set<string>(KEY_BINDINGS.map((b) => b.action));

/**
 * A `keyboard` map's value as what it runs: a Kadal action (`overview`), one of reveal.js's method
 * names (`toggleOverview`), or a command id (`view.overview`, anything with a dot). Null when it
 * names none of them.
 */
export function actionFromConfig(
  value: string,
): { action: KeyAction } | { command: string } | null {
  if (ACTIONS.has(value)) return { action: value as KeyAction };
  if (Object.hasOwn(REVEAL_METHODS, value)) return { action: REVEAL_METHODS[value]! };
  if (/^[\w-]+(\.[\w-]+)+$/.test(value)) return { command: value };
  return null;
}

/**
 * The `keyboard` config map as shortcuts. Kadal's form, `{ KeyQ: "overview", KeyD: null }`, and
 * reveal.js's, `{ 13: "next", 32: null, 79: "toggleOverview", 27: () => {} }` (keyCodes, its
 * method names, a function from deck.config.ts). `null` or `false` takes the key away. A key or a
 * name it cannot read is skipped (and `kadal-deck import reveal` reports it).
 */
export function keyboardMap(value: unknown): Shortcut[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: Shortcut[] = [];
  for (const [raw, action] of Object.entries(value as Record<string, unknown>)) {
    const key = keyFromConfig(raw);
    if (!key) continue;
    if (action === null || action === false)
      out.push({ keys: [key], action: null, description: "" });
    else if (typeof action === "function")
      out.push({
        keys: [key],
        run: (event) => (action as (e: KeyboardEvent) => void)(event),
        description: action.name ? `${action.name}()` : "A function of the deck's",
      });
    else if (typeof action === "string") {
      const does = actionFromConfig(action);
      if (!does) continue;
      const description =
        "action" in does
          ? (KEY_BINDINGS.find((b) => b.action === does.action)?.description ?? action)
          : does.command;
      out.push({ keys: [key], ...does, description });
    }
  }
  return out;
}

const SAME = (a: Shortcut, b: Shortcut) =>
  a.action === b.action &&
  a.command === b.command &&
  a.run === b.run &&
  JSON.stringify(a.params ?? null) === JSON.stringify(b.params ?? null);

/**
 * Layers → resolved bindings. Exported for tests and for tools that print the keymap; the
 * registry below is what the runtime uses.
 */
export function resolveShortcuts(layers: {
  /** Layers laid over everything, highest first (each `add` call is one). */
  added?: Shortcut[][];
  prop?: ShortcutsInput | null;
  keyboard?: unknown;
  defaults?: Shortcut[];
}): { list: ResolvedShortcut[]; conflicts: ShortcutConflict[] } {
  const defaults = layers.defaults ?? defaultShortcuts();
  // A function replaces the defaults with what it returns; an array is laid over them.
  const replaced = typeof layers.prop === "function" ? layers.prop(defaults.map(copy)) : null;
  const ordered: Array<[ResolvedShortcut["layer"], Shortcut[]]> = [
    ...(layers.added ?? []).map((l): [ResolvedShortcut["layer"], Shortcut[]] => ["added", l]),
    ["prop", Array.isArray(layers.prop) ? layers.prop : []],
    ["config", keyboardMap(layers.keyboard)],
    ["default", replaced ?? defaults],
  ];
  const taken = new Set<string>();
  const list: ResolvedShortcut[] = [];
  const conflicts: ShortcutConflict[] = [];
  for (const [layer, shortcuts] of ordered) {
    const mine = new Map<string, string[]>();
    for (const s of shortcuts) {
      const keys = (s.keys ?? []).filter((k) => typeof k === "string" && k);
      const own: string[] = [];
      for (const k of keys) {
        const who = mine.get(k);
        if (who) who.push(s.description || "(unbound)");
        else mine.set(k, [s.description || "(unbound)"]);
        if (!taken.has(k) && !own.includes(k)) own.push(k);
      }
      // A replaced default that is unchanged is still a default, as far as anyone reading is
      // concerned; one with new keys or a new action is a change.
      const isDefault =
        layer === "default" &&
        (!replaced || defaults.some((d) => SAME(d, s) && sameKeys(d.keys, keys)));
      list.push({
        ...s,
        keys: own,
        label: own.length === keys.length ? s.label : undefined,
        layer,
        custom: !isDefault,
      });
    }
    for (const k of mine.keys()) taken.add(k);
    for (const [key, claimedBy] of mine)
      if (claimedBy.length > 1) conflicts.push({ key, claimedBy });
  }
  return {
    list: list.filter((s) => s.keys.length && (s.action || s.command || s.run)),
    conflicts,
  };
}

function copy(s: Shortcut): Shortcut {
  return { ...s, keys: [...s.keys] };
}
function sameKeys(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** The views the deck's keyboard works on, when a shortcut does not say. */
const DEFAULT_VIEWS = ["play", "presenter", "overview", "notes", "notes-edit"];

export function createShortcutRegistry(): ShortcutRegistry {
  const added: Shortcut[][] = [];
  let prop: ShortcutsInput | null = null;
  let keyboard: unknown = null;
  let cache: ReturnType<typeof resolveShortcuts> | null = null;
  const listeners = new Set<() => void>();
  const warned = new Set<string>();
  const changed = () => {
    cache = null;
    for (const l of listeners) l();
  };
  const resolved = () => {
    if (!cache) {
      // Added layers, newest first.
      cache = resolveShortcuts({ added: [...added].reverse(), prop, keyboard });
      for (const c of cache.conflicts) {
        const id = `${c.key}:${c.claimedBy.join("|")}`;
        if (warned.has(id)) continue;
        warned.add(id);
        console.warn(
          `[deck] shortcut ${c.key} is claimed by ${c.claimedBy.map((d) => `"${d}"`).join(" and ")}; the first wins.`,
        );
      }
    }
    return cache;
  };
  return {
    add(shortcuts) {
      const layer = Array.isArray(shortcuts) ? [...shortcuts] : [shortcuts];
      added.push(layer);
      changed();
      return () => {
        const i = added.indexOf(layer);
        if (i === -1) return;
        added.splice(i, 1);
        changed();
      };
    },
    configure(options) {
      const nextProp = options.prop ?? null;
      const nextKeyboard = options.keyboard ?? null;
      if (nextProp === prop && JSON.stringify(nextKeyboard) === JSON.stringify(keyboard)) return;
      prop = nextProp;
      keyboard = nextKeyboard;
      changed();
    },
    list: () => resolved().list,
    match(event, view) {
      const combo = comboOf(event);
      for (const s of resolved().list) {
        if (!s.keys.includes(combo)) continue;
        const views = s.views ?? DEFAULT_VIEWS;
        if (view && !views.includes(view)) continue;
        return s;
      }
      return null;
    },
    conflicts: () => resolved().conflicts,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
