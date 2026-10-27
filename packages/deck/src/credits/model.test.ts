import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { prepareDeck } from "../compiler/pipeline.ts";
import { resolveConfig } from "../core/model.ts";
import { DeckContext, type DeckRuntime, type ViewMode } from "../react/context.ts";
import { Credits, CreditsLink } from "./Credits.tsx";
import {
  collectCredits,
  creditsLinkTarget,
  creditsOptions,
  licenceLabel,
  licenceUrl,
  resolvedCredits,
  scanTags,
} from "./model.ts";

describe("reading a slide's media tags", () => {
  test("strings, literal objects, bare props; code is not use", () => {
    const tags = scanTags(
      [
        '<Gif provider="klipy" slug="hi-1" src="https://static.klipy.com/a.webp" title="Hi" width={498} />',
        "<Meme src='https://i.imgflip.com/x.jpg' template={{ provider: 'imgflip', id: '1', url: 'https://imgflip.com/meme/1/X', name: 'X' }} captions={[{ text: 'a', x: 5, y: 3 }]} />",
        "```mdx",
        '<Gif provider="klipy" slug="in-code" src="x" />',
        "```",
        'Inline `<Emoji name="nope" />` and a real <Emoji name="fire" set="twemoji" />',
        '<mdi-rocket /> <Chip icon="tabler:star">x</Chip> <my-widget />',
      ].join("\n"),
    );
    expect(tags.map((t) => t.name)).toEqual(["Gif", "Meme", "Emoji", "Icon", "Icon"]);
    expect(tags[0]!.attrs).toMatchObject({ provider: "klipy", slug: "hi-1", width: 498 });
    expect(tags[1]!.attrs.template).toEqual({
      provider: "imgflip",
      id: "1",
      url: "https://imgflip.com/meme/1/X",
      name: "X",
    });
    expect(tags[3]!.attrs.name).toBe("mdi:rocket");
    expect(tags[4]!.attrs.name).toBe("tabler:star");
  });

  test("an expression the compiler can't read is skipped, the rest of the tag still counts", () => {
    const [t] = scanTags('<Gif src={url} {...rest} title="Wave" provider="klipy" />');
    expect(t!.attrs.src).toBeUndefined();
    expect(t!.attrs.title).toBe("Wave");
  });
});

