import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import type { SlideMeta } from "../core/model.ts";
import type { SideEditorHandle, SideEditorModule, SlideSourceDraft } from "../core/side-editor.ts";
import { useCommand } from "./commands.ts";
import { type DeckRuntime, useDeck } from "./context.ts";
import { useNav } from "./hooks.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SIDE EDITOR  (`kadal-deck dev` only)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Press E (or the command `view.editor`, or "Edit slide source" in the right-click menu) and the
 * current slide's source opens beside it: its separator, frontmatter, body and notes, exactly as
 * written in deck.mdx (or the file it is included from), in CodeMirror. Cmd/Ctrl+S saves it
 * through the dev server (`/__kadal/source`, vite/source-dev.ts → authoring/edit.ts
 * `writeSlideSource`), which rewrites that slide's lines and no others; the dev server then shows
 * the change — notes at once, anything else with a reload, after which the editor opens again
 * where it was.
 *
 * A save is conflict-safe, like the notes editor's: the text was loaded with a version, and a
 * slide that changed on disk since (edited in another editor) is not overwritten — the panel
 * offers the file's version or a save over it. Unsaved text survives a reload in this tab
 * (sessionStorage), and while there is some the editor stays on its slide when the deck moves.
 *
 * The panel is resizable (drag its left edge, or the arrow keys on it) and the slide shrinks to
 * fit beside it. While the editor has focus the deck's keys are off; Escape hands them back.
 * Neither the panel nor CodeMirror exists in a build: the manifest only has `sourceApi` and
 * `sideEditor` under the dev server.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OPEN_KEY = "kadal-deck:side-editor:open";
const WIDTH_KEY = "kadal-deck:side-editor:width";
const DRAFT_KEY = "kadal-deck:side-editor:draft";
const MIN_WIDTH = 300;
const NARROW = 720;

const storage = (kind: "local" | "session"): Storage | null => {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};
const get = (kind: "local" | "session", key: string): string | null => {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const set = (kind: "local" | "session", key: string, value: string | null) => {
  try {
    if (value === null) storage(kind)?.removeItem(key);
    else storage(kind)?.setItem(key, value);
  } catch {
    /* private mode: the editor works, it just forgets */
  }
};

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const maxWidth = () => Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.7));
const clampWidth = (w: number) => Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(w)));

/** The dev server's slide-source endpoint. */
export interface SourceApi {
  load(index: number): Promise<SlideSourceDraft>;
  save(
    index: number,
    text: string,
    version: string,
  ): Promise<
    | { ok: true; version: string }
    | { ok: false; conflict: SlideSourceDraft }
    | { ok: false; error: string }
  >;
}

export function devSourceApi(api: string): SourceApi {
  return {
    async load(index) {
      const r = await fetch(`${api}?slide=${index}`, { headers: { Accept: "application/json" } });
      const j = (await r.json().catch(() => ({}))) as Partial<SlideSourceDraft> & {
        error?: string;
      };
      if (!r.ok || typeof j.text !== "string" || typeof j.version !== "string")
        throw new Error(j.error ?? `The dev server answered ${r.status}.`);
      return j as SlideSourceDraft;
    },
    async save(index, text, version) {
      let r: Response;
      try {
        r = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide: index, text, version }),
        });
      } catch {
        return { ok: false, error: "The dev server did not answer. Is `kadal-deck dev` running?" };
      }
      const j = (await r.json().catch(() => ({}))) as Partial<SlideSourceDraft> & {
        error?: string;
      };
      if (r.ok && typeof j.version === "string") return { ok: true, version: j.version };
      if (r.status === 409 && typeof j.text === "string")
        return { ok: false, conflict: j as SlideSourceDraft };
      return { ok: false, error: j.error ?? `The dev server answered ${r.status}.` };
    },
  };
}

