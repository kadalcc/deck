import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compile } from "@mdx-js/mdx";

import { remarkIcons } from "../compiler/remark-icons.ts";
import { type IconifySet, iconFromSet, iconFromTag, nearIconNames, parseIconName } from "./data.ts";
import { iconRegistration, loadIconSet, resolveIcons } from "./node.ts";

const SET: IconifySet = {
  prefix: "test",
  width: 24,
  height: 24,
  icons: {
    account: { body: '<path d="M0 0h24v24H0z"/>' },
    wide: { body: "<circle r='4'/>", width: 48 },
  },
  aliases: {
    user: { parent: "account" },
    "user-flipped": { parent: "user", hFlip: true },
    "account-turned": { parent: "account", rotate: 1 },
  },
};

describe("icon names", () => {
  test("a tag is an icon when a known set starts it, the longest set winning", () => {
    expect(iconFromTag("mdi-account-circle")).toBe("mdi:account-circle");
    expect(iconFromTag("mdi-light-home")).toBe("mdi-light:home");
    expect(iconFromTag("simple-icons-github")).toBe("simple-icons:github");
    expect(iconFromTag("logos-vue")).toBe("logos:vue");
    expect(iconFromTag("i-carbon-logo-github")).toBe("carbon:logo-github");
    expect(iconFromTag("i-carbon:arrow-up")).toBe("carbon:arrow-up");
  });

  test("a custom element stays one", () => {
    expect(iconFromTag("my-widget")).toBeNull();
    expect(iconFromTag("deck-thing")).toBeNull();
    expect(iconFromTag("mdi")).toBeNull();
  });

  test("set:name parses; a Lucide name has no set", () => {
    expect(parseIconName("mdi:account")).toEqual({ prefix: "mdi", name: "account" });
    expect(parseIconName("rocket")).toBeNull();
    expect(parseIconName("mdi:Account")).toBeNull();
  });
});

describe("icons out of a set", () => {
  test("an icon takes the set's size unless it has its own", () => {
    expect(iconFromSet(SET, "account")).toEqual({
      body: SET.icons.account!.body,
      width: 24,
      height: 24,
    });
    expect(iconFromSet(SET, "wide")?.width).toBe(48);
    expect(iconFromSet(SET, "nope")).toBeNull();
  });

  test("aliases are followed, their flips and turns applied", () => {
    expect(iconFromSet(SET, "user")?.body).toBe(SET.icons.account!.body);
    expect(iconFromSet(SET, "user-flipped")?.body).toContain("scale(-1 1)");
    expect(iconFromSet(SET, "account-turned")?.body).toContain("rotate(90");
  });

  test("near names for a misspelling", () => {
    expect(nearIconNames(SET, "acount")).toContain("account");
  });
});

describe("icons from the deck's node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "deck-icons-"));
  writeFileSync(join(dir, "package.json"), "{}");
  mkdirSync(join(dir, "node_modules", "@iconify-json", "zz-test-set"), { recursive: true });
  writeFileSync(
    join(dir, "node_modules", "@iconify-json", "zz-test-set", "icons.json"),
    JSON.stringify({ ...SET, prefix: "zz-test-set" }),
  );

  test("an installed set is read; a missing one says how to install it", () => {
    expect(loadIconSet("zz-test-set", dir)?.prefix).toBe("zz-test-set");
    const out = resolveIcons(["zz-test-set:account", "zz-test-set:nope", "zz-nothing:x"], dir);
    expect(Object.keys(out.icons)).toEqual(["zz-test-set:account"]);
    expect(out.missing.map((m) => m.name)).toEqual(["zz-test-set:nope", "zz-nothing:x"]);
    expect(out.missing[1]!.reason).toContain("@iconify-json/zz-nothing");
  });

  test("the slide module registers what it found, and nothing when it found nothing", () => {
    expect(iconRegistration({})).toBe("");
    const line = iconRegistration(resolveIcons(["zz-test-set:account"], dir).icons);
    expect(line).toContain('from "@kadal/deck"');
    expect(line).toContain('"zz-test-set:account"');
  });
});

describe("remark-icons", () => {
  const run = async (src: string) => {
    const heard: string[] = [];
    const code = String(
      await compile(src, {
        jsx: true,
        remarkPlugins: [[remarkIcons, { onIcon: (n: string) => heard.push(n) }]],
      }),
    );
    return { code, heard };
  };

  test("Slidev's tag form becomes <Icon>, at 1.2em, keeping its attributes", async () => {
    const { code, heard } = await run(`A <mdi-account class="text-3xl" /> B\n\n<logos-vue />`);
    expect(code).toContain('<Icon name="mdi:account" size="1.2em" class="text-3xl" />');
    expect(code).toContain('name="logos:vue"');
    expect(heard).toEqual(["mdi:account", "logos:vue"]);
  });

  test("a size of its own wins; UnoCSS's class form works on an empty element", async () => {
    const { code } = await run(
      `<carbon-x size="2em" />\n\n<div class="i-carbon-logo-github mr-2" />`,
    );
    expect(code).toContain('name="carbon:x" size="2em"');
    expect(code).toContain('name="carbon:logo-github" size="1.2em" className="mr-2"');
  });

  test("custom elements, and elements with children, are left alone", async () => {
    const { code, heard } = await run(`<my-widget />\n\n<ion-button>Go</ion-button>`);
    expect(code).not.toContain("Icon");
    expect(heard).toEqual([]);
  });

  test("names in <Icon name> and icon= props are heard, so the build can bundle them", async () => {
    const { heard } = await run(
      `<Icon name="mdi:star" /> <Chip icon="tabler:bolt">x</Chip> <Icon name="rocket" />`,
    );
    expect(heard).toEqual(["mdi:star", "tabler:bolt"]);
  });
});
