import { type LayerProps, useActions } from "@kadal/deck";

/**
 * This deck's own buttons beside the controls (the `custom-nav-controls` layer, Slidev's name):
 * the overview and back to the start. In the presenter view they join its toolbar.
 */
export default function ShowcaseNavControls({ view, page }: LayerProps) {
  const actions = useActions();
  return (
    <>
      <button
        type="button"
        aria-label="Overview"
        title="Overview (Esc)"
        onClick={() => actions.toggleOverview()}
      >
        ▦{view === "presenter" ? " Overview" : null}
      </button>
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
    </>
  );
}
