import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SlideContext, type SlideContextValue } from "../react/context.ts";
import { Poll } from "./components.tsx";

const poll = (preview: boolean) =>
  renderToStaticMarkup(
    createElement(
      SlideContext.Provider,
      { value: { click: 0, active: !preview, preview } as unknown as SlideContextValue },
      createElement(Poll, {
        id: "pace",
        question: "How's the pace?",
        options: ["Slower", "Faster"],
      }),
    ),
  );

describe("a poll with no room behind it", () => {
  test("on the slide it says it's offline, so a rehearsal makes sense", () => {
    const html = poll(false);
    expect(html).toContain("offline · 0");
    expect(html).toContain("0% · 0");
  });

  test("a still copy (the phone remote's mirror, the overview, print) claims no answers", () => {
    const html = poll(true);
    expect(html).toContain("How&#x27;s the pace?");
    expect(html).toContain("Slower");
    expect(html).not.toContain("offline");
    expect(html).not.toContain("0% · 0");
  });
});
