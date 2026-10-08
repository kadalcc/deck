import { describe, expect, test } from "bun:test";
import {
  DECK_RENDERER,
  clearRenderers,
  registerLazyRenderer,
  registerRenderer,
  resolveRenderer,
  resolveRendererAsync,
} from "@kadal/deck/renderers/contract";

import { deckSvelte, deckSveltePlugin, svelteRenderer } from "./index.ts";

describe("recognising a Svelte component", () => {
  test("it does not try, and that is the finding", () => {
    // Compiling the same component with dev:true and dev:false differs by exactly one line:
    //   dev   Probe[$.FILENAME] = 'Probe.svelte'
    //   prod  (nothing)
    // The only marker is a Symbol from svelte/internal/client and it is absent from every build
    // anyone ships, so a production Svelte component is a two-argument function and nothing else.
    // The contract says a wrong yes is worse than no answer; this renderer gives no answer.
    expect(svelteRenderer.owns).toBeUndefined();
  });

  test("the stamp is what resolves it", async () => {
    clearRenderers();
    registerRenderer(svelteRenderer);
    const compiled = deckSvelte(function Ticker() {});
    const resolved = resolveRenderer(compiled);
    expect(resolved.renderer?.name).toBe("svelte");
    expect(resolved.how).toBe("marked");

    // And it resolves while the renderer is still an unfetched import, because a stamp is a string.
    clearRenderers();
    registerLazyRenderer("svelte", async () => svelteRenderer);
    expect(resolveRenderer(compiled).how).toBe("deferred");
    expect((await resolveRendererAsync(compiled)).renderer?.name).toBe("svelte");
    clearRenderers();
  });
});

describe("the build plugin that does the stamping", () => {
  const plugin = deckSveltePlugin();
  // What Svelte 5 actually emits, verified against the compiler.
  const compiled = `import * as $ from "svelte/internal/client";\nexport default function Probe($$anchor, $$props) {}`;

  test("runs after the Svelte plugin, or there is nothing to stamp", () => {
    expect(plugin.enforce).toBe("post");
  });

  test("stamps a compiled component", () => {
    const out = plugin.transform(compiled, "/examples/showcase/src/ticker.svelte");
    expect(out?.code).toContain('Probe[Symbol.for("deck.renderer")] = "svelte"');
  });

  test("the line it appends really does stamp — not just look like it", () => {
    const out = plugin.transform(compiled, "/x/ticker.svelte");
    // Run only the appended statement against a stand-in for the component.
    const appended = out!.code.slice(compiled.length);
    const Probe = function Probe() {};
    new Function("Probe", appended)(Probe);
    expect((Probe as { [DECK_RENDERER]?: string })[DECK_RENDERER]).toBe("svelte");
  });

  test("stamps the form where the function was declared earlier", () => {
    const out = plugin.transform("function Late() {}\nexport default Late;\n", "/x/late.svelte");
    expect(out?.code).toContain('Late[Symbol.for("deck.renderer")] = "svelte"');
  });

  test("ignores everything that is not a .svelte module", () => {
    expect(plugin.transform(compiled, "/x/main.ts")).toBeNull();
    expect(plugin.transform(compiled, "/x/ticker.svelte.ts")).toBeNull();
    expect(plugin.transform(compiled, "\0virtual:deck")).toBeNull();
  });

  test("sees through Vite's query strings", () => {
    const out = plugin.transform(compiled, "/x/ticker.svelte?svelte&type=style&lang.css");
    expect(out?.code).toContain('= "svelte"');
  });

  test("leaves a module it does not recognise completely alone", () => {
    // A future Svelte emitting something else should degrade to framework="svelte", not break.
    expect(plugin.transform("export default (() => {})();\n", "/x/odd.svelte")).toBeNull();
  });
});