interface Draft extends SlideSourceDraft {
  index: number;
  /** The text as loaded (or last saved): the editor is dirty when it differs. */
  base: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; theirs: SlideSourceDraft }
  | { kind: "restored" };

const toggle = z
  .object({ on: z.boolean().optional().describe("true to open, false to close; omit to toggle") })
  .strict();

/** The current slide's manifest entry. */
function currentMeta(deck: DeckRuntime, h: number, v: number): SlideMeta | null {
  return deck.columns[h]?.slides[v] ?? null;
}

/**
 * The side editor's switch (command, key, menu item) and, while open, its panel. Renders nothing
 * outside `kadal-deck dev` or off the play view.
 */
export function SideEditor() {
  const deck = useDeck();
  const { manifest } = deck;
  const enabled =
    deck.mode === "play" && !deck.projector && !!manifest.sourceApi && !!manifest.sideEditor;
  const [open, setOpen] = useState(() => enabled && get("session", OPEN_KEY) === "1");
  const api = useMemo(
    () => (manifest.sourceApi ? devSourceApi(manifest.sourceApi) : null),
    [manifest.sourceApi],
  );

  useEffect(() => {
    if (enabled) set("session", OPEN_KEY, open ? "1" : null);
  }, [enabled, open]);

  useCommand(
    enabled
      ? {
          id: "view.editor",
          title: "Side editor",
          description:
            "Open or close the editor beside the slide: the current slide's source (frontmatter, body, notes), saved back into the deck file. Only under `kadal-deck dev`.",
          group: "view",
          keys: "E",
          params: toggle,
          run: (p: z.infer<typeof toggle>) => setOpen((o) => p.on ?? !o),
        }
      : null,
  );
  useEffect(() => {
    if (!enabled) return;
    const offKey = deck.shortcuts.add({
      keys: ["KeyE"],
      command: "view.editor",
      description: "Edit this slide's source",
      views: ["play"],
    });
    const offMenu = deck.menu.add({
      id: "view.editor",
      label: "Edit slide source",
      icon: "square-pen",
      keys: "E",
      command: "view.editor",
    });
    return () => {
      offKey();
      offMenu();
    };
  }, [enabled, deck.shortcuts, deck.menu]);

  if (!enabled || !open) return null;
  return (
    <SideEditorPanel
      deck={deck}
      api={api!}
      load={manifest.sideEditor!}
      onClose={() => setOpen(false)}
    />
  );
}

