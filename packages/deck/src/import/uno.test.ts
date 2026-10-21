import { describe, expect, test } from "bun:test";

import {
  applyDeclarations,
  attributifyClasses,
  expandVariantGroups,
  isUtility,
  scaleCssValue,
  utilityCss,
} from "./uno.ts";

const css = (classes: string[], scale = 1920 / 980) => utilityCss(classes, { scale });
const rule = (cls: string, scale?: number) => css([cls], scale).css;

describe("utility classes → CSS at Kadal's scale", () => {
  test("spacing and sizing are in Slidev's rem", () => {
    expect(rule("mt-12")).toBe(".mt-12 { margin-top: calc(3 * var(--slidev-rem)); }");
    expect(rule("w-80")).toBe(".w-80 { width: calc(20 * var(--slidev-rem)); }");
    expect(rule("p-4")).toBe(".p-4 { padding: var(--slidev-rem); }");
    expect(rule("w-1/2")).toBe(".w-1\\/2 { width: 50%; }");
    expect(rule("w-full")).toBe(".w-full { width: 100%; }");
    // UnoCSS spells a side either way
    expect(rule("m-t-4")).toBe(".m-t-4 { margin-top: var(--slidev-rem); }");
    expect(rule("px-20")).toContain("padding-left: calc(5 * var(--slidev-rem)); padding-right:");
  });

  test("negative values, arbitrary values and px are scaled to the stage", () => {
    expect(rule("-bottom-9")).toBe(".-bottom-9 { bottom: calc(-1 * 2.25 * var(--slidev-rem)); }");
    expect(rule("-mt-4")).toBe(".-mt-4 { margin-top: calc(-1 * var(--slidev-rem)); }");
    expect(rule("-rotate-10")).toBe(".-rotate-10 { rotate: -10deg; }");
    expect(rule("-z-1")).toBe(".-z-1 { z-index: -1; }");
    expect(rule("w-[300px]")).toBe(".w-\\[300px\\] { width: 587.7551px; }");
    expect(rule("top-[10px]", 2)).toBe(".top-\\[10px\\] { top: 20px; }");
    expect(rule("grid-cols-[1fr_max-content]")).toBe(
      ".grid-cols-\\[1fr_max-content\\] { grid-template-columns: 1fr max-content; }",
    );
  });

  test("type, colours and opacity", () => {
    expect(rule("text-3xl")).toBe(
      ".text-3xl { font-size: calc(1.875 * var(--slidev-rem)); line-height: calc(2.25 * var(--slidev-rem)); }",
    );
    expect(rule("text-red-400")).toContain(
      "color: oklch(70.4% 0.191 22.216 / var(--un-text-opacity))",
    );
    // a bare colour is shade 400, as in UnoCSS
    expect(rule("text-red")).toBe(rule("text-red-400").replace(/text-red-400/, "text-red"));
    expect(rule("text-[#2B90B6]")).toContain("color: rgb(43 144 182 / var(--un-text-opacity))");
    expect(rule("bg-white/10")).toBe(
      ".bg-white\\/10 { background-color: rgb(255 255 255 / 0.1); }",
    );
    expect(rule("bg-primary/10")).toBe(
      ".bg-primary\\/10 { background-color: color-mix(in oklab, var(--deck-accent) calc(0.1 * 100%), transparent); }",
    );
    expect(rule("op70")).toBe(".op70 { opacity: 0.7; }");
    expect(rule("opacity-50")).toBe(".opacity-50 { opacity: 0.5; }");
    expect(rule("bg-op-10")).toBe(".bg-op-10 { --un-bg-opacity: 0.1; }");
    expect(rule("font-mono")).toBe(".font-mono { font-family: var(--deck-mono-font); }");
    expect(rule("bg-$slidev-code-background")).toContain("var(--deck-code-bg)");
  });

  test("Slidev's shortcuts: abs-*, border-main, bg-main, slidev-icon-btn", () => {
    expect(rule("abs-br")).toBe(".abs-br { position: absolute; bottom: 0; right: 0; }");
    expect(rule("border-main")).toBe(
      ".border-main { border-color: oklch(70.7% 0.022 261.325 / 0.2); }",
    );
    expect(rule("bg-main")).toContain(':where([data-color-scheme="dark"]) .bg-main');
    const btn = rule("slidev-icon-btn");
    expect(btn).toContain(".slidev-icon-btn { display: inline-flex;");
    expect(btn).toContain(".slidev-icon-btn:hover {");
  });

  test("variants: hover, dark, breakpoints, important, all, forward", () => {
    expect(rule("hover:bg-white")).toContain(".hover\\:bg-white:hover {");
    expect(rule("dark:text-white")).toContain(
      ':where([data-color-scheme="dark"]) .dark\\:text-white {',
    );
    expect(rule("md:p-2")).toBe(
      "@media (min-width: 768px) { .md\\:p-2 { padding: calc(0.5 * var(--slidev-rem)); } }",
    );
    expect(rule("!opacity-0")).toBe(".\\!opacity-0 { opacity: 0 !important; }");
    expect(rule("opacity-0!")).toBe(".opacity-0\\! { opacity: 0 !important; }");
    expect(rule("!all:leading-12")).toBe(
      ".\\!all\\:leading-12 * { line-height: calc(3 * var(--slidev-rem)) !important; }",
    );
    expect(rule("forward:delay-300")).toContain(
      ':where([data-nav-direction="forward"]) .forward\\:delay-300',
    );
  });

  test("rules come out in UnoCSS's order, media queries last; unknown classes are listed", () => {
    const out = css(["md:p-2", "px-4", "p-2", "my-own-class", "prose"]);
    const lines = out.css.split("\n");
    expect(lines[0]).toStartWith(".px-4");
    expect(lines[1]).toStartWith(".p-2");
    expect(lines.at(-1)).toStartWith("@media");
    expect(out.unknown).toEqual(["my-own-class", "prose"]);
  });

  test("animations bring their keyframes", () => {
    const out = rule("animate-ping");
    expect(out).toContain("@keyframes slidev-ping");
    expect(out).toContain(".animate-ping { animation: slidev-ping");
  });
});

