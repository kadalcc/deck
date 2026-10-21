import type { LayerProps, SetupApi } from "@kadal/deck";

function Stamp({ children }: { children?: React.ReactNode }) {
  return <span className="fixture-stamp">{children}</span>;
}

/** A slide layer: every slide's own corner mark, with its click. */
function Corner({ page, click, clicks }: LayerProps) {
  return (
    <div className="fixture-corner" data-fixture-corner>
      slide {page} · step {click}/{clicks}
    </div>
  );
}

function setup(api: SetupApi) {
  const off = api.commands.register({
    id: "fixture.stamp",
    title: "Stamp",
    description: "The fixture addon's command: shows a toast.",
    group: "view",
    run: () => api.deck.actions.toast("Stamped"),
  });
  api.shortcut("shift+j", () => void api.commands.run("fixture.stamp", {}, "keyboard"));
  (globalThis as { __fixtureSetup?: number }).__fixtureSetup =
    ((globalThis as { __fixtureSetup?: number }).__fixtureSetup ?? 0) + 1;
  return off;
}

export default {
  components: { Stamp },
  layers: { "slide-top": Corner },
  setup,
};
