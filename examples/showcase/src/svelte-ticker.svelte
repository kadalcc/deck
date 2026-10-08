<!--
  A Svelte 5 component on a slide, for the islands tour.

  Same two readings as the Vue and custom-element tickers, so one verifier covers all three:
  `data-svelte-ticks`, which only a live interval advances, and `data-svelte-step`, which comes from
  the deck's click. Press the arrow and the step changes while the count keeps going — proof the
  renderer handed Svelte new props instead of tearing the island down and building it again.

  Nothing here says "svelte" to the engine. The stamp is appended by `deckSveltePlugin()` when this
  file is compiled, because a production-compiled Svelte component carries no trace of its origin.
-->
<script lang="ts">
  import { onMount } from "svelte";

  let { label = "a svelte island", step = 0 }: { label?: string; step?: number } = $props();

  let ticks = $state(0);

  onMount(() => {
    const tally = (window.__svelteIsland ??= { mounted: 0, destroyed: 0 });
    tally.mounted++;
    const timer = setInterval(() => ticks++, 100);
    return () => {
      tally.destroyed++;
      clearInterval(timer);
    };
  });
</script>

<div class="ticker is-svelte" data-svelte-ticks={ticks} data-svelte-step={step}>
  <span class="ticker-label">{label}</span>
  <strong class="ticker-count">{(ticks / 10).toFixed(1)}s</strong>
  <em class="ticker-step">deck click {step}</em>
</div>
