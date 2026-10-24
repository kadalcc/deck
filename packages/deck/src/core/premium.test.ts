import { describe, expect, test } from "bun:test";

import { readHostOverride, resolveBackground, withHostOverride, resolveConfig } from "./model.ts";
import {
  failureForStatus,
  isPremiumName,
  moduleUrl,
  parseCatalog,
  premiumBase,
  readPremiumModule,
} from "./premium.ts";

describe("pro/ names", () => {
  test("only pro/<slug> is a library name", () => {
    expect(isPremiumName("pro/aurora-noir")).toBe(true);
    expect(isPremiumName("pro/a1")).toBe(true);
    for (const n of [
      "aurora",
      "pro/",
      "pro/Aurora",
      "pro/a/b",
      "pro/../x",
      "/pro/a",
      "PRO/a",
      3,
      null,
    ])
      expect(isPremiumName(n)).toBe(false);
  });

  test("background: pro/<slug> is a component, not an image path", () => {
    expect(resolveBackground({ background: "pro/neon-drift" })).toMatchObject({
      component: "pro/neon-drift",
      image: null,
    });
    expect(
      resolveBackground({ background: { component: "pro/neon-drift", speed: 2 } }),
    ).toMatchObject({ component: "pro/neon-drift", props: { speed: 2 } });
    // Paths with slashes are still images.
    expect(resolveBackground({ background: "img/pro/x.png" })?.image).toBe("img/pro/x.png");
    expect(resolveBackground({ background: "/pro/x" })?.image).toBe("/pro/x");
  });
});

describe("the host's premium base", () => {
  test("http(s) URLs and same-site paths, normalised with a trailing slash", () => {
    expect(premiumBase("https://decks.kadal.cc/@a/b/__kadal/premium")).toBe(
      "https://decks.kadal.cc/@a/b/__kadal/premium/",
    );
    expect(premiumBase("http://localhost:8802/p/?x=1#y")).toBe("http://localhost:8802/p/");
    for (const bad of ["javascript:alert(1)", "data:text/plain,x", "", 7, null, "ftp://x/"])
      expect(premiumBase(bad)).toBeNull();
  });

  test("readHostOverride keeps a valid premium base and drops a bad one", () => {
    expect(
      readHostOverride({
        __KADAL_DECK__: { premium: "https://decks.kadal.cc/@a/b/__kadal/premium/" },
      })?.premium,
    ).toBe("https://decks.kadal.cc/@a/b/__kadal/premium/");
    expect(
      readHostOverride({ __KADAL_DECK__: { premium: "javascript:x" } })?.premium,
    ).toBeUndefined();
  });

  test("the premium base does not touch the config", () => {
    const built = resolveConfig({ slug: "x" });
    expect(withHostOverride(built, { premium: "https://h/p/" })).toBe(built);
  });
});

describe("catalog and modules", () => {
  test("parseCatalog keeps well-formed lines, in either shape", () => {
    const lines = [
      { id: "pro/a-one", kind: "background", module: "items/a-one.js", title: "A" },
      { id: "pro/b", kind: "layout", module: "items/b.js" },
      { id: "aurora", kind: "background", module: "x.js" },
      { id: "pro/c", kind: "theme", module: "x.js" },
      { id: "pro/d", kind: "layout" },
      null,
      "x",
    ];
    expect(parseCatalog(lines).map((e) => e.id)).toEqual(["pro/a-one", "pro/b"]);
    expect(parseCatalog({ items: lines })).toHaveLength(2);
    expect(parseCatalog("nope")).toEqual([]);
  });

  test("a module URL must stay under the base", () => {
    const base = "https://decks.kadal.cc/@a/b/__kadal/premium/";
    expect(moduleUrl(base, { module: "items/x.js" })).toBe(`${base}items/x.js`);
    expect(moduleUrl(base, { module: "../../evil.js" })).toBeNull();
    expect(moduleUrl(base, { module: "https://evil.example/x.js" })).toBeNull();
    expect(moduleUrl(base, { module: "//evil.example/x.js" })).toBeNull();
  });

  test("readPremiumModule takes the item of the right kind from the default export", () => {
    const C = () => null;
    const P = () => null;
    const ns = { default: { backgrounds: { "pro/a": C }, poster: { "pro/a": P }, css: ".a{}" } };
    expect(readPremiumModule(ns, "pro/a", "background")).toEqual({
      component: C,
      poster: P,
      css: ".a{}",
    });
    expect(readPremiumModule(ns, "pro/a", "layout")).toBeNull();
    expect(readPremiumModule(ns, "pro/b", "background")).toBeNull();
    expect(
      readPremiumModule({ default: { backgrounds: { "pro/a": "nope" } } }, "pro/a", "background"),
    ).toBeNull();
    expect(readPremiumModule(null, "pro/a", "background")).toBeNull();
    // A memo/forwardRef object counts as a component.
    const memo = { $$typeof: Symbol.for("react.memo"), type: C };
    expect(
      readPremiumModule({ default: { layouts: { "pro/l": memo } } }, "pro/l", "layout")?.component,
    ).toBe(memo);
  });

  test("HTTP statuses map to failures", () => {
    expect(failureForStatus(402)).toBe("not-entitled");
    expect(failureForStatus(403)).toBe("not-entitled");
    expect(failureForStatus(404)).toBe("missing");
    expect(failureForStatus(500)).toBe("network");
  });
});
