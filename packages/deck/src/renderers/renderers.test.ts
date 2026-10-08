import { afterEach, describe, expect, test } from "bun:test";

import {
  DECK_RENDERER,
  type DeckRenderer,
  clearRenderers,
  knownRendererNames,
  loadRenderer,
  nativeRenderer,
  registerLazyRenderer,
  registerRenderer,
  registeredRenderers,
  resolveRenderer,
  resolveRendererAsync,
} from "./contract.ts";
import { webComponentsRenderer } from "./web-components.ts";

const stub = (name: string, extra: Partial<DeckRenderer> = {}): DeckRenderer => ({
  name,
  mount: () => ({ destroy() {} }),
  ...extra,
});

afterEach(() => clearRenderers());

describe("the registry", () => {
  test("keeps registration order, because that is owns() order", () => {
    registerRenderer(stub("first"));
    registerRenderer(stub("second"));
    expect(registeredRenderers().map((r) => r.name)).toEqual(["first", "second"]);
  });

  test("registering a name twice replaces it in place — a dev server reloads modules", () => {
    registerRenderer(stub("vue"));
    registerRenderer(stub("svelte"));
    const replacement = stub("vue", { owns: () => true });
    registerRenderer(replacement);
    expect(registeredRenderers().map((r) => r.name)).toEqual(["vue", "svelte"]);
    expect(registeredRenderers()[0]).toBe(replacement);
  });

  test("finds the one the deck draws with natively", () => {
    registerRenderer(stub("vue"));
    registerRenderer(stub("react", { native: true }));
    expect(nativeRenderer()?.name).toBe("react");
  });
});

describe("resolving a component to a renderer", () => {
  test("what the author named wins", () => {
    registerRenderer(stub("vue", { owns: () => true }));
    registerRenderer(stub("svelte"));
    const r = resolveRenderer(() => {}, "svelte");
    expect(r.renderer?.name).toBe("svelte");
    expect(r.how).toBe("named");
  });

  test("a name nobody registered says so, and lists what there is", () => {
    registerRenderer(stub("vue"));
    const r = resolveRenderer(() => {}, "qwik");
    expect(r.renderer).toBeNull();
    expect(r.reason).toContain("qwik");
    expect(r.reason).toContain("vue");
  });

  test("the build's stamp beats any sniffing", () => {
    // The case the whole design exists for: both of these are plain functions, and nothing about
    // either one says which framework wrote it.
    const solidish = Object.assign(() => {}, { [DECK_RENDERER]: "solid" });
    registerRenderer(stub("react", { owns: (c) => typeof c === "function" }));
    registerRenderer(stub("solid"));
    const r = resolveRenderer(solidish);
    expect(r.renderer?.name).toBe("solid");
    expect(r.how).toBe("marked");
  });

  test("a stamp for a renderer that is not registered explains itself", () => {
    const marked = Object.assign(() => {}, { [DECK_RENDERER]: "angular" });
    registerRenderer(stub("react"));
    const r = resolveRenderer(marked);
    expect(r.renderer).toBeNull();
    expect(r.reason).toContain("angular");
  });

  test("owns() is the last resort, first match wins", () => {
    registerRenderer(stub("web-components", { owns: (c) => typeof c === "string" }));
    registerRenderer(stub("react", { owns: () => true }));
    expect(resolveRenderer("my-chart").how).toBe("owned");
    expect(resolveRenderer("my-chart").renderer?.name).toBe("web-components");
  });

  test("a renderer that throws while sniffing simply does not own it", () => {
    registerRenderer(
      stub("rude", {
        owns() {
          throw new Error("no");
        },
      }),
    );
    registerRenderer(stub("polite", { owns: () => true }));
    expect(resolveRenderer({}).renderer?.name).toBe("polite");
  });

  test("nothing claims it, and the message says what to do", () => {
    registerRenderer(stub("react"));
    const r = resolveRenderer({});
    expect(r.renderer).toBeNull();
    expect(r.reason).toContain("framework");
  });

  test("with no renderers at all it still answers rather than throws", () => {
    expect(resolveRenderer(() => {}).renderer).toBeNull();
    expect(resolveRenderer(() => {}, "vue").reason).toContain("none are");
  });
});

