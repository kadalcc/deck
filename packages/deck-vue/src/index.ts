import {
  DECK_RENDERER,
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";
import { type Component, createApp, h, reactive } from "vue";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VUE RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first renderer written against the contract rather than alongside it, which makes it the
 * test of whether the contract is a contract. Two things it had to bend to, both Vue's and neither
 * anticipated:
 *
 * ROOT PROPS ARE NOT REACTIVE. `createApp(Component, props)` takes the props once; handing it new
 * ones later does nothing, so a naive renderer has to unmount and remount for every prop change —
 * and an island that remounts loses whatever it was holding, which for a chart is its animation and
 * for a form is what you had typed. Instead the app is mounted around a `reactive` bag that the
 * render function reads, so `update` is a mutation and Vue re-renders the component in place. This
 * is the difference between `update` being present in the contract and being decoration.
 *
 * FUNCTIONAL COMPONENTS ARE UNRECOGNISABLE. A functional Vue component is a plain function, exactly
 * like a React or Solid one, so `owns` deliberately refuses every function. That is the contract's
 * own rule — a wrong yes is worse than no answer — and it is why `DECK_RENDERER` exists: a build
 * plugin stamps the file, or the author writes `framework="vue"`, and nobody has to guess.
 */

/**
 * Does this look like a Vue component written as options?
 *
 * Objects only. A compiled single-file component leaves `__vccOpts` or `__file` behind; one written
 * by hand has a `render`, a `setup`, or a `template`. Functions are refused on purpose, however
 * Vue-ish they look.
 */
function looksLikeVue(component: IslandComponent): boolean {
  if (!component || typeof component !== "object") return false;
  const options = component as Record<string, unknown>;
  if ("__vccOpts" in options || "__file" in options) return true;
  return (
    typeof options.render === "function" ||
    typeof options.setup === "function" ||
    typeof options.template === "string"
  );
}

export const vueRenderer: DeckRenderer = {
  name: "vue",

  owns(component: IslandComponent) {
    return looksLikeVue(component);
  },

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    // The props the render function reads. Mutating this is what `update` does.
    const live = reactive<IslandProps>({ ...props });

    // Children arrive as HTML, so they go in as the default slot's markup rather than a tree. A
    // live cross-framework subtree is not on offer — see the contract for why.
    const slots = context.slot
      ? { default: () => [h("div", { class: "deck-island-slot", innerHTML: context.slot })] }
      : undefined;

    const app = createApp({
      name: "DeckIsland",
      render: () => h(component as Component, { ...live }, slots),
    });

    // A Vue error inside an island is the island's problem, not the slide's.
    app.config.errorHandler = (error, _instance, info) => {
      console.error(`[deck] vue island failed (${info}):`, error);
    };

    app.mount(host);

    let unmounted = false;
    return {
      destroy() {
        if (unmounted) return;
        unmounted = true;
        app.unmount();
      },
      update(next: IslandProps) {
        if (unmounted) return;
        // Mutate in place: a new object would not be the one the render function is watching.
        for (const key of Object.keys(live)) if (!(key in next)) delete live[key];
        Object.assign(live, next);
      },
    };
  },

  // No `ssr`. It would mean pulling `@vue/server-renderer` into every deck that uses a Vue island,
  // and nothing needs it yet: the deck's print and export paths run a real browser, so islands
  // hydrate there like anywhere else. Add it when a surface appears that genuinely cannot run JS.
};

/**
 * Stamp a Vue component so the engine knows who wrote it without being told again.
 *
 *     export default deckVue(defineComponent({ … }))
 *
 * This is what a `.vue` build plugin will do automatically; until then it is how a functional
 * component — which `owns` refuses by design — gets resolved to this renderer.
 */
export function deckVue<T>(component: T): T {
  (component as { [DECK_RENDERER]?: string })[DECK_RENDERER] = "vue";
  return component;
}
