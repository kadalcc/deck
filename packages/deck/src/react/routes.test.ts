import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { normalizeModule, type RoutePageProps } from "../theming/contract.ts";
import { setupApi } from "../theming/react.tsx";
import {
  deckPackageSet,
  isLayerCandidate,
  packagesCode,
  routePaths,
  routesFile,
} from "../vite/packages.ts";
import { writeStaticHostFiles } from "../vite/static-host.ts";
import type { DeckRuntime } from "./context.ts";
import { pageFor } from "./Deck.tsx";
import {
  applyRoutes,
  createRouteRegistry,
  defineRoutes,
  matchRoute,
  RoutePage,
} from "./routes.tsx";

const A = (p: RoutePageProps) =>
  createElement("p", null, `A ${p.path} ${JSON.stringify(p.params)}`);
const B = () => createElement("p", null, "B");

describe("matching a path", () => {
  const routes = [
    { path: "handout", component: A },
    { path: "/tools/timer/", component: A },
    { path: "q/:id", component: A },
    { path: "docs/*", component: A },
    { path: "presenter", component: B },
  ];
  test("plain, nested, params, a rest", () => {
    expect(matchRoute("handout", routes)?.route.path).toBe("handout");
    expect(matchRoute("handout/", routes)?.path).toBe("handout");
    expect(matchRoute("handout.html", routes)?.path).toBe("handout");
    expect(matchRoute("tools/timer", routes)?.route.path).toBe("/tools/timer/");
    expect(matchRoute("q/7", routes)?.params).toEqual({ id: "7" });
    expect(matchRoute("q/a%20b", routes)?.params).toEqual({ id: "a b" });
    expect(matchRoute("docs/a/b", routes)?.params).toEqual({ "*": "a/b" });
  });
  test("no match: the deck itself, a longer path, the engine's own pages", () => {
    expect(matchRoute("", routes)).toBeNull();
    expect(matchRoute("index.html", routes)).toBeNull();
    expect(matchRoute("handout/more", routes)).toBeNull();
    expect(matchRoute("q", routes)).toBeNull();
    expect(matchRoute("presenter", routes)).toBeNull();
    expect(matchRoute("nope", routes)).toBeNull();
  });
});

describe("the route registry", () => {
  test("packages, then the deck's file, then <Deck routes>, then added ones", () => {
    const r = createRouteRegistry();
    r.source("prop", [{ path: "c", component: A }]);
    r.source("deck", [{ path: "b", component: A }]);
    r.source("pkg:0", [{ path: "a", component: A }]);
    const off = r.add({ path: "d", component: A });
    expect(r.list().map((x) => x.path)).toEqual(["a", "b", "c", "d"]);
    off();
    expect(r.list().map((x) => x.path)).toEqual(["a", "b", "c"]);
  });
  test("a function source gets the routes so far (Slidev's defineRoutesSetup)", () => {
    const r = createRouteRegistry();
    r.source("pkg:0", [
      { path: "a", component: A },
      { path: "x", component: A },
    ]);
    r.source(
      "deck",
      defineRoutes((routes) => [
        ...routes.filter((x) => x.path !== "x"),
        { path: "y", component: B },
      ]),
    );
    expect(r.list().map((x) => x.path)).toEqual(["a", "y"]);
    expect(
      applyRoutes([], () => {
        throw new Error("boom");
      }),
    ).toEqual([]);
  });
  test("listeners hear changes, not a source set to what it already is; malformed routes are dropped", () => {
    const r = createRouteRegistry();
    let n = 0;
    r.subscribe(() => n++);
    const list = [{ path: "a", component: A }];
    r.source("deck", list);
    r.source("deck", list);
    r.source("prop", [{ path: "z" } as never], true);
    expect(n).toBe(1);
    expect(r.list().map((x) => x.path)).toEqual(["a"]);
  });
  test("setup(api).addRoute adds to the deck's registry and goes with the package", () => {
    const routes = createRouteRegistry();
    const api = setupApi({ routes, commands: {}, panels: {} } as unknown as DeckRuntime);
    api.addRoute({ path: "from-addon", component: B });
    expect(routes.list().map((x) => x.path)).toEqual(["from-addon"]);
    api.dispose();
    expect(routes.list()).toEqual([]);
  });
  test("a package module's routes export is kept by normalisation", () => {
    const routes = [{ path: "a", component: A }];
    expect(normalizeModule({ default: { routes } })?.routes).toBe(routes);
    expect(normalizeModule({ routes })?.routes).toBe(routes);
  });
});

describe("the page", () => {
  test("renders its component with the path and params", () => {
    const m = matchRoute("q/7", [{ path: "q/:id", component: A }])!;
    expect(renderToStaticMarkup(createElement(RoutePage, { match: m }))).toBe(
      '<div class="deck-route-page" data-route="q/:id"><p>A q/7 {&quot;id&quot;:&quot;7&quot;}</p></div>',
    );
  });
  test("pageFor leaves a route page to the routes", () => {
    expect(pageFor("page", {})).toBeNull();
  });
});

describe("the routes file in the build", () => {
  test("found beside deck.mdx, in src/ or in setup/, imported into the manifest, watched", () => {
    const dir = mkdtempSync(join(tmpdir(), "kadal-routes-"));
    try {
      expect(routesFile(dir)).toBeNull();
      mkdirSync(join(dir, "setup"));
      const file = join(dir, "setup", "routes.ts");
      writeFileSync(
        file,
        `export default [{ path: "handout", component: X }, { path: 'tools/timer', load: () => import("./t") }, { path: "q/:id", component: X }, { path: "../up", component: X }];\n`,
      );
      expect(routesFile(dir)).toBe(file);
      expect(isLayerCandidate(file, dir)).toBe(true);
      expect(isLayerCandidate(join(dir, "routes.tsx"), dir)).toBe(true);
      expect(isLayerCandidate(join(dir, "setup", "other.ts"), dir)).toBe(false);
      const code = packagesCode(deckPackageSet({}, dir));
      expect(code.value).toMatch(
        /routes: __kadal_pkg_\d+\.default \?\? __kadal_pkg_\d+\.routes \?\? null/,
      );
      expect(routePaths(file)).toEqual(["handout", "tools/timer"]);
      // the static host gets a copy of index.html at each plain path
      const out = join(dir, "dist");
      mkdirSync(out);
      writeFileSync(join(out, "index.html"), "<html></html>");
      const written = writeStaticHostFiles(out, "/talk/", null, routePaths(file));
      expect(written).toContain("handout/index.html");
      expect(written).toContain("tools/timer/index.html");
      expect(existsSync(join(out, "tools", "timer", "index.html"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
