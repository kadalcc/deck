/**
 * A props object a Svelte component reads reactively, built from outside Svelte.
 *
 * This file is `.svelte.ts` on purpose: runes are a compiler feature, so `$state` only exists in a
 * file the Svelte compiler sees. The renderer next door is plain TypeScript and cannot use one —
 * which is the whole reason this is its own module, small enough to read in a sitting.
 *
 * Why it has to exist at all: `mount(Component, { props })` hands the component that object and the
 * component reads `props.label` on every render. A plain object's reads are not tracked, so new
 * props after mounting change nothing and the renderer's only recourse is to unmount and remount —
 * which costs the island whatever it was holding. Backed by `$state`, assigning to the bag re-runs
 * exactly the parts of the component that read the prop, which is Svelte doing what Svelte is for.
 */

export interface PropsBag {
  /** Hand this to `mount`. The component's reads of it are tracked. */
  readonly props: Record<string, unknown>;
  /** Replace the props wholesale, dropping any key the new set does not have. */
  set(next: Record<string, unknown>): void;
}

export function createPropsBag(initial: Record<string, unknown>): PropsBag {
  const bag = $state<Record<string, unknown>>({ ...initial });

  return {
    props: bag,
    set(next) {
      // Mutate the same object: a new one would not be the one the component is reading.
      for (const key of Object.keys(bag)) if (!(key in next)) delete bag[key];
      Object.assign(bag, next);
    },
  };
}
