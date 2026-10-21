import { useDeck } from "./context.ts";
import { NotesView } from "./NotesView.tsx";

/**
 * /notes-edit  —  every slide's notes, editable, on one scrolling page (Slidev's batch notes
 * editor). Each slide has its own box of Markdown, saved a moment after typing stops — one slide
 * at a time, conflict-safe, through the deck's `NotesEditor` (react/notes.ts). Where there is no
 * editor (a built or hosted deck without one) it says so and points at /notes, which reads them.
 */
export function NotesEditPage() {
  const deck = useDeck();
  const rows = deck.columns.flatMap((c) => c.slides.map((meta, v) => ({ meta, h: c.h, v })));
  if (!deck.notesEditor)
    return (
      <div className="deck-notes-page">
        <h1>{deck.config.title} — notes</h1>
        <p className="deck-muted">
          Notes can be edited here while the deck runs under <code>kadal-deck dev</code>. This copy
          is built, so they are read-only: <a href={`${deck.base}notes`}>read them on /notes</a>.
        </p>
      </div>
    );
  return (
    <div className="deck-notes-page deck-notes-edit-page">
      <header className="deck-notes-page-head">
        <h1>{deck.config.title} — notes</h1>
        <nav>
          <a href={`${deck.base}notes`}>Read</a>
          <a href={`${deck.base}overview`}>Overview</a>
        </nav>
      </header>
      <p className="deck-muted deck-notes-edit-hint">
        Saved into the deck file as you pause typing. <code>[click]</code> starts the part for the
        next step, <code>[click:3]</code> the part for step 3.
      </p>
      {rows.map(({ meta, h, v }) => (
        <section key={`${h},${v}`} className="deck-notes-entry">
          <h2>
            <a href={`${deck.base}#/${h}${v ? `/${v}` : ""}`}>
              {h + 1}
              {v ? `.${v + 1}` : ""} {meta.title ?? ""}
            </a>
          </h2>
          <NotesView meta={meta} click={null} bare alwaysEditing />
        </section>
      ))}
    </div>
  );
}
