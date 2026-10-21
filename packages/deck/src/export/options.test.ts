import { describe, expect, test } from "bun:test";

import { UsageError, parseArgs } from "../cli/args.ts";
import { deckMarkdown } from "./markdown.ts";
import { EXPORT_FLAGS, exportOptionsFrom, joinSwitchValues } from "./run.ts";
import { fileStem, plainNotes, pngName } from "./shared.ts";

const opts = (argv: string[]) =>
  exportOptionsFrom(parseArgs(joinSwitchValues(argv), EXPORT_FLAGS).flags);

describe("export flags", () => {
  test("a PDF by default; switches add formats", () => {
    expect(opts([]).formats).toEqual(["pdf"]);
    expect(opts(["--png", "--pptx-editable", "--md"]).formats).toEqual([
      "pdf",
      "png",
      "pptx-editable",
      "md",
    ]);
    expect(opts(["--no-pdf", "--png"]).formats).toEqual(["png"]);
  });

  test("--format lists exactly what it names, in a stable order", () => {
    expect(opts(["--format", "md,pptx-editable"]).formats).toEqual(["pptx-editable", "md"]);
    expect(opts(["--format", "png", "--format", "pdf"]).formats).toEqual(["pdf", "png"]);
    expect(() => opts(["--format", "docx"])).toThrow(UsageError);
  });

  test("Slidev's spelling of a switch's value works too", () => {
    expect(opts(["--with-clicks", "false"]).withClicks).toBe(false);
    expect(opts(["--with-clicks"]).withClicks).toBe(true);
    expect(opts(["--no-with-clicks"]).withClicks).toBe(false);
    expect(opts([]).withClicks).toBeNull();
    expect(opts(["--with-toc", "false"]).withToc).toBe(false);
    expect(opts([]).withToc).toBe(true);
  });

  test("scheme, range, waits and the browser", () => {
    const o = opts([
      "--dark",
      "--range",
      "1,3-5",
      "--timeout",
      "60000",
      "--wait",
      "500",
      "--wait-until",
      "none",
      "--executable-path",
      "/opt/chrome",
      "--omit-background",
      "--per-slide",
      "--output",
      "talk.pdf",
    ]);
    expect(o).toMatchObject({
      scheme: "dark",
      range: "1,3-5",
      timeout: 60000,
      wait: 500,
      waitUntil: "none",
      executablePath: "/opt/chrome",
      omitBackground: true,
      perSlide: true,
      name: "talk",
    });
    expect(opts(["--scheme", "light", "--dark"]).scheme).toBe("light");
  });

  test("bad values are usage errors", () => {
    expect(() => opts(["--range", "1,x"])).toThrow(UsageError);
    expect(() => opts(["--scheme", "sepia"])).toThrow(UsageError);
    expect(() => opts(["--wait-until", "idle"])).toThrow(UsageError);
    expect(() => opts(["--timeout", "0"])).toThrow(UsageError);
    expect(() => opts(["--output", "out/talk"])).toThrow(UsageError);
  });
});

describe("names", () => {
  test("a PNG per page, named by slide and step", () => {
    expect(pngName({ slide: 0, click: 0, notes: false }, 1, 0)).toBe("001.png");
    expect(pngName({ slide: 11, click: 2, notes: false }, 3, 14)).toBe("012-2.png");
    expect(pngName({ slide: 11, click: 0, notes: true }, 3, 15)).toBe("012-notes.png");
    expect(pngName({ slide: null, click: 0, notes: false }, 1, 4)).toBe("page-005.png");
  });
  test("notes lose their click markers", () => {
    expect(plainNotes("[click] One.\n\n\n\n[click:3] Two.  \nThree")).toBe("One.\n\nTwo.\nThree");
  });
  test("a file name from a title", () => {
    expect(fileStem("Kadal Deck — the tour!")).toBe("kadal-deck-the-tour");
    expect(fileStem("   ", "deck")).toBe("deck");
    expect(fileStem("Café crème")).toBe("cafe-creme");
  });
});

describe("deckMarkdown", () => {
  test("Slidev's shape: pictures, notes, --- between slides", () => {
    const md = deckMarkdown([
      { number: 1, title: "Hello [world]", images: ["./png/001.png"], notes: "Say hi." },
      { number: 2, title: null, images: ["./png/002-0.png", "./png/002-1.png"], notes: "" },
    ]);
    expect(md).toBe(
      "![Hello \\[world\\]](./png/001.png)\n\nSay hi.\n\n---\n\n![Slide 2](./png/002-0.png)\n\n![Slide 2](./png/002-1.png)\n",
    );
  });
  test("a path with spaces stays one link", () => {
    expect(
      deckMarkdown([{ number: 1, title: "A", images: ["./my png/1.png"], notes: "" }]),
    ).toContain("](<./my png/1.png>)");
  });
});
