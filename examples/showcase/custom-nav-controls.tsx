import type { LayerProps } from "@kadal/deck";

/**
 * This deck's own button beside the controls (the `custom-nav-controls` layer, Slidev's name):
 * the tour's source. In the presenter view it joins the toolbar. (Back to the start and the
 * overview are the engine's own, in every deck.)
 */
export default function ShowcaseNavControls({ view }: LayerProps) {
  return (
    <a
      href="https://github.com/kadalcc/deck/tree/main/examples/showcase"
      target="_blank"
      rel="noreferrer"
      aria-label="This tour's source"
      title="This tour's source, on GitHub"
    >
      ↗{view === "presenter" ? " Source" : null}
    </a>
  );
}