function SideEditorPanel({
  deck,
  api,
  load,
  onClose,
}: {
  deck: DeckRuntime;
  api: SourceApi;
  load: () => Promise<SideEditorModule>;
  onClose: () => void;
}) {
  const { h, v } = useNav((s) => ({ h: s.h, v: s.v }));
  const meta = currentMeta(deck, h, v);
  const [mod, setMod] = useState<SideEditorModule | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [width, setWidth] = useState(() => clampWidth(Number(get("local", WIDTH_KEY)) || 480));
  const [narrow, setNarrow] = useState(() => window.innerWidth <= NARROW);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<SideEditorHandle | null>(null);
  const grip = useRef<HTMLDivElement>(null);
  const latest = useRef({ draft, text, status });
  latest.current = { draft, text, status };
  const dirty = !!draft && text !== draft.base;

  // CodeMirror, the first time the panel opens (its styles come with it).
  useEffect(() => {
    let alive = true;
    load().then(
      (m) => alive && setMod(m),
      (e: unknown) => alive && setFailed(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [load]);

  // The slide beside the editor: keep the room, give it back on close.
  useEffect(() => {
    const onResize = () => {
      setNarrow(window.innerWidth <= NARROW);
      setWidth((w) => clampWidth(w));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    deck.stageInset.set({ right: narrow ? 0 : width, bottom: 0, chrome: true });
    set("local", WIDTH_KEY, String(width));
  }, [deck.stageInset, width, narrow]);
  useEffect(() => () => deck.stageInset.set({ right: 0, bottom: 0 }), [deck.stageInset]);

  // Load the current slide — unless there is unsaved text for another one.
  const fetchSlide = useCallback(
    async (index: number, opts: { force?: boolean } = {}) => {
      const cur = latest.current;
      if (!opts.force && cur.draft && cur.text !== cur.draft.base && cur.draft.index !== index)
        return;
      setStatus({ kind: "loading" });
      try {
        const src = await api.load(index);
        const next: Draft = { ...src, index, base: src.text };
        // Unsaved text from before a reload, for this very slide: bring it back.
        const kept = readDraft();
        if (kept && kept.index === index && kept.text !== src.text) {
          setDraft(kept.version === src.version ? next : { ...next, version: kept.version });
          setText(kept.text);
          editor.current?.setText(kept.text);
          setStatus(
            kept.version === src.version ? { kind: "restored" } : { kind: "conflict", theirs: src },
          );
          return;
        }
        setDraft(next);
        setText(src.text);
        editor.current?.setText(src.text);
        setStatus({ kind: "idle" });
      } catch (e) {
        setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [api],
  );

  const index = meta?.index ?? null;
  useEffect(() => {
    if (index !== null && mod) void fetchSlide(index);
  }, [index, mod, fetchSlide]);

  // Mount CodeMirror once the module is here.
  useEffect(() => {
    if (!mod || !host.current) return;
    const handle = mod.createSideEditor(host.current, {
      text: latest.current.text,
      label: "Slide source",
      onChange: (t) => {
        setText(t);
        // A refused save's message stays until the text changes.
        setStatus((st) => (st.kind === "error" || st.kind === "saved" ? { kind: "idle" } : st));
        const d = latest.current.draft;
        if (d) writeDraft(t === d.base ? null : { index: d.index, text: t, version: d.version });
      },
      onSave: () => void saveRef.current(),
      // The deck's keys come back with the focus.
      onEscape: () => (document.activeElement as HTMLElement | null)?.blur?.(),
    });
    editor.current = handle;
    handle.focus();
    return () => {
      handle.destroy();
      editor.current = null;
    };
    // The editor is created once per module; text changes go through `setText`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod]);

  const saving = useRef(false);
  const save = async (overwrite?: SlideSourceDraft) => {
    const d = latest.current.draft;
    if (!d || saving.current) return;
    const body = latest.current.text;
    if (!overwrite && body === d.base) return;
    saving.current = true;
    setStatus({ kind: "saving" });
    const r = await api.save(d.index, body, overwrite?.version ?? d.version).finally(() => {
      saving.current = false;
    });
    if (r.ok) {
      setDraft({ ...d, base: body, version: r.version });
      writeDraft(null);
      setStatus({ kind: "saved" });
    } else if ("conflict" in r) setStatus({ kind: "conflict", theirs: r.conflict });
    else setStatus({ kind: "error", message: r.error });
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const takeTheirs = (theirs: SlideSourceDraft) => {
    const d = latest.current.draft;
    if (!d) return;
    setDraft({ ...d, ...theirs, base: theirs.text });
    setText(theirs.text);
    editor.current?.setText(theirs.text);
    writeDraft(null);
    setStatus({ kind: "idle" });
  };
  const discard = () => {
    const d = latest.current.draft;
    if (!d) return;
    writeDraft(null);
    if (index !== null && index !== d.index) void fetchSlide(index, { force: true });
    else {
      setText(d.base);
      editor.current?.setText(d.base);
      setStatus({ kind: "idle" });
    }
  };
  const goToDraft = () => {
    const d = latest.current.draft;
    if (!d) return;
    for (const col of deck.columns) {
      const at = col.slides.findIndex((s) => s.index === d.index);
      if (at >= 0) return deck.actions.goto(col.h, at, 0);
    }
  };

  // Resizing: drag the left edge, or arrow keys on it (Shift for bigger steps).
  const onGripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.dataset.dragging = "";
    const move = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      delete el.dataset.dragging;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const onGripKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === "ArrowLeft") setWidth((w) => clampWidth(w + step));
    else if (e.key === "ArrowRight") setWidth((w) => clampWidth(w - step));
    else if (e.key === "Home") setWidth(clampWidth(maxWidth()));
    else if (e.key === "End") setWidth(MIN_WIDTH);
    else return;
    e.preventDefault();
  };

  const away = !!draft && dirty && index !== null && draft.index !== index;
  const shownNumber = draft ? draft.index + 1 : index !== null ? index + 1 : null;
  const busy = status.kind === "saving" || status.kind === "loading";

  return (
    <aside
      className="deck-side-editor"
      aria-label="Slide source editor"
      data-deck-own-keys=""
      style={{ width: narrow ? undefined : width }}
      onKeyDown={(e) => {
        // The panel's own keys never reach the deck (buttons, the grip).
        e.stopPropagation();
        // Cmd/Ctrl+S anywhere in the panel; CodeMirror handles (and prevents) its own.
        if (!e.defaultPrevented && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div
        ref={grip}
        className="deck-side-editor-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the editor"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth()}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onGripDown}
        onKeyDown={onGripKey}
      />
      <header className="deck-side-editor-head">
        <div className="deck-side-editor-title" title={draft ? `${draft.file}:${draft.line}` : ""}>
          <b>Slide {shownNumber ?? "–"}</b>
          {draft ? (
            <span>
              {draft.file}:{draft.line}
              {dirty ? " · edited" : ""}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          data-primary=""
          disabled={!dirty || busy}
          onClick={() => void save()}
          aria-keyshortcuts="Meta+S Control+S"
        >
          {status.kind === "saving" ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} aria-label="Close the editor">
          Close
        </button>
      </header>
      {away ? (
        <div className="deck-side-editor-banner" role="status">
          <p>
            Unsaved changes to slide {draft!.index + 1}. The editor stays on it until you save or
            discard them.
          </p>
          <button type="button" onClick={goToDraft}>
            Go to slide {draft!.index + 1}
          </button>
          <button type="button" onClick={discard}>
            Discard
          </button>
        </div>
      ) : null}
      {status.kind === "conflict" ? (
        <div className="deck-side-editor-banner" role="alert">
          <p>This slide changed in the file since it was opened here.</p>
          <button type="button" onClick={() => takeTheirs(status.theirs)}>
            Use the file's version
          </button>
          <button type="button" onClick={() => void save(status.theirs)}>
            Save mine over it
          </button>
        </div>
      ) : null}
      {status.kind === "error" || failed ? (
        <div className="deck-side-editor-banner" data-kind="error" role="alert">
          <p>
            {failed
              ? `The editor could not load: ${failed}`
              : (status as { message: string }).message}
          </p>
        </div>
      ) : null}
      <div className="deck-side-editor-body" ref={host} />
      <footer className="deck-side-editor-foot" aria-live="polite">
        <span>
          {status.kind === "saved"
            ? "Saved. The slide updates in a moment."
            : status.kind === "restored"
              ? "Unsaved changes from before the reload, restored."
              : status.kind === "loading"
                ? "Loading…"
                : dirty
                  ? "Unsaved changes"
                  : "Saved in the file"}
        </span>
        <span>
          <kbd>{MAC ? "⌘S" : "Ctrl+S"}</kbd> save · <kbd>Esc</kbd> back to the deck
        </span>
      </footer>
    </aside>
  );
}

interface StoredDraft {
  index: number;
  text: string;
  version: string;
}

function readDraft(): StoredDraft | null {
  const raw = get("session", DRAFT_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as StoredDraft;
    return typeof d.index === "number" && typeof d.text === "string" ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(d: StoredDraft | null) {
  set("session", DRAFT_KEY, d ? JSON.stringify(d) : null);
}