describe("collecting the credits", () => {
  const slides = [
    `# One\n\n<Gif provider="klipy" slug="hi-1" src="https://static.klipy.com/a.webp" title="Hello" />\n<Emoji name="fire" set="twemoji" /> <Emoji char="🎉" set="twemoji" />`,
    `<Gif provider="klipy" slug="hi-1" src="https://static.klipy.com/a.webp" title="Hello" />\n<Icon name="rocket" /> <Icon name="mdi:account" /> <Icon name="mdi:home" />`,
    `<Meme src="https://i.imgflip.com/30b1gx.jpg" template={{ provider: "imgflip", id: "181913649", url: "https://imgflip.com/meme/181913649/Drake-Hotline-Bling", name: "Drake Hotline Bling" }} captions={[{ text: "Slides", x: 52, y: 8 }]} />`,
    `<Sticker provider="kadal" id="kadal/ship-it" src="https://deck.kadal.cc/api/v1/media/kadal/files/v1/s.webp" alt="Ship it" />\n<Gif provider="kadal" id="kadal/loading" src="https://x/l.webp" title="Loading forever" />`,
    `<Sticker src="https://decks.kadal.cc/emoji/noto-animated/1f680.webp" alt="rocket" />\n<Image src="/harbour.jpg" alt="" credit="“Harbour at dawn” by Ana Ruiz" creditUrl="https://flickr.com/p/1" license="CC BY 2.0" />\n<Emoji name="wave" />`,
  ];
  const groups = collectCredits(slides);

  test("grouped by source, in the order the deck first uses them, without repeats", () => {
    expect(groups.map((g) => g.id)).toEqual([
      "klipy",
      "emoji:twemoji",
      "iconify:lucide",
      "iconify:mdi",
      "imgflip",
      "font:anton",
      "kadal",
      "emoji:noto-animated",
      "image",
      "emoji:fluent",
    ]);
    const klipy = groups.find((g) => g.id === "klipy")!;
    expect(klipy).toMatchObject({
      label: "GIFs via KLIPY",
      licence: "KLIPY API terms",
      url: "https://klipy.com",
    });
    expect(klipy.items).toEqual([{ title: "Hello", href: "https://klipy.com/gifs/hi-1" }]);
    expect(groups.find((g) => g.id === "emoji:twemoji")).toMatchObject({
      label: "Twemoji",
      licence: "CC BY 4.0",
      show: "count",
    });
    expect(groups.find((g) => g.id === "emoji:twemoji")!.items).toHaveLength(2);
  });

  test("each Iconify set by its own name, author and licence", () => {
    const mdi = groups.find((g) => g.id === "iconify:mdi")!;
    expect(mdi.label).toBe("Material Design Icons");
    expect(mdi.licence).toBe("Apache 2.0");
    expect(mdi.url).toBe("https://icon-sets.iconify.design/mdi/");
    expect(mdi.items.map((i) => i.title)).toEqual(["mdi:account", "mdi:home"]);
    expect(groups.find((g) => g.id === "iconify:lucide")!.licence).toBe("ISC");
  });

  test("Imgflip's link back, Anton for the captions, Kadal, a photo's own licence", () => {
    expect(groups.find((g) => g.id === "imgflip")!.items).toEqual([
      {
        title: "Drake Hotline Bling",
        href: "https://imgflip.com/meme/181913649/Drake-Hotline-Bling",
      },
    ]);
    expect(groups.find((g) => g.id === "font:anton")!.licence).toBe("SIL OFL 1.1");
    expect(groups.find((g) => g.id === "kadal")!.items.map((i) => i.title)).toEqual([
      "Ship it",
      "Loading forever",
    ]);
    expect(groups.find((g) => g.id === "image")!.items).toEqual([
      {
        title: "“Harbour at dawn” by Ana Ruiz",
        href: "https://flickr.com/p/1",
        licence: "CC BY 2.0",
        licenceUrl: "https://creativecommons.org/licenses/by/2.0/",
      },
    ]);
  });

  test("licence names and links", () => {
    expect(licenceLabel("CC-BY-SA-4.0")).toBe("CC BY-SA 4.0");
    expect(licenceLabel("Apache-2.0")).toBe("Apache 2.0");
    expect(licenceUrl("CC-BY-4.0")).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(licenceUrl("MIT")).toBe("https://spdx.org/licenses/MIT.html");
  });
});

