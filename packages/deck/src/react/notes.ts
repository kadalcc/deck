import { type ComponentType, useEffect, useState } from "react";

import type { SlideMeta } from "../core/model.ts";
import { createStore, useStore } from "../core/store.ts";
import { useDeck } from "./context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SPEAKER NOTES: LOADING THEM, AND SAVING THEM BACK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every view that shows notes — the presenter's panel, /notes, /notes-edit, /overview — loads a
 * slide's compiled notes through `useSlideNotes`, and edits them through the deck's
 * `NotesEditor`, when it has one:
 *
 *   `kadal-deck dev`     the dev server's /__kadal/notes endpoint (src/vite/notes-dev.ts), which
 *                        rewrites only that slide's notes in deck.mdx (src/authoring/edit.ts) and
 *                        pushes the recompiled notes to every open view — no reload
 *   a host              `<Deck notesEditor={…}>`: the hosted builder's own save path
 *   a built deck        none: the notes are read-only and no view offers to edit them
 *
 * A save is conflict-safe. `load` hands out the notes as written with a version; `save` sends
 * that version back, and a deck whose notes changed in the meantime (the file edited in an
 * editor, another window saving first) answers with what is there now instead of overwriting it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface NotesDraft {
  /** The notes as written (Markdown/MDX with `[click]` markers); "" for none. */
  text: string;
  /** Opaque: handed back with `save` so a stale write is refused. */
  version: string;
}

export type NotesSaveResult =
  | { ok: true; version: string }
  | { ok: false; conflict: NotesDraft }
  | { ok: false; error: string };

/** A save path for speaker notes. Slides are the manifest's entries (`meta.index` addresses one). */
export interface NotesEditor {
  load(slide: SlideMeta): Promise<NotesDraft>;
  save(slide: SlideMeta, text: string, version: string): Promise<NotesSaveResult>;
}

/** The dev server's notes endpoint as a `NotesEditor`. */
export function devNotesEditor(api: string): NotesEditor {
  const url = (index: number) => `${api}?slide=${index}`;
  return {
    async load(slide) {
      const r = await fetch(url(slide.index), { headers: { Accept: "application/json" } });
      const j = (await r.json().catch(() => ({}))) as Partial<NotesDraft> & { error?: string };
      if (!r.ok || typeof j.text !== "string" || typeof j.version !== "string")
        throw new Error(j.error ?? `The dev server answered ${r.status}.`);
      return { text: j.text, version: j.version };
    },
    async save(slide, text, version) {
      let r: Response;
      try {
        r = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide: slide.index, text, version }),
        });
      } catch {
        return { ok: false, error: "The dev server could not be reached." };
      }
      const j = (await r.json().catch(() => ({}))) as {
        version?: string;
        text?: string;
        error?: string;
      };
      if (r.ok && typeof j.version === "string") return { ok: true, version: j.version };
      if (r.status === 409 && typeof j.text === "string" && typeof j.version === "string")
        return { ok: false, conflict: { text: j.text, version: j.version } };
      return { ok: false, error: j.error ?? `The dev server answered ${r.status}.` };
    },
  };
}

/** The deck's notes editor: the one passed to `<Deck>`, else the dev server's, else none. */
export function useNotesEditor(): NotesEditor | null {
  return useDeck().notesEditor;
}

/**
 * Bumped per slide index when the dev server pushes recompiled notes (`kadal:notes`, sent by the
 * manifest module's HMR handler after it has swapped the slide's `loadNotes`).
 */
const revisions = createStore<Record<number, number>>({});
if (typeof window !== "undefined")
  window.addEventListener("kadal:notes", (e) => {
    const indices = (e as CustomEvent<number[]>).detail;
    if (!Array.isArray(indices)) return;
    revisions.update((r) => {
      const next = { ...r };
      for (const i of indices) next[i] = (next[i] ?? 0) + 1;
      return next;
    });
  });

/** A slide's compiled notes component, reloaded when the dev server recompiles them. */
export function useSlideNotes(meta: Pick<SlideMeta, "index" | "loadNotes"> | null | undefined): {
  Notes: ComponentType | null;
  loading: boolean;
  revision: number;
} {
  const revision = useStore(revisions, (r) => (meta ? (r[meta.index] ?? 0) : 0));
  const [state, setState] = useState<{ Notes: ComponentType | null; loading: boolean }>({
    Notes: null,
    loading: !!meta?.loadNotes,
  });
  // `loadNotes` itself is swapped in place by a hot update, so it is read at run time, not a dep.
  useEffect(() => {
    let alive = true;
    const load = meta?.loadNotes;
    if (!load) {
      setState({ Notes: null, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    load()
      .then((m) => alive && setState({ Notes: m.default as ComponentType, loading: false }))
      .catch(() => alive && setState({ Notes: null, loading: false }));
    return () => {
      alive = false;
    };
  }, [meta, revision]);
  return { ...state, revision };
}
