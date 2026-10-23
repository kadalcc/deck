import { type LayerProps, useActions } from "@kadal/deck";

/**
 * This deck's own buttons beside the controls (the `custom-nav-controls` layer, Slidev's name):
 * back to the start, and this tour's source. In the presenter view they join its toolbar. (The
 * overview is the engine's own: Esc, or the presenter's Overview button.)
 */
export default function ShowcaseNavControls({ view, page }: LayerProps) {
  const actions = useActions();
  return (
    <>
      {page > 1 ? (
        <button
          type="button"
          aria-label="Back to the start"
          title="Back to the start"
          onClick={() => actions.first()}
        >
          ⇤{view === "presenter" ? " Start" : null}
        </button>
      ) : null}
      <a
        href="https://github.com/kadalcc/deck/tree/main/examples/showcase"
        target="_blank"
        rel="noreferrer"
        aria-label="This tour's source"
        title="This tour's source, on GitHub"
      >
        ↗{view === "presenter" ? " Source" : null}
      </a>
    </>
  );
}
