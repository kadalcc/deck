import { z } from "zod";

/**
 * Commands: everything a person can do to a running deck, as data.
 *
 * The keyboard, the toolbar buttons, the phone remote, the room and an AI agent all reach the deck
 * through this one registry, so a new control is automatically something the others can do too.
 * A command has a stable id ("nav.next"), words for a human and for a model, a zod schema for its
 * parameters (exported as JSON Schema for tool calling) and a `run`.
 *
 * Built-in commands are registered by the runtime (react/commands.ts); a layer that owns its state
 * (the drawing layer, the laser, the narrator) registers its own while it is mounted. Registering
 * the same id again shadows the earlier one until the newer unregisters — the presenter's stage
 * canvas and the play view can both mount a drawing layer, and the one on top is the one that acts.
 */

export type CommandGroup =
  | "navigate"
  | "present"
  | "draw"
  | "view"
  | "room"
  | "narrate"
  | "query";

/** Who asked. Lets a listener tell a key press from a phone or a model (and avoid echoes). */
export type CommandOrigin = "keyboard" | "ui" | "remote" | "agent" | "api" | "room";

export interface CommandSpec<P extends z.ZodType = z.ZodType> {
  /** Stable, dotted: "nav.next", "draw.clear", "deck.state". */
  id: string;
  title: string;
  /** One or two sentences a model can act on: what it does and when to use it. */
  description: string;
  group: CommandGroup;
  /** Parameters, validated before `run`; omit for none. */
  params?: P;
  /** The keys bound to it, as the help overlay prints them. */
  keys?: string;
  /** Reads, changes nothing: safe for an agent to call without asking. */
  readOnly?: boolean;
  /** Whether it can run here and now (switched off by config, wrong window, nothing to undo). */
  enabled?: () => boolean;
  run: (params: z.infer<P>, origin: CommandOrigin) => unknown;
}

/** A command as it travels: serialisable, with its parameters as JSON Schema. */
export interface CommandInfo {
  id: string;
  title: string;
  description: string;
  group: CommandGroup;
  keys?: string;
  readOnly: boolean;
  enabled: boolean;
  params: Record<string, unknown>;
}

export type CommandResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code: "unknown" | "disabled" | "invalid" | "failed" };

export interface CommandEvent {
  id: string;
  params: unknown;
  origin: CommandOrigin;
  result: CommandResult;
}

export interface CommandRegistry {
  /** Add a command; the returned function removes exactly this registration. */
  register<P extends z.ZodType>(spec: CommandSpec<P>): () => void;
  has(id: string): boolean;
  get(id: string): CommandSpec | undefined;
  /** Every command, sorted by group then id. `all` includes the disabled ones. */
  list(options?: { all?: boolean }): CommandInfo[];
  /** Validate and run. Never throws: a failure comes back as `{ ok: false }`. */
  run(id: string, params?: unknown, origin?: CommandOrigin): Promise<CommandResult>;
  /** Called after every run, successful or not. */
  subscribe(listener: (event: CommandEvent) => void): () => void;
  /** Called when commands are added or removed. */
  onChange(listener: () => void): () => void;
}

const NO_PARAMS = z.object({}).strict();
const GROUP_ORDER: CommandGroup[] = [
  "navigate",
  "present",
  "draw",
  "view",
  "narrate",
  "room",
  "query",
];

/** JSON Schema of a command's parameters: an object schema always, for tool-calling APIs. */
export function paramsSchema(spec: Pick<CommandSpec, "params">): Record<string, unknown> {
  const schema = z.toJSONSchema(spec.params ?? NO_PARAMS, { io: "input" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}

export function createCommandRegistry(): CommandRegistry {
  // id → registrations, newest last; the newest one acts.
  const stacks = new Map<string, CommandSpec[]>();
  const listeners = new Set<(event: CommandEvent) => void>();
  const changeListeners = new Set<() => void>();
  const changed = () => {
    for (const l of changeListeners) l();
  };
  const top = (id: string) => {
    const stack = stacks.get(id);
    return stack?.[stack.length - 1];
  };
  const isEnabled = (spec: CommandSpec) => {
    try {
      return spec.enabled ? spec.enabled() : true;
    } catch {
      return false;
    }
  };
  const emit = (event: CommandEvent) => {
    for (const l of listeners) {
      try {
        l(event);
      } catch {
        // A listener's failure is its own.
      }
    }
  };

  return {
    register(spec) {
      const entry = spec as unknown as CommandSpec;
      const stack = stacks.get(spec.id) ?? [];
      stack.push(entry);
      stacks.set(spec.id, stack);
      changed();
      return () => {
        const current = stacks.get(spec.id);
        if (!current) return;
        const i = current.lastIndexOf(entry);
        if (i === -1) return;
        current.splice(i, 1);
        if (!current.length) stacks.delete(spec.id);
        changed();
      };
    },
    has: (id) => stacks.has(id),
    get: (id) => top(id),
    list(options = {}) {
      const out: CommandInfo[] = [];
      for (const id of stacks.keys()) {
        const spec = top(id)!;
        const enabled = isEnabled(spec);
        if (!enabled && !options.all) continue;
        out.push({
          id: spec.id,
          title: spec.title,
          description: spec.description,
          group: spec.group,
          ...(spec.keys ? { keys: spec.keys } : {}),
          readOnly: !!spec.readOnly,
          enabled,
          params: paramsSchema(spec),
        });
      }
      return out.sort(
        (a, b) =>
          GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.id.localeCompare(b.id),
      );
    },
    async run(id, params, origin = "api") {
      const spec = top(id);
      let result: CommandResult;
      if (!spec) result = { ok: false, code: "unknown", error: `No command "${id}".` };
      else if (!isEnabled(spec))
        result = { ok: false, code: "disabled", error: `"${id}" is not available right now.` };
      else {
        const parsed = (spec.params ?? NO_PARAMS).safeParse(params ?? {});
        if (!parsed.success)
          result = { ok: false, code: "invalid", error: z.prettifyError(parsed.error) };
        else {
          try {
            const value = await spec.run(parsed.data, origin);
            result = { ok: true, value: value === undefined ? null : value };
          } catch (err) {
            result = {
              ok: false,
              code: "failed",
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
      }
      emit({ id, params: params ?? {}, origin, result });
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
}

/** The command each keyboard action runs (see core/keyboard.ts). */
export const KEY_COMMANDS = {
  next: "nav.next",
  prev: "nav.prev",
  nextSlide: "nav.nextSlide",
  prevSlide: "nav.prevSlide",
  left: "nav.left",
  right: "nav.right",
  up: "nav.up",
  down: "nav.down",
  first: "nav.first",
  last: "nav.last",
  overview: "view.overview",
  fullscreen: "view.fullscreen",
  pause: "present.blackout",
  presenter: "view.presenter",
  help: "view.help",
  jump: "view.jump",
  search: "view.search",
  autoSlide: "present.autoSlide",
  draw: "draw.toggle",
  pointer: "present.pointer",
  // The drawing layer reads these two keys itself, and only while the pen is on.
  clearDrawing: null,
  undoDrawing: null,
  colorScheme: "view.colorScheme",
  escape: null,
  zoomOut: "view.zoomOut",
  hints: "view.hints",
  themeMenu: "view.themeMenu",
  narrate: "narrate.toggle",
  settings: "view.settings",
  contextMenu: "view.contextMenu",
  camera: "media.camera",
} as const;
