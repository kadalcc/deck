import { describe, expect, test } from "bun:test";

import { DOWNLOAD_FILE, downloadTarget } from "./download.ts";
import { readHostOverride, resolveConfig, withHostOverride } from "./model.ts";

describe("the Download button", () => {
  test("off by default", () => {
    expect(resolveConfig().download).toBe(false);
    expect(downloadTarget(resolveConfig(), "/")).toEqual({ kind: "none" });
  });

  test("true: the built PDF, else the exporter", () => {
    expect(downloadTarget(resolveConfig({ download: true }), "/@ana/talk/")).toEqual({
      kind: "built",
      pdf: `/@ana/talk/${DOWNLOAD_FILE}`,
      exporter: "/@ana/talk/export",
    });
  });

  test("a URL links that file; a relative one is the deck's own", () => {
    expect(downloadTarget({ download: "https://x.dev/t.pdf" }, "/d/")).toEqual({
      kind: "url",
      url: "https://x.dev/t.pdf",
    });
    expect(downloadTarget({ download: "slides.pdf" }, "/d/")).toEqual({
      kind: "url",
      url: "/d/slides.pdf",
    });
  });

  test("the host can hide it, allow the deck's own, or point it at its copy", () => {
    const on = resolveConfig({ download: true });
    const off = resolveConfig();
    const host = (download: unknown) => readHostOverride({ __KADAL_DECK__: { download } });
    expect(withHostOverride(on, host(false)).download).toBe(false);
    // Allowed is not asked for: a deck that never wanted a button doesn't get one.
    expect(withHostOverride(off, host(true)).download).toBe(false);
    expect(withHostOverride(on, host(true)).download).toBe(true);
    expect(withHostOverride(resolveConfig({ download: "a.pdf" }), host(true)).download).toBe(
      "a.pdf",
    );
    expect(withHostOverride(on, host("/api/decks/d1/exports/pdf")).download).toBe(
      "/api/decks/d1/exports/pdf",
    );
    expect(withHostOverride(off, host("/api/decks/d1/exports/pdf")).download).toBe(false);
    // Not a URL the host could mean: ignored.
    expect(host("javascript:alert(1)")).toEqual({});
    expect(host("//evil.example/x.pdf")).toEqual({});
  });
});
