/**
 * Keyboard bindings: reveal.js's and Slidev's, merged. A deck may override any binding through
 * `keyboard: { "KeyX": "action" | null }` in its config; `null` unbinds. Actions are names the
 * runtime dispatches; the map is data so the help overlay can print it.
 */
export type KeyAction =
  | "next"
  | "prev"
  | "nextSlide"
  | "prevSlide"
  | "left"
  | "right"
  | "up"
  | "down"
  | "first"
  | "last"
  | "overview"
  | "fullscreen"
  | "pause"
  | "presenter"
  | "help"
  | "jump"
  | "search"
  | "autoSlide"
  | "draw"
  | "pointer"
  | "clearDrawing"
  | "undoDrawing"
  | "colorScheme"
  | "escape"
  | "zoomOut"
  | "hints"
  | "themeMenu";

export interface KeyBinding {
  keys: string[];
  action: KeyAction;
  description: string;
  /** Shown in the help overlay under this label. */
  label: string;
}

/** `code` values (physical keys), with `Shift+`/`Alt+`/`Ctrl+`/`Meta+` prefixes. */
export const KEY_BINDINGS: KeyBinding[] = [
  {
    keys: ["Space", "KeyJ", "KeyN", "PageDown"],
    action: "next",
    label: "Space J N",
    description: "Next step or slide, through vertical stacks",
  },
  {
    keys: ["KeyK", "KeyP", "PageUp", "Shift+Space", "Backspace"],
    action: "prev",
    label: "K P Shift Space",
    description: "Previous step or slide",
  },
  {
    keys: ["ArrowRight", "KeyL"],
    action: "right",
    label: "→ L",
    description: "Next step, then the next column",
  },
  {
    keys: ["ArrowLeft", "KeyH"],
    action: "left",
    label: "← H",
    description: "Previous step, then the previous column",
  },
  { keys: ["ArrowDown"], action: "down", label: "↓", description: "Slide beneath" },
  { keys: ["ArrowUp"], action: "up", label: "↑", description: "Slide above" },
  {
    keys: ["Shift+ArrowRight"],
    action: "nextSlide",
    label: "Shift →",
    description: "Next slide, skipping steps",
  },
  {
    keys: ["Shift+ArrowLeft"],
    action: "prevSlide",
    label: "Shift ←",
    description: "Previous slide, skipping steps",
  },
  {
    keys: ["Home", "Shift+ArrowUp"],
    action: "first",
    label: "gg Home",
    description: "First slide",
  },
  {
    keys: ["End", "Shift+ArrowDown", "Shift+KeyG"],
    action: "last",
    label: "G End",
    description: "Last slide",
  },
  { keys: ["Escape", "KeyO"], action: "overview", label: "Esc O", description: "Overview" },
  {
    keys: ["KeyF"],
    action: "hints",
    label: "F",
    description: "Focus: label every link, control and embedded page — type a label to use it",
  },
  { keys: ["Shift+KeyF"], action: "fullscreen", label: "Shift F", description: "Fullscreen" },
  {
    keys: ["KeyB", "Period"],
    action: "pause",
    label: "B .",
    description: "Pause: black out the screen",
  },
  { keys: ["KeyS"], action: "presenter", label: "S", description: "Open the presenter view" },
  { keys: ["Shift+Slash"], action: "help", label: "?", description: "This help" },
  {
    keys: ["KeyG", "Shift+Semicolon"],
    action: "jump",
    label: ": g",
    description: "Jump to a slide by number (:12), or gg for the first",
  },
  {
    keys: ["Slash", "Ctrl+Shift+KeyF", "Meta+Shift+KeyF"],
    action: "search",
    label: "/ Ctrl Shift F",
    description: "Search the deck",
  },
  { keys: ["KeyA"], action: "autoSlide", label: "A", description: "Pause or resume auto-slide" },
  { keys: ["KeyC"], action: "draw", label: "C", description: "Draw on the slide" },
  { keys: ["KeyX"], action: "pointer", label: "X", description: "Laser pointer" },
  {
    keys: ["Shift+KeyC"],
    action: "clearDrawing",
    label: "Shift C",
    description: "Clear the slide's drawing",
  },
  {
    keys: ["Ctrl+KeyZ", "Meta+KeyZ"],
    action: "undoDrawing",
    label: "Ctrl Z",
    description: "Undo the last stroke",
  },
  { keys: ["KeyD"], action: "colorScheme", label: "D", description: "Dark or light" },
  { keys: ["KeyT"], action: "themeMenu", label: "T", description: "Theme and light or dark" },
];

const MODIFIERS = ["Ctrl", "Shift", "Alt", "Meta"] as const;

export function comboOf(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Meta");
  return [...mods, e.code].join("+");
}

/** Resolve a keyboard event to an action, honouring overrides. Returns null when unbound. */
export function actionFor(
  e: KeyboardEvent,
  overrides: Record<string, KeyAction | null> = {},
): KeyAction | null {
  const combo = comboOf(e);
  if (combo in overrides) return overrides[combo];
  // A plain key with only Shift is also matched by "Shift+Key" bindings above; a bare binding must
  // not fire when Ctrl/Alt/Meta are held (browser shortcuts).
  for (const b of KEY_BINDINGS) {
    if (b.keys.includes(combo)) return b.action;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return null;
}

/** Typing in a field must never turn pages. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export { MODIFIERS };