describe("attributify and variant groups", () => {
  test("a valued attribute stands for class tokens", () => {
    expect(attributifyClasses("grid", "~ cols-2 gap-4")).toEqual([
      "grid",
      "grid-cols-2",
      "grid-gap-4",
    ]);
    expect(attributifyClasses("m", "t-4")).toEqual(["m-t-4"]);
    expect(attributifyClasses("hover:bg", "white op-10")).toEqual([
      "hover:bg-white",
      "hover:bg-op-10",
    ]);
    expect(attributifyClasses("border", "~ main rounded-md")).toEqual([
      "border",
      "border-main",
      "border-rounded-md",
    ]);
    expect(attributifyClasses("outline", "!none")).toEqual(["!outline-none"]);
    expect(attributifyClasses("flex", "~")).toEqual(["flex"]);
  });

  test("a bare attribute is a class only when it is a utility", () => {
    expect(attributifyClasses("text-sm", true)).toEqual(["text-sm"]);
    expect(attributifyClasses("op70", true)).toEqual(["op70"]);
    expect(attributifyClasses("two-way", true)).toBeNull();
    expect(attributifyClasses("alt", "x")).toBeNull();
    // a value that does not resolve keeps the attribute an attribute
    expect(attributifyClasses("text", "Hello world")).toBeNull();
  });

  test("variant groups expand", () => {
    expect(expandVariantGroups("a hover:(b c) d")).toBe("a hover:b hover:c d");
    expect(expandVariantGroups("dark:hover:(x y)")).toBe("dark:hover:x dark:hover:y");
  });

  test("isUtility", () => {
    expect(isUtility("text-center")).toBe(true);
    expect(isUtility("footnotes")).toBe(false);
  });
});

describe("@apply and CSS lengths", () => {
  test("@apply's list becomes declarations", () => {
    expect(applyDeclarations("mt-5 opacity-10", 2).css).toBe(
      "margin-top: calc(1.25 * var(--slidev-rem)); opacity: 0.1;",
    );
    expect(applyDeclarations("text-sm made-up", 2).unknown).toEqual(["made-up"]);
  });

  test("px scales, 1px and 0 stay, rem becomes Slidev's", () => {
    expect(scaleCssValue("20px 1px 0px", 2)).toBe("40px 1px 0px");
    expect(scaleCssValue("1.5rem", 2)).toBe("calc(1.5 * var(--slidev-rem))");
  });
});
