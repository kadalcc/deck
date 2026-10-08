import { defineComponent, h, onMounted, onUnmounted, ref } from "vue";

/**
 * A Vue component on a slide, for the islands tour.
 *
 * It carries two things a test can read from the outside: `data-vue-ticks`, which only a running
 * timer increases, and `data-vue-step`, which comes from the deck's click. Together they prove the
 * thing worth proving about `update` — press → and the step changes while the tick count keeps
 * going, because the island was handed new props rather than torn down and rebuilt. A remount would
 * reset the count to zero, and a chart or a half-typed form would lose just as much.
 */

declare global {
  interface Window {
    __vueIsland?: { mounted: number; destroyed: number };
  }
}

const tally = () => (window.__vueIsland ??= { mounted: 0, destroyed: 0 });

export const VueTicker = defineComponent({
  name: "VueTicker",
  props: {
    label: { type: String, default: "a vue island" },
    step: { type: Number, default: 0 },
  },
  setup(props) {
    const ticks = ref(0);
    let timer = 0;

    onMounted(() => {
      tally().mounted++;
      timer = window.setInterval(() => ticks.value++, 100);
    });
    onUnmounted(() => {
      tally().destroyed++;
      clearInterval(timer);
    });

    return () =>
      h(
        "div",
        {
          class: "ticker is-vue",
          "data-vue-ticks": ticks.value,
          "data-vue-step": props.step,
        },
        [
          h("span", { class: "ticker-label" }, props.label),
          h("strong", { class: "ticker-count" }, `${(ticks.value / 10).toFixed(1)}s`),
          h("em", { class: "ticker-step" }, `deck click ${props.step}`),
        ],
      );
  },
});