describe("credits: in the headmatter", () => {
  test("true, an object, or off", () => {
    expect(creditsOptions(true)).toEqual({ slide: "before-last", footer: true, title: "Credits" });
    expect(creditsOptions({ footer: false, title: "Thanks", slide: "end" })).toEqual({
      slide: "end",
      footer: false,
      title: "Thanks",
    });
    expect(creditsOptions(false)).toBeNull();
    expect(creditsOptions(undefined)).toBeNull();
  });

  const deck = (head: string, ...bodies: string[]) =>
    prepareDeck([`---\n${head}\n---\n\n# Title`, ...bodies].join("\n\n---\n\n"), {
      file: "deck.mdx",
    });
  const gif = '<Gif provider="klipy" slug="a" src="https://static.klipy.com/a.webp" title="A" />';

  test("the slide goes in before the last, and the slides after it move along", () => {
    const d = deck("credits: true", gif, "# Thank you");
    expect(d.slides.map((s) => s.frontmatter.id ?? null)).toEqual([null, null, "credits", null]);
    expect(d.slides.map((s) => s.h)).toEqual([0, 1, 2, 3]);
    expect(d.slides.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    const made = d.slides[2]!;
    expect(made.content).toBe("<Credits />");
    expect(made.frontmatter).toMatchObject({
      title: "Credits",
      generated: "credits",
      layout: "default",
    });
    expect(made.source.file).toBe("<credits>");
    const c = resolvedCredits(d.headmatter.credits)!;
    expect(c.at).toBe("credits");
    expect(c.groups.map((g) => g.id)).toEqual(["klipy"]);
  });

  test('slide: "end", a one-slide deck, a deck with nothing to credit', () => {
    expect(deck("credits: { slide: end }", gif, "# Bye").slides.at(-1)!.frontmatter.id).toBe(
      "credits",
    );
    const one = prepareDeck(`---\ncredits: true\n---\n\n${gif}`, { file: "deck.mdx" });
    expect(one.slides.map((s) => s.frontmatter.id ?? null)).toEqual([null, "credits"]);
    const none = deck("credits: true", "# Plain", "# Bye");
    expect(none.slides).toHaveLength(3);
    expect(resolvedCredits(none.headmatter.credits)).toMatchObject({ groups: [], at: null });
  });

  test("a slide that places <Credits /> is used, given the id the link needs", () => {
    const d = deck("credits: true", gif, "<Credits />", "# Bye");
    expect(d.slides).toHaveLength(4);
    expect(d.slides[2]!.frontmatter.id).toBe("credits");
    // Without `credits`, a placed <Credits /> still gets its list, and no footer.
    const placed = deck("title: x", gif, "<Credits />");
    expect(resolvedCredits(placed.headmatter.credits)).toMatchObject({
      footer: false,
      at: "credits",
    });
    expect(resolvedCredits(placed.headmatter.credits)!.groups).toHaveLength(1);
  });

  test("without credits and without <Credits />, the deck is as it was", () => {
    const d = deck("title: x", gif);
    expect(d.headmatter.credits).toBeUndefined();
    expect(d.slides).toHaveLength(2);
  });
});

/** Just enough of a deck: columns for the link's slide number. */
function render(el: ReturnType<typeof createElement>, credits: unknown, mode: ViewMode = "play") {
  const config = resolveConfig({ credits } as never);
  const slide = (id: string) => ({ id, frontmatter: {} });
  const deck = {
    mode,
    config,
    columns: [
      { h: 0, slides: [slide("s0")] },
      { h: 1, slides: [slide("credits")] },
      { h: 2, slides: [slide("s2")] },
    ],
    actions: { gotoId: () => {} },
  } as unknown as DeckRuntime;
  return renderToStaticMarkup(createElement(DeckContext.Provider, { value: deck }, el));
}

describe("<Credits /> and the corner link", () => {
  const credits = {
    slide: "before-last",
    footer: true,
    title: "Credits",
    at: "credits",
    groups: collectCredits([
      '<Gif provider="klipy" slug="a" src="https://static.klipy.com/a.webp" title="A wave" /> <Emoji name="fire" set="twemoji" />',
    ]),
  };

  test("a card per source: its name linked, the licence linked, the items or a count", () => {
    const html = render(createElement(Credits), credits);
    expect(html).toContain('<h1 class="deck-credits-title">Credits</h1>');
    expect(html).toContain('href="https://klipy.com"');
    expect(html).toContain("GIFs via KLIPY");
    expect(html).toContain("A wave");
    expect(html).toContain("Twemoji");
    expect(html).toContain("1 emoji");
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
  });

  test("the link: a link on the other slides, none on the credits slide, a line in print", () => {
    expect(render(createElement(CreditsLink, { slideId: "s0" }), credits)).toContain(
      'href="#/credits"',
    );
    expect(render(createElement(CreditsLink, { slideId: "s0" }), credits)).toContain("(slide 2)");
    expect(render(createElement(CreditsLink, { slideId: "credits" }), credits)).toBe("");
    const print = render(createElement(CreditsLink, { slideId: "s0" }), credits, "print");
    expect(print).toContain("Credits · slide 2");
    expect(print).not.toContain("href");
    expect(creditsLinkTarget({ ...credits, footer: false }, "s0")).toBeNull();
    expect(creditsLinkTarget({ ...credits, groups: [] }, "s0")).toBeNull();
  });
});
