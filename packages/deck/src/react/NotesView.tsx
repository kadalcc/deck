import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "../components/bling.tsx";
import type { SlideMeta } from "../core/model.ts";
import { CLICK_MARKER, currentPart } from "../core/notes-markers.ts";
import { type NotesDraft, useNotesEditor, useSlideNotes } from "./notes.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE SLIDE'S NOTES  —  shown by step, and edited in place
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The presenter's notes panel, every entry of /notes, the notes beside each slide on /overview
 * and each box of /notes-edit are this component.
 *
 * Shown: the notes as rendered Markdown, cut at their `[click]` / `[click:N]` markers into the
 * parts each step reveals (core/notes-markers.ts). On the slide being presented, the part for the
 * current step is marked, the ones before it are dimmed, the ones after it plain, and the panel
 * keeps the current part in view. Each marker is a button: it jumps the deck to that step.
 *
 * Edited, where the deck has a `NotesEditor` (react/notes.ts — `kadal-deck dev`, or a host's):
 * the Edit button or a double-click turns the panel into the notes' Markdown source. Cmd/Ctrl+S
 * or leaving the field saves, Escape puts it back. A save that finds the notes changed meanwhile
 * (in an editor, in another window) does not overwrite them: it offers the file's version or
 * yours. Without an editor nothing offers to edit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface NotesViewProps {
  meta: SlideMeta;
  /** The step being shown, when this is the slide being presented; null shows no step. */
  click: number | null;
  /** Jump the deck to a step of this slide (a marker's button); none makes markers plain. */
  onJump?: (click: number) => void;
  fontSize?: number;
  /** Buttons of the caller's for the tool row (the presenter's A− A+). */
  tools?: ReactNode;
  /** No tool row at all, and no double-click to edit (the batch editor brings its own). */
  bare?: boolean;
  /** Start in the source editor and stay there, saving as you pause typing (the batch editor). */
  alwaysEditing?: boolean;
  /** What to say when there are no notes. */
  empty?: string;
  /**
   * Where the current part is kept in view: the panel's own scroll (the default), or the page
   * (/notes, where the whole page scrolls).
   */
  scroll?: "panel" | "page";
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict"; theirs: NotesDraft }
  | { kind: "error"; message: string };

export function NotesView({
  meta,
  click,
  onJump,
  fontSize,
  tools,
  bare = false,
  alwaysEditing = false,
  empty = "No notes for this slide.",
  scroll = "panel",
}: NotesViewProps) {
  const editor = useNotesEditor();
  const { Notes, revision } = useSlideNotes(meta);
  const body = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const base = useRef<NotesDraft | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const saving = useRef(false);

  const begin = useCallback(async () => {
    if (!editor) return;
    setStatus({ kind: "loading" });
    try {
      const d = await editor.load(meta);
      base.current = d;
      setDraft(d.text);
      setEditing(true);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [editor, meta]);

  // The batch editor opens straight into the source.
  useEffect(() => {
    if (alwaysEditing && editor && !editing && status.kind === "idle") void begin();
  }, [alwaysEditing, editor, editing, status.kind, begin]);
  // Another slide in the same panel (the presenter moved on): leave the editor, keep nothing.
  useEffect(() => {
    if (alwaysEditing) return;
    setEditing(false);
    setStatus({ kind: "idle" });
  }, [meta, alwaysEditing]);

  const save = useCallback(
    async (text: string, version?: string): Promise<boolean> => {
      if (!editor || !base.current || saving.current) return false;
      if (version === undefined && text === base.current.text) return true;
      saving.current = true;
      setStatus({ kind: "saving" });
      const result = await editor.save(meta, text, version ?? base.current.version);
      saving.current = false;
      if (result.ok) {
        base.current = { text, version: result.version };
        setStatus({ kind: "saved" });
        return true;
      }
      if ("conflict" in result) setStatus({ kind: "conflict", theirs: result.conflict });
      else setStatus({ kind: "error", message: result.error });
      return false;
    },
    [editor, meta],
  );

  const finish = async () => {
    if (await save(draft)) {
      if (!alwaysEditing) setEditing(false);
    }
  };
  const cancel = () => {
    setDraft(base.current?.text ?? "");
    setStatus({ kind: "idle" });
    if (!alwaysEditing) setEditing(false);
  };

  // The batch editor saves a moment after typing stops.
  useEffect(() => {
    if (!alwaysEditing || !editing || !base.current || draft === base.current.text) return;
    const t = setTimeout(() => void save(draft), 800);
    return () => clearTimeout(t);
  }, [alwaysEditing, editing, draft, save]);

  // "Saved" fades back to nothing.
  useEffect(() => {
    if (status.kind !== "saved") return;
    const t = setTimeout(() => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)), 1600);
    return () => clearTimeout(t);
  }, [status]);

  // The source grows with what is in it.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, editing]);
  useEffect(() => {
    if (editing && !alwaysEditing) area.current?.focus();
  }, [editing, alwaysEditing]);

  // Cut the rendered notes at their markers (once per render of the notes).
  useEffect(() => {
    const el = body.current;
    if (!el || editing) return;
    markParts(el, !!onJump);
  }, [Notes, revision, editing, onJump]);

  // Mark past / current / future, and keep the current part in view.
  useEffect(() => {
    const el = body.current;
    if (!el || editing) return;
    const steps = (el.dataset.steps ?? "0").split(",").map(Number);
    const now = click === null ? -1 : currentPart(steps, click);
    for (const n of el.querySelectorAll<HTMLElement>("[data-part]")) {
      const i = Number(n.dataset.part);
      const state =
        click === null ? "" : i === now ? "current" : steps[i]! <= click ? "past" : "future";
      n.classList.toggle("is-current", state === "current");
      n.classList.toggle("is-past", state === "past");
      n.classList.toggle("is-future", state === "future");
    }
    if (click === null || now < 0) return;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? ("auto" as const)
      : ("smooth" as const);
    const target =
      now === 0
        ? el.querySelector<HTMLElement>('[data-part="0"]')
        : el.querySelector<HTMLElement>(`.deck-click-marker[data-part="${now}"]`);
    if (!target) return;
    if (scroll === "page") {
      target.scrollIntoView({ block: "center", behavior });
      return;
    }
    // Inside the panel only: scrollIntoView would also move whatever is around it.
    const scroller = el.closest<HTMLElement>(".deck-notes-scroll");
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;
    const top =
      now === 0
        ? 0
        : target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop -
          24;
    scroller.scrollTo({ top: Math.max(0, top), behavior });
  }, [click, Notes, revision, editing, scroll]);

  const onBodyClick = (e: React.MouseEvent) => {
    const marker = (e.target as HTMLElement).closest<HTMLElement>(".deck-click-marker[data-click]");
    if (marker && onJump) {
      e.preventDefault();
      onJump(Number(marker.dataset.click));
    }
  };

  const statusText =
    status.kind === "saving"
      ? "Saving…"
      : status.kind === "saved"
        ? "Saved"
        : status.kind === "loading"
          ? "Opening…"
          : status.kind === "error"
            ? status.message
            : null;

  const sourceEditor = (
    <div className="deck-notes-source">
      <textarea
        ref={area}
        value={draft}
        aria-label={`Notes for ${meta.title ?? `slide ${meta.index + 1}`}`}
        placeholder="Write the notes in Markdown. [click] starts the part for the next step."
        spellCheck
        style={fontSize ? { fontSize: Math.max(13, fontSize * 0.8) } : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          // Moving to the editor's own buttons is not leaving it.
          if ((e.relatedTarget as HTMLElement | null)?.closest(".deck-notes-edit-tools")) return;
          if (status.kind !== "conflict") void finish();
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void finish();
          } else if (e.key === "Escape" && !alwaysEditing) {
            e.preventDefault();
            cancel();
          }
        }}
      />
      {status.kind === "conflict" ? (
        <div className="deck-notes-conflict" role="alert">
          <p>These notes changed in the file while you were editing.</p>
          <button
            type="button"
            onClick={() => {
              base.current = status.theirs;
              setDraft(status.theirs.text);
              setStatus({ kind: "idle" });
            }}
          >
            Use the file's
          </button>
          <button
            type="button"
            onClick={() =>
              void save(draft, status.theirs.version).then(
                (ok) => ok && !alwaysEditing && setEditing(false),
              )
            }
          >
            Keep mine
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={["deck-notes-view", editing ? "is-editing" : ""].filter(Boolean).join(" ")}>
      {bare ? null : (
        <div className="deck-notes-tools">
          {tools}
          {editor ? (
            <span className="deck-notes-edit-tools">
              {statusText ? (
                <span className={`deck-notes-status is-${status.kind}`} role="status">
                  {statusText}
                </span>
              ) : null}
              {editing ? (
                <>
                  <button type="button" onClick={() => void finish()} title="Save (Ctrl/Cmd+S)">
                    <Icon name="check" /> Save
                  </button>
                  <button type="button" onClick={cancel} title="Put it back (Esc)">
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void begin()}
                  title="Edit these notes (or double-click them)"
                  aria-label="Edit the notes"
                >
                  <Icon name="pencil" /> Edit
                </button>
              )}
            </span>
          ) : null}
        </div>
      )}
      <div className="deck-notes-scroll">
        {editing ? (
          sourceEditor
        ) : (
          <div
            ref={body}
            className="deck-notes-rendered"
            style={fontSize ? { fontSize } : undefined}
            onClick={onBodyClick}
            onDoubleClick={editor && !bare ? () => void begin() : undefined}
          >
            {Notes ? (
              <Notes key={revision} />
            ) : (
              <p className="deck-muted">
                {empty}
                {editor && !bare ? " Double-click to write some." : ""}
              </p>
            )}
          </div>
        )}
      </div>
      {bare && statusText ? (
        <span className={`deck-notes-status is-${status.kind}`} role="status">
          {statusText}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Wrap the rendered notes' text into parts at their markers: every text node becomes a span with
 * `data-part` (the part it belongs to), and each marker a `.deck-click-marker` — a button when
 * markers jump — with the step it starts as `data-click`. The steps of the parts, in order, go
 * on the root as `data-steps`. Idempotent: notes already cut are left as they are.
 */
function markParts(root: HTMLElement, jump: boolean) {
  if (root.dataset.marked === "1" && root.querySelector("[data-part]")) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const steps = [0];
  let part = 0;
  const wrap = (text: string) => {
    const span = document.createElement("span");
    span.className = "deck-notes-segment";
    span.dataset.part = String(part);
    span.textContent = text;
    return span;
  };
  for (const node of nodes) {
    if (node.parentElement?.closest(".deck-click-marker, .deck-notes-segment")) continue;
    const text = node.data;
    const re = new RegExp(CLICK_MARKER.source, "gi");
    let at = 0;
    let m: RegExpExecArray | null;
    const frag = document.createDocumentFragment();
    let changed = false;
    while ((m = re.exec(text))) {
      changed = true;
      if (m.index > at) frag.appendChild(wrap(text.slice(at, m.index)));
      const step = m[1] !== undefined ? Number(m[1]) : steps[steps.length - 1]! + 1;
      part++;
      steps.push(step);
      const marker = document.createElement(jump ? "button" : "span");
      marker.className = "deck-click-marker";
      marker.dataset.part = String(part);
      marker.dataset.click = String(step);
      marker.textContent = String(step);
      if (jump) {
        (marker as HTMLButtonElement).type = "button";
        marker.setAttribute("aria-label", `Go to step ${step}`);
        marker.title = `Go to step ${step}`;
      }
      frag.appendChild(marker);
      at = m.index + m[0].length;
    }
    if (!changed) {
      if (node.data.trim()) node.replaceWith(wrap(node.data));
      continue;
    }
    if (at < text.length) frag.appendChild(wrap(text.slice(at)));
    node.replaceWith(frag);
  }
  root.dataset.steps = steps.join(",");
  root.dataset.marked = "1";
}
