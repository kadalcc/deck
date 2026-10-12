import type { Catalog, CatalogSection, FrontmatterKey, PropInfo } from "./types.ts";

/**
 * The catalog as Markdown: the reference shipped as REFERENCE.md, the agent skill's generated
 * reference files, and `kadal-deck info` without --json.
 */

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (s: string) => (s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``);

function propsTable(props: PropInfo[]): string {
  const shown = props.filter((p) => !["className", "style", "html", "moreHtml"].includes(p.name));
  if (!shown.length) return "";
  const rows = shown.map(
    (p) =>
      `| ${code(p.name)}${p.required ? " *" : ""} | ${cell(code(p.type.text))} | ${p.default !== undefined ? cell(code(p.default)) : ""} | ${cell(p.description ?? "")} |`,
  );
  return `| prop | type | default | |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}

function fence(lang: string, body: string): string {
  const ticks = body.includes("````") ? "`````" : body.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${body}\n${ticks}`;
}

function keysTable(keys: FrontmatterKey[]): string {
  const rows = keys.map((k) => {
    const def = k.default === undefined ? "" : cell(code(JSON.stringify(k.default)));
    const values = k.type.variants.flatMap((v) => v.enum ?? []).map(String);
    const allowed = values.length
      ? values.map((v) => code(v)).join(" ")
      : k.type.suggest?.length
        ? `e.g. ${k.type.suggest
            .slice(0, 8)
            .map((v) => code(v))
            .join(" ")}`
        : "";
    return `| ${code(k.name)} | ${cell(code(k.type.text))} | ${def} | ${cell([k.description, allowed && `Values: ${allowed}`].filter(Boolean).join(" "))} |`;
  });
  return `| key | type | default | |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}

const TITLES: Record<CatalogSection, string> = {
  components: "Components",
  layouts: "Layouts",
  backgrounds: "Backgrounds",
  themes: "Themes",
  transitions: "Transitions",
  transitionSpeeds: "Transition speeds",
  clickEffects: "Click effects",
  clickAt: "Click timing (`at`)",
  codeMeta: "Code blocks",
  deckFrontmatter: "Deck frontmatter (headmatter)",
  slideFrontmatter: "Slide frontmatter",
  keys: "Keyboard",
  routes: "Routes",
  queryParams: "Query parameters",
  live: "The live room",
  cli: "The CLI",
  exitCodes: "Exit codes",
};

/** One section as Markdown, with a `##` heading (or `#` with `level: 1`). */
export function sectionMarkdown(catalog: Catalog, section: CatalogSection, level = 2): string {
  const h = "#".repeat(level);
  const out: string[] = [`${h} ${TITLES[section]}`, ""];
  switch (section) {
    case "components": {
      const byCat = new Map<string, typeof catalog.components>();
      for (const c of catalog.components) {
        if (c.mapping && /^[a-z]/.test(c.name)) continue;
        const list = byCat.get(c.category) ?? [];
        list.push(c);
        byCat.set(c.category, list);
      }
      out.push(
        "Every component below works in any slide without an import. Your own go in `src/components.tsx`.",
        "",
      );
      for (const [cat, list] of byCat) {
        out.push(`${h}# ${cat[0]!.toUpperCase()}${cat.slice(1)}`, "");
        for (const c of list) {
          out.push(
            `${h}## \`<${c.name}>\`${c.aliasOf ? ` (= \`<${c.aliasOf}>\`)` : ""}${c.live ? " · live room" : ""}`,
            "",
            c.summary,
            "",
            fence("mdx", c.example),
            "",
          );
          if (!c.aliasOf && !c.mapping) {
            const t = propsTable(c.props);
            if (t) out.push(t);
          }
        }
      }
      break;
    }
    case "layouts":
      out.push("Pick one with `layout: <name>` in a slide's frontmatter.", "");
      for (const l of catalog.layouts) {
        out.push(
          `- **${l.name}** — ${l.summary}${l.keys.length ? ` Reads: ${l.keys.map(code).join(", ")}.` : ""}${l.slots.length ? ` Slots: ${l.slots.map((s) => code(`::${s}::`)).join(", ")}.` : ""}`,
        );
      }
      out.push("", 'Custom layouts: add `"layout:name": Component` to `src/components.tsx`.', "");
      break;
    case "backgrounds": {
      out.push(
        "`background: <name>` in frontmatter, `{ component: <name>, ...props }` for props, or `<Background name>` in the slide. Colours are CSS strings; `rgba()` sets their weight. With a component, `color` is its stroke and `fill`/`tint` washes the layer.",
        "",
      );
      for (const fam of ["ambient", "quiet", "map", "sign", "plain"]) {
        const list = catalog.backgrounds.filter((b) => b.family === fam);
        if (!list.length) continue;
        out.push(
          `${h}# ${fam === "plain" ? "Not components" : `${fam[0]!.toUpperCase()}${fam.slice(1)}`}`,
          "",
        );
        for (const b of list) {
          const props = b.props.map(
            (p) => `${p.name}${p.default !== undefined ? `=${p.default}` : ""}`,
          );
          out.push(
            `- **${b.name}**${b.aliases.length ? ` (also ${b.aliases.join(", ")})` : ""} — ${b.summary}${props.length ? ` Props: ${props.map(code).join(", ")}.` : ""} ${code(b.example)}`,
          );
        }
        out.push("");
      }
      break;
    }
    case "themes":
      for (const t of catalog.themes)
        out.push(`- **${t.name}** (${t.scheme}) — ${t.summary} CSS: ${code(t.css)}`);
      out.push("");
      break;
    case "deckFrontmatter":
      out.push(
        "The YAML block at the very top of deck.mdx. It configures the deck and is also the first slide's frontmatter. `deck.config.ts` overrides it.",
        "",
        keysTable(catalog.deckFrontmatter),
      );
      break;
    case "slideFrontmatter":
      out.push(
        "YAML right after a slide's `---` separator, closed by another `---`.",
        "",
        keysTable(catalog.slideFrontmatter),
      );
      break;
    case "codeMeta":
      for (const c of catalog.codeMeta)
        out.push(`- ${code(c.syntax)} — ${c.summary}`, "", fence("mdx", c.example), "");
      break;
    case "keys":
      for (const k of catalog.keys) out.push(`- ${code(k.label)} — ${k.description}`);
      out.push("");
      break;
    case "routes":
      for (const r of catalog.routes) out.push(`- ${code(r.path)} — ${r.summary}`);
      out.push("");
      break;
    case "queryParams":
      for (const q of catalog.queryParams) out.push(`- ${code(q.param)} — ${q.summary}`);
      out.push("");
      break;
    case "live":
      for (const l of catalog.live)
        out.push(
          `- **${l.name}** — ${l.summary}${l.components.length ? ` (${l.components.map((c) => code(`<${c}>`)).join(", ")})` : ""}`,
        );
      out.push("");
      break;
    case "cli":
      for (const c of catalog.cli)
        out.push(`- ${code(c.usage)} — ${c.summary}${c.json ? " `--json`" : ""}`);
      out.push("");
      break;
    case "exitCodes":
      for (const e of catalog.exitCodes) out.push(`- **${e.code}** — ${e.meaning}`);
      out.push("");
      break;
    default:
      for (const item of catalog[section] as Array<{ name: string; summary: string }>)
        out.push(`- ${code(item.name)} — ${item.summary}`);
      out.push("");
  }
  return out.join("\n");
}

/** Several sections (all by default) under one title. */
export function catalogMarkdown(
  catalog: Catalog,
  sections?: CatalogSection[],
  title = `Kadal Deck reference (v${catalog.version})`,
): string {
  const all = sections ?? (Object.keys(catalog).filter((k) => k !== "version") as CatalogSection[]);
  return `# ${title}\n\n${all.map((s) => sectionMarkdown(catalog, s)).join("\n")}`.replace(
    /\n{3,}/g,
    "\n\n",
  );
}