describe("custom elements", () => {
  test("claims a hyphenated tag name and nothing else", () => {
    expect(webComponentsRenderer.owns?.("my-chart")).toBe(true);
    expect(webComponentsRenderer.owns?.("div")).toBe(false);
    expect(webComponentsRenderer.owns?.("my chart")).toBe(false);
    expect(webComponentsRenderer.owns?.(() => {})).toBe(false);
    expect(webComponentsRenderer.owns?.({})).toBe(false);
  });

  test("renders markup for a surface that will never hydrate", () => {
    const html = webComponentsRenderer.ssr?.(
      "my-chart",
      { kind: "bar", live: true, hidden: false, missing: null, rows: [1, 2] },
      { animate: false, slot: "<p>caption</p>" },
    );
    // objects and functions are left for `mount` to set as properties; false/null are dropped
    expect(html).toBe('<my-chart kind="bar" live=""><p>caption</p></my-chart>');
  });

  test("escapes what goes into an attribute", () => {
    const html = webComponentsRenderer.ssr?.(
      "my-chart",
      { title: 'a "quoted" <tag> & more' },
      { animate: true },
    );
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).toContain("&lt;tag&gt;");
    expect(html).toContain("&amp;");
  });
});

describe("a renderer that arrives later", () => {
  const later = (name: string): DeckRenderer => ({
    name,
    mount: () => ({ destroy() {} }),
  });

  afterEach(clearRenderers);

  test("resolution says “deferred” rather than guessing or failing", () => {
    registerLazyRenderer("svelte", async () => later("svelte"));
    const resolved = resolveRenderer({}, "svelte");
    expect(resolved.how).toBe("deferred");
    expect(resolved.renderer).toBeNull();
    // This is the point: the engine knows which renderer it needs before that renderer's code —
    // and its framework's runtime — is anywhere in the page.
    expect(registeredRenderers().map((r) => r.name)).not.toContain("svelte");
  });

  test("loading it registers it, and a second ask is the same promise", async () => {
    let imports = 0;
    registerLazyRenderer("solid", async () => {
      imports++;
      return later("solid");
    });
    const [a, b] = await Promise.all([loadRenderer("solid"), loadRenderer("solid")]);
    expect(a?.name).toBe("solid");
    expect(b).toBe(a);
    expect(imports).toBe(1);
    expect(resolveRenderer({}, "solid").how).toBe("named");
  });

  test("a module with a default export is unwrapped", async () => {
    registerLazyRenderer("qwik", async () => ({ default: later("qwik") }));
    expect((await loadRenderer("qwik"))?.name).toBe("qwik");
  });

  test("a stamped component names its own deferred renderer", async () => {
    registerLazyRenderer("vue", async () => later("vue"));
    const component = { [DECK_RENDERER]: "vue", setup() {} };
    expect(resolveRenderer(component).how).toBe("deferred");
    const resolved = await resolveRendererAsync(component);
    expect(resolved.renderer?.name).toBe("vue");
    expect(resolved.how).toBe("marked");
  });

  test("an import that fails is reported, not thrown, and can be retried", async () => {
    let attempts = 0;
    registerLazyRenderer("angular", async () => {
      attempts++;
      if (attempts === 1) throw new Error("offline");
      return later("angular");
    });
    expect(await loadRenderer("angular")).toBeNull();
    // A deck that lost its network on slide three should recover on slide four.
    expect((await loadRenderer("angular"))?.name).toBe("angular");
  });

  test("a module that exports the wrong thing fails loudly, not silently", async () => {
    registerLazyRenderer("broken", async () => ({ default: { name: "broken" } }) as never);
    expect(await loadRenderer("broken")).toBeNull();
  });

  test("an unknown name is still unknown, and the error lists what exists", () => {
    registerLazyRenderer("preact", async () => later("preact"));
    registerRenderer(later("react"));
    const resolved = resolveRenderer({}, "fresh");
    expect(resolved.how).toBe("unknown");
    expect(knownRendererNames().sort()).toEqual(["preact", "react"]);
    if (resolved.how === "unknown") {
      expect(resolved.reason).toContain("preact");
      expect(resolved.reason).toContain("react");
    }
  });

  test("an eager registration of the same name wins, because it is already here", async () => {
    registerLazyRenderer("vue", async () => later("lazy-vue"));
    registerRenderer(later("vue"));
    expect(resolveRenderer({}, "vue").how).toBe("named");
    expect((await loadRenderer("vue"))?.name).toBe("vue");
  });
});
