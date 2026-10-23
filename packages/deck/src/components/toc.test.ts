import { describe, expect, test } from "bun:test";

import { tocShown } from "./content.tsx";

// Two chapters with slides under them, one slide with a sub-slide: titles stand in for slides.
const toc = [
  { title: "Writing", level: 1 },
  { title: "Format", level: 2 },
  { title: "Slots", level: 3 },
  { title: "Layouts", level: 2 },
  { title: "Clicks", level: 1 },
  { title: "Effects", level: 2 },
  { title: "Timing", level: 2 },
];
const titles = (current: string, mode: "all" | "onlyCurrentTree" | "onlySiblings") =>
  tocShown(toc, toc.findIndex((e) => e.title === current), mode).map((e) => e.title);

describe("<Toc mode>", () => {
  test("all lists everything", () => {
    expect(titles("Effects", "all")).toEqual(toc.map((e) => e.title));
  });

  test("onlyCurrentTree: the chapters, and everything under the current one's", () => {
    expect(titles("Effects", "onlyCurrentTree")).toEqual(["Writing", "Clicks", "Effects", "Timing"]);
    expect(titles("Slots", "onlyCurrentTree")).toEqual(["Writing", "Format", "Slots", "Layouts", "Clicks"]);
  });

  test("onlySiblings: the current item's line and the siblings along it, not other chapters' slides", () => {
    expect(titles("Effects", "onlySiblings")).toEqual(["Writing", "Clicks", "Effects", "Timing"]);
    // From a sub-slide: its parent and that parent's siblings, its chapter and the other chapters.
    expect(titles("Slots", "onlySiblings")).toEqual(["Writing", "Format", "Slots", "Layouts", "Clicks"]);
    // From a slide with a child: the child is shown.
    expect(titles("Format", "onlySiblings")).toEqual(["Writing", "Format", "Slots", "Layouts", "Clicks"]);
  });

  test("off the list (a slide kept out of the contents), only the top level", () => {
    expect(tocShown(toc, -1, "onlySiblings").map((e) => e.title)).toEqual(["Writing", "Clicks"]);
  });
});
