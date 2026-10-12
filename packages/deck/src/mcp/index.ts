/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `kadal-deck mcp`  —  Kadal Deck for AI agents, over the Model Context Protocol
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A stdio MCP server rooted at a deck folder. It gives an agent what a person has: the reference
 * (every component, layout, background and option, from the catalog), the deck as structure
 * (an outline, one slide at a time), edits that touch only the lines of the slide in question,
 * the linter, and — the part that matters most — eyes: `slide_render` returns pictures of the
 * slides from a dev server and a headless browser that stay up between calls, so the agent can
 * write, look, and fix. Then build, export and publish, with the CLI's saved login.
 *
 * Loaded only by `kadal-deck mcp` (the SDK, zod and Playwright never slow the normal CLI).
 * stdout is the protocol: everything else — logs, Vite, npm — is routed to stderr.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  type EditResult,
  addSlide,
  deckOnlyKeys,
  findSlide,
  formatDiagnostics,
  moveSlide,
  outlineDeck,
  outlineSlide,
  readDeck,
  removeSlide,
  setNotes,
  updateHeadmatter,
  updateSlide,
} from "../authoring/index.ts";
import {
  CATALOG_SECTIONS,
  catalog,
  catalogMarkdown,
  findEntry,
  frontmatterSchema,
  resolveSection,
  searchCatalog,
  sectionMarkdown,
} from "../catalog/index.ts";
import { loadCredentials } from "../cli/host.ts";
import { type DeckProject, checkProject, openProject, rel, saveEdit } from "../cli/project.ts";
import { DeckServer, SlideRenderer } from "../cli/render.ts";
import { MissingDependencyError, keepStdoutClean, runVite } from "../cli/vite.ts";

export interface McpOptions {
  /** The folder relative `dir` arguments resolve against, and the default deck. */
  dir: string;
}

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

interface ToolResult {
  [key: string]: unknown;
  content: Content[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const ok = (data: Record<string, unknown>, text?: string): ToolResult => ({
  content: [{ type: "text", text: text ?? JSON.stringify(data, null, 2) }],
  structuredContent: data,
});

/**
 * A tool error the agent can act on. No structuredContent: clients validate it against the
 * tool's output schema even on errors, and the text is what the model reads anyway.
 */
const failure = (message: string, extra: Record<string, unknown> = {}): ToolResult => ({
  isError: true,
  content: [
    { type: "text", text: message },
    ...(Object.keys(extra).length ? [{ type: "text" as const, text: JSON.stringify(extra) }] : []),
  ],
});

/** Where the agent skill's Markdown lives: shipped in the package, or the repository's copy. */
function skillDir(): string | null {
  for (const candidate of ["../../skill", "../../../../skills/kadal-deck"]) {
    const dir = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(join(dir, "SKILL.md"))) return dir;
  }
  return null;
}

function guides(): Array<{ name: string; file: string }> {
  const dir = skillDir();
  if (!dir) return [];
  const out = [{ name: "skill", file: join(dir, "SKILL.md") }];
  const refs = join(dir, "references");
  if (existsSync(refs))
    for (const f of readdirSync(refs)
      .filter((f) => f.endsWith(".md"))
      .sort())
      out.push({ name: f.replace(/\.md$/, ""), file: join(refs, f) });
  return out;
}

const DIR = z
  .string()
  .optional()
  .describe(
    "Deck folder (contains deck.mdx). Absolute, or relative to the server's folder. Default: the server's folder.",
  );
const SLIDE = z
  .union([z.number().int().min(0), z.string().min(1)])
  .describe(
    'A slide: 0-based index (authored order, as deck_outline lists them), "h.v", or its id.',
  );
const LOOSE = z.object({}).passthrough();
/** Output schemas name the fields agents rely on and allow more, so results can grow. */
const out = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

export function createServer(options: McpOptions): {
  server: McpServer;
  close: () => Promise<void>;
} {
  const base = resolve(options.dir);
  const live = new Map<string, { server: DeckServer | null; renderer: SlideRenderer | null }>();

  const pathOf = (dir?: string) => (dir ? (isAbsolute(dir) ? dir : resolve(base, dir)) : base);
  const project = (dir?: string): DeckProject => openProject(pathOf(dir));
  const deckKeys = deckOnlyKeys(
    catalog.deckFrontmatter.map((k) => k.name),
    catalog.slideFrontmatter.map((k) => k.name),
  );

  async function devServer(p: DeckProject): Promise<DeckServer> {
    const entry = live.get(p.dir) ?? { server: null, renderer: null };
    if (!entry.server?.alive) {
      entry.server = await DeckServer.start(p.dir, "dev");
      live.set(p.dir, entry);
    }
    return entry.server;
  }

  async function renderer(p: DeckProject): Promise<SlideRenderer> {
    const server = await devServer(p);
    const entry = live.get(p.dir)!;
    entry.renderer ??= new SlideRenderer(p.dir, () => server.url);
    return entry.renderer;
  }

  /** Save an edit and lint the deck, reporting what concerns the edited slide. */
  async function afterEdit(p: DeckProject, result: EditResult, verb: string): Promise<ToolResult> {
    const written = saveEdit(result);
    const check = await checkProject(p);
    const outline = outlineDeck(p.files);
    const slide = result.index !== null ? (outline.slides[result.index] ?? null) : null;
    const own = check.diagnostics.filter((d) => result.index === null || d.slide === result.index);
    const data = {
      ok: true,
      action: verb,
      slide,
      slides: outline.slides.length,
      files: written.map((f) => rel(p, f)),
      notes: result.notes,
      diagnostics: own.map((d) => ({ ...d, file: rel(p, d.file) })),
      deck: { errors: check.errors, warnings: check.warnings },
    };
    const lines = [
      `${verb}${slide ? ` slide ${slide.index} (${slide.title ?? slide.id})` : ""}; the deck has ${outline.slides.length} slides.`,
      ...result.notes.map((n) => `note: ${n}`),
      own.length
        ? formatDiagnostics({ ...check, diagnostics: own }, (f) => rel(p, f))
        : "No problems on this slide.",
      check.errors && own.length !== check.diagnostics.length
        ? `The deck has ${check.errors} error(s) elsewhere; run deck_check.`
        : "",
      "Look at it with slide_render.",
    ].filter(Boolean);
    return ok(data, lines.join("\n"));
  }

  function guard<A>(fn: (args: A) => Promise<ToolResult> | ToolResult) {
    return async (args: A): Promise<ToolResult> => {
      try {
        return await fn(args);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return failure(
          message,
          e instanceof MissingDependencyError ? { missingDependency: true } : {},
        );
      }
    };
  }

  const server = new McpServer(
    { name: "kadal-deck", title: "Kadal Deck", version: catalog.version },
    {
      instructions: [
        "Kadal Deck: presentations written in MDX (deck.mdx). Slides split at `---`, vertical slides at `----`; YAML after a separator is that slide's frontmatter; the YAML at the very top is the headmatter (deck settings + the first slide).",
        "Workflow: deck_reference (look up components/layouts/backgrounds before using them) → deck_create or deck_outline → slide_add / slide_update / notes_set → deck_check → slide_render and LOOK at the pictures → fix → deck_export or deck_publish.",
        "Edit slides through the slide tools rather than rewriting deck.mdx: they change only that slide's lines and lint the result.",
        "Resources: kadal-deck://guide/design (how to make a good talk), kadal-deck://guide/authoring, kadal-deck://reference.",
      ].join("\n"),
    },
  );

  // ── reference ────────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "deck_reference",
    {
      title: "Kadal Deck reference",
      description: `Look up what a deck can use: built-in components (props, defaults, examples), layouts, backgrounds, themes, transitions, click effects, code-fence options, deck/slide frontmatter keys, keyboard, routes, the live room, CLI. Give a section (${CATALOG_SECTIONS.join(", ")}) and optionally a name, or search words. With no arguments, lists the sections. Use it before writing a component or option you have not checked.`,
      inputSchema: {
        section: z
          .string()
          .optional()
          .describe(
            "A section, e.g. components, layouts, backgrounds, slideFrontmatter (aliases: slide, deck, clicks, code…).",
          ),
        name: z
          .string()
          .optional()
          .describe("One entry in the section, e.g. Poll, two-cols, aurora."),
        search: z
          .string()
          .optional()
          .describe("Words to search the whole catalog for, e.g. 'image lightbox'."),
        format: z
          .enum(["markdown", "json"])
          .optional()
          .describe("markdown (default) reads best; json is the raw data."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(
      async ({
        section,
        name,
        search,
        format,
      }: {
        section?: string;
        name?: string;
        search?: string;
        format?: "markdown" | "json";
      }) => {
        if (search) {
          const hits = searchCatalog(search, 15);
          const text =
            format === "json"
              ? JSON.stringify(hits, null, 2)
              : hits.length
                ? hits.map((h) => `- [${h.section}] **${h.name}** — ${h.summary}`).join("\n") +
                  "\n\nCall again with section + name for the full entry."
                : `Nothing matches "${search}".`;
          return ok({ query: search, hits: hits.map(({ item: _i, ...h }) => h) }, text);
        }
        if (!section) {
          const sections = CATALOG_SECTIONS.map((s) => ({
            section: s,
            entries: (catalog[s] as unknown[]).length,
          }));
          return ok(
            { version: catalog.version, sections },
            `Kadal Deck ${catalog.version} reference. Sections:\n${sections.map((s) => `- ${s.section} (${s.entries})`).join("\n")}\n\nCall deck_reference with a section (and a name), or search.`,
          );
        }
        const s = resolveSection(section);
        if (!s) return failure(`No section "${section}". Sections: ${CATALOG_SECTIONS.join(", ")}`);
        if (name) {
          const entry = findEntry(s, name);
          if (!entry) {
            const names = (catalog[s] as Array<{ name?: string }>)
              .map((e) => e.name)
              .filter(Boolean);
            return failure(`No ${s} entry "${name}". Entries: ${names.join(", ")}`);
          }
          return ok(
            { section: s, entry: entry as Record<string, unknown> },
            format === "json"
              ? JSON.stringify(entry, null, 2)
              : sectionMarkdown({ ...catalog, [s]: [entry] }, s),
          );
        }
        return ok(
          { section: s, entries: catalog[s] as unknown as Record<string, unknown> },
          format === "json" ? JSON.stringify(catalog[s], null, 2) : sectionMarkdown(catalog, s),
        );
      },
    ),
  );

  server.registerTool(
    "deck_frontmatter_schema",
    {
      title: "Frontmatter JSON Schema",
      description:
        "The JSON Schema for deck frontmatter: $defs.headmatter for the YAML block at the top of deck.mdx (deck settings + first slide), $defs.slide for every other slide.",
      inputSchema: {
        scope: z
          .enum(["both", "slide", "headmatter"])
          .optional()
          .describe("Which part (default both)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ scope }: { scope?: "both" | "slide" | "headmatter" }) => {
      const schema = frontmatterSchema(catalog);
      const defs = schema.$defs as Record<string, unknown>;
      const out =
        scope === "slide" ? defs.slide : scope === "headmatter" ? defs.headmatter : schema;
      return ok({ schema: out as Record<string, unknown> }, JSON.stringify(out, null, 2));
    }),
  );

  // ── project ──────────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "deck_create",
    {
      title: "Create a deck",
      description:
        "Scaffold a new Kadal Deck folder from the starter (deck.mdx, deck.config.ts, src/, AGENTS.md) and install its dependencies. The folder must not exist or be empty. Afterwards, pass the same `dir` to the other tools.",
      inputSchema: {
        dir: z
          .string()
          .describe("The new deck's folder (absolute, or relative to the server's folder)."),
        title: z.string().optional().describe("The talk's title (default: from the folder name)."),
        install: z
          .boolean()
          .optional()
          .describe(
            "Install dependencies (default true; needed to build, check imports or render).",
          ),
        packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
      },
      outputSchema: out({
        ok: z.boolean(),
        dir: z.string(),
        title: z.string(),
        installed: z.boolean(),
        files: z.array(z.string()),
        next: z.array(z.string()),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(
      async ({
        dir,
        title,
        install,
        packageManager,
      }: {
        dir: string;
        title?: string;
        install?: boolean;
        packageManager?: "npm" | "pnpm" | "yarn" | "bun";
      }) => {
        const { newDeck } = await import("../cli/new.ts");
        const r = await newDeck(pathOf(dir), {
          title,
          install: install !== false,
          pm: packageManager,
          stdio: "stderr",
        });
        return ok(
          {
            ok: true,
            dir: r.dir,
            title: r.title,
            installed: r.installed,
            files: r.files,
            next: r.next,
          },
          `Created "${r.title}" in ${r.dir}${r.installed ? " (dependencies installed)" : " (run an install before rendering)"}.\nFiles: ${r.files.join(", ")}\nNext: deck_outline, then slide_update / slide_add, deck_check, slide_render.`,
        );
      },
    ),
  );

  server.registerTool(
    "deck_outline",
    {
      title: "Deck outline",
      description:
        "Every slide in order: index, column/row (h/v), id, title, layout, hidden, frontmatter, estimated click steps, whether it has notes, an excerpt, and its line range in the file. Start here before editing an existing deck.",
      inputSchema: { dir: DIR },
      outputSchema: out({
        entry: z.string(),
        title: z.string().nullable(),
        headmatter: LOOSE,
        slides: z.array(LOOSE),
        columns: z.number(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ dir }: { dir?: string }) => {
      const p = project(dir);
      const o = outlineDeck(p.files);
      const slides = o.slides.map((s) => ({
        ...s,
        source: { ...s.source, file: rel(p, s.source.file) },
        includedFrom: s.includedFrom && rel(p, s.includedFrom),
      }));
      const text = [
        `${o.title ?? "(untitled)"} — ${o.slides.length} slides in ${o.columns} columns (${rel(p, o.entry)})`,
        ...o.problems.map((pr) => `problem: ${rel(p, pr.file)}:${pr.line} ${pr.message}`),
        ...slides.map(
          (s) =>
            `${String(s.index).padStart(3)}  ${s.v ? `  ${s.h}.${s.v}` : `${s.h}  `.padEnd(5)} ${s.layout.padEnd(12)} ${s.title ?? `(${s.excerpt.slice(0, 50)})`}${s.hidden ? " [hidden]" : ""}${s.clicks ? ` · ${s.clicks} click${s.clicks > 1 ? "s" : ""}` : ""}${s.notes ? " · notes" : ""}  ${s.source.file}:${s.source.startLine}-${s.source.endLine}`,
        ),
      ].join("\n");
      return ok(
        {
          entry: rel(p, o.entry),
          title: o.title,
          headmatter: o.headmatter,
          slides,
          columns: o.columns,
          problems: o.problems,
        },
        text,
      );
    }),
  );

  server.registerTool(
    "deck_read_slide",
    {
      title: "Read a slide",
      description:
        "One slide's MDX body, frontmatter, speaker notes, and its exact source text with line numbers.",
      inputSchema: { dir: DIR, slide: SLIDE },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ dir, slide }: { dir?: string; slide: number | string }) => {
      const p = project(dir);
      const deck = readDeck(p.files);
      const s = findSlide(deck.slides, slide);
      if (!s)
        return failure(
          `No slide ${JSON.stringify(slide)}; the deck has ${deck.slides.length} (0–${deck.slides.length - 1}).`,
        );
      const lines = (p.files.read(s.range.file) ?? "")
        .split(/\r?\n/)
        .slice(s.range.start, s.range.end);
      const raw = lines
        .map((l, i) => `${String(s.range.start + i + 1).padStart(4)}| ${l}`)
        .join("\n");
      const o = outlineSlide(s);
      const data = {
        ...o,
        source: { ...o.source, file: rel(p, o.source.file) },
        content: s.content,
        notes: s.notes,
        raw: lines.join("\n"),
      };
      return ok(data, `Slide ${s.index} (${o.title ?? o.id}), ${rel(p, s.range.file)}:\n${raw}`);
    }),
  );

  server.registerTool(
    "deck_check",
    {
      title: "Check the deck",
      description:
        "Lint the deck: invalid YAML, unknown or mistyped frontmatter keys, unknown layouts/backgrounds/themes/transitions, MDX that does not compile (with file:line), JSX components that are not built in / in src/components.tsx / imported, broken `src:` includes, missing images and videos, glossary problems, code-fence options. Errors break the deck; fix them before rendering.",
      inputSchema: {
        dir: DIR,
        compile: z.boolean().optional().describe("Compile every slide's MDX (default true)."),
      },
      outputSchema: out({
        ok: z.boolean(),
        errors: z.number(),
        warnings: z.number(),
        slides: z.number(),
        diagnostics: z.array(LOOSE),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ dir, compile }: { dir?: string; compile?: boolean }) => {
      const p = project(dir);
      const r = await checkProject(p, { compile: compile !== false });
      const diagnostics = r.diagnostics.map((d) => ({ ...d, file: rel(p, d.file) }));
      return ok(
        { ...r, diagnostics },
        formatDiagnostics(r, (f) => rel(p, f)),
      );
    }),
  );

  // ── editing ──────────────────────────────────────────────────────────────────────────────
  const EDIT_OUT = out({
    ok: z.boolean(),
    action: z.string(),
    slide: LOOSE.nullable(),
    slides: z.number(),
    files: z.array(z.string()),
    notes: z.array(z.string()),
    diagnostics: z.array(LOOSE),
    deck: LOOSE,
  });

  server.registerTool(
    "slide_add",
    {
      title: "Add a slide",
      description:
        "Insert a new slide. `at` is the index it will have (default: the end); `vertical` puts it beneath the previous slide in the same column. `content` is the MDX body without separators or frontmatter; put options in `frontmatter` (e.g. { layout: 'two-cols' }) and speaker notes in `notes` (use [click] markers to pace them). The deck is linted afterwards.",
      inputSchema: {
        dir: DIR,
        content: z.string().describe("MDX body, e.g. '## Title\\n\\n- point'"),
        frontmatter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Slide frontmatter keys (see deck_reference slideFrontmatter)."),
        notes: z.string().optional().describe("Speaker notes (Markdown)."),
        at: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Index the new slide gets (default: append)."),
        vertical: z
          .boolean()
          .optional()
          .describe("Stack beneath the slide before it (reveal.js vertical slide)."),
      },
      outputSchema: EDIT_OUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    guard(
      async (a: {
        dir?: string;
        content: string;
        frontmatter?: Record<string, unknown>;
        notes?: string;
        at?: number;
        vertical?: boolean;
      }) => {
        const p = project(a.dir);
        return afterEdit(
          p,
          addSlide(
            p.files,
            { content: a.content, frontmatter: a.frontmatter, notes: a.notes },
            a.at,
            a.vertical,
          ),
          "Added",
        );
      },
    ),
  );

  server.registerTool(
    "slide_update",
    {
      title: "Update a slide",
      description:
        "Change one slide: `content` replaces its MDX body (existing speaker notes are kept unless the new content has its own <Notes> or keepNotes is false); `frontmatter` replaces its frontmatter; `patch` merges keys into it (null deletes a key). Only that slide's lines change. On the first slide, the frontmatter is the headmatter: a replace keeps the deck settings.",
      inputSchema: {
        dir: DIR,
        slide: SLIDE,
        content: z.string().optional(),
        frontmatter: z.record(z.string(), z.unknown()).optional(),
        patch: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Keys to set; null removes one."),
        keepNotes: z.boolean().optional(),
      },
      outputSchema: EDIT_OUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(
      async (a: {
        dir?: string;
        slide: number | string;
        content?: string;
        frontmatter?: Record<string, unknown>;
        patch?: Record<string, unknown>;
        keepNotes?: boolean;
      }) => {
        if (a.content === undefined && !a.frontmatter && !a.patch)
          return failure("Nothing to change: give content, frontmatter or patch.");
        const p = project(a.dir);
        return afterEdit(
          p,
          updateSlide(
            p.files,
            a.slide,
            {
              content: a.content,
              frontmatter: a.frontmatter,
              patch: a.patch,
              keepNotes: a.keepNotes,
            },
            deckKeys,
          ),
          "Updated",
        );
      },
    ),
  );

  server.registerTool(
    "slide_remove",
    {
      title: "Remove a slide",
      description:
        "Delete one slide (its separator, frontmatter, body and notes). A stack's top slide hands its column to the slide beneath it.",
      inputSchema: { dir: DIR, slide: SLIDE },
      outputSchema: EDIT_OUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    guard(async ({ dir, slide }: { dir?: string; slide: number | string }) => {
      const p = project(dir);
      return afterEdit(p, removeSlide(p.files, slide), "Removed");
    }),
  );

  server.registerTool(
    "slide_move",
    {
      title: "Move a slide",
      description:
        "Move a slide so it ends up at index `to`; `vertical` stacks it beneath the slide before its new place.",
      inputSchema: {
        dir: DIR,
        slide: SLIDE,
        to: z.number().int().min(0).describe("The index the slide will have after the move."),
        vertical: z.boolean().optional(),
      },
      outputSchema: EDIT_OUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(
      async ({
        dir,
        slide,
        to,
        vertical,
      }: {
        dir?: string;
        slide: number | string;
        to: number;
        vertical?: boolean;
      }) => {
        const p = project(dir);
        return afterEdit(p, moveSlide(p.files, slide, to, vertical), "Moved");
      },
    ),
  );

  server.registerTool(
    "deck_update_frontmatter",
    {
      title: "Update the deck settings",
      description:
        "Merge keys into the headmatter — the YAML at the top of deck.mdx that configures the deck (title, author, theme, transition, colorScheme, slideNumber, glossary, fonts… see deck_reference deck). null deletes a key. Comments and order are kept.",
      inputSchema: { dir: DIR, patch: z.record(z.string(), z.unknown()) },
      outputSchema: EDIT_OUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(async ({ dir, patch }: { dir?: string; patch: Record<string, unknown> }) => {
      const p = project(dir);
      return afterEdit(p, updateHeadmatter(p.files, patch), "Updated the headmatter of");
    }),
  );

  server.registerTool(
    "notes_set",
    {
      title: "Set speaker notes",
      description:
        "Replace a slide's speaker notes (shown in the presenter view). Put [click] where each click's part begins so the notes follow the reveals. An empty string removes them.",
      inputSchema: { dir: DIR, slide: SLIDE, notes: z.string() },
      outputSchema: EDIT_OUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(
      async ({ dir, slide, notes }: { dir?: string; slide: number | string; notes: string }) => {
        const p = project(dir);
        return afterEdit(p, setNotes(p.files, slide, notes), "Set the notes of");
      },
    ),
  );

  // ── seeing it ────────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "slide_render",
    {
      title: "Render slides",
      description:
        "Pictures of slides as PNG images, exactly as the deck draws them (headless Chromium on the deck's own dev server, kept running between calls). Use it after every round of edits and LOOK: overflow, contrast, crowding, alignment, empty space. Each slide is drawn as a still with every click revealed. Needs the deck's dependencies installed and Playwright + Chromium (the error says how).",
      inputSchema: {
        dir: DIR,
        slides: z
          .array(SLIDE)
          .optional()
          .describe("Which slides (default: all, up to 12). Hidden slides are not drawn."),
        scheme: z.enum(["light", "dark"]).optional().describe("Colour scheme (default light)."),
        theme: z.string().optional().describe("A theme the deck ships (minimal, rla, stack…)."),
        width: z
          .number()
          .int()
          .min(320)
          .max(1920)
          .optional()
          .describe("Picture width in px (default 1280)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(
      async (a: {
        dir?: string;
        slides?: Array<number | string>;
        scheme?: "light" | "dark";
        theme?: string;
        width?: number;
      }) => {
        const p = project(a.dir);
        const deck = readDeck(p.files);
        const MAX = 12;
        let indexes: number[];
        if (a.slides?.length) {
          indexes = [];
          for (const ref of a.slides) {
            const s = findSlide(deck.slides, ref);
            if (!s)
              return failure(
                `No slide ${JSON.stringify(ref)}; the deck has ${deck.slides.length}.`,
              );
            indexes.push(s.index);
          }
        } else indexes = deck.slides.map((s) => s.index);
        const capped = indexes.length > MAX;
        indexes = indexes.slice(0, MAX);
        const r = await (
          await renderer(p)
        ).render({ slides: indexes, scheme: a.scheme, theme: a.theme, width: a.width ?? 1280 });
        const content: Content[] = [];
        for (const shot of r.shots) {
          const meta = deck.slides[shot.index];
          content.push({
            type: "text",
            text: `Slide ${shot.index}${meta ? ` — ${outlineSlide(meta).title ?? outlineSlide(meta).id}` : ""} (${shot.width}×${shot.height})`,
          });
          content.push({ type: "image", data: shot.png.toString("base64"), mimeType: "image/png" });
        }
        const summary = [
          `${r.shots.length} slide(s) rendered${capped ? ` (first ${MAX}; ask for more by index)` : ""}.`,
          r.missing.length ? `Not drawn (hidden?): ${r.missing.join(", ")}.` : "",
          r.errors.length ? `Errors in the page:\n${r.errors.join("\n")}` : "",
        ].filter(Boolean);
        content.unshift({ type: "text", text: summary.join("\n") });
        return {
          content,
          structuredContent: {
            rendered: r.shots.map((s) => ({ slide: s.index, width: s.width, height: s.height })),
            missing: r.missing,
            errors: r.errors,
          },
        };
      },
    ),
  );

  server.registerTool(
    "deck_preview",
    {
      title: "Preview the deck",
      description:
        "Start (or reuse) the deck's dev server with live reload and return its URLs — the deck, the presenter view, the audience page — for a person to open. Edits made with the slide tools appear live. `stop: true` shuts it down.",
      inputSchema: { dir: DIR, stop: z.boolean().optional() },
      outputSchema: out({
        running: z.boolean(),
        url: z.string().nullable(),
        presenter: z.string().nullable(),
        audience: z.string().nullable(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ dir, stop }: { dir?: string; stop?: boolean }) => {
      const p = project(dir);
      if (stop) {
        const entry = live.get(p.dir);
        await entry?.renderer?.close();
        entry?.server?.stop();
        live.delete(p.dir);
        return ok(
          { running: false, url: null, presenter: null, audience: null },
          "Stopped the dev server.",
        );
      }
      const s = await devServer(p);
      const data = {
        running: true,
        url: s.url,
        presenter: `${s.url}presenter`,
        audience: `${s.url}join`,
      };
      return ok(
        data,
        `The deck: ${data.url}\nPresenter view: ${data.presenter}\nAudience page: ${data.audience}\n(It stops when this MCP server stops.)`,
      );
    }),
  );

  // ── output ───────────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "deck_build",
    {
      title: "Build the deck",
      description:
        "Build the deck into dist/ (a static site any host can serve). Run deck_check first.",
      inputSchema: { dir: DIR },
      outputSchema: out({ ok: z.boolean(), outDir: z.string(), files: z.number() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(async ({ dir }: { dir?: string }) => {
      const p = project(dir);
      await runVite(p.dir, ["build"]);
      const outDir = join(p.dir, "dist");
      const count = (d: string): number =>
        existsSync(d)
          ? readdirSync(d, { withFileTypes: true }).reduce(
              (n, e) => n + (e.isDirectory() ? count(join(d, e.name)) : 1),
              0,
            )
          : 0;
      const files = count(outDir);
      return ok({ ok: true, outDir, files }, `Built ${files} files into ${outDir}.`);
    }),
  );

  server.registerTool(
    "deck_export",
    {
      title: "Export the deck",
      description:
        "Export to PDF (default), PNG (one per printed page) and/or PPTX (images + notes) into export/. Needs Playwright + Chromium, and pptxgenjs for PPTX.",
      inputSchema: {
        dir: DIR,
        formats: z
          .array(z.enum(["pdf", "png", "pptx"]))
          .optional()
          .describe('Default ["pdf"].'),
        out: z
          .string()
          .optional()
          .describe("Output folder, relative to the deck (default export)."),
      },
      outputSchema: out({
        ok: z.boolean(),
        pages: z.number(),
        outDir: z.string(),
        files: z.array(LOOSE),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(
      async ({
        dir,
        formats,
        out,
      }: {
        dir?: string;
        formats?: Array<"pdf" | "png" | "pptx">;
        out?: string;
      }) => {
        const p = project(dir);
        const f = new Set(formats?.length ? formats : ["pdf"]);
        const { runExport } = await import("../export/run.ts");
        const args = [
          ...(f.has("pdf") ? [] : ["--no-pdf"]),
          ...(f.has("png") ? ["--png"] : []),
          ...(f.has("pptx") ? ["--pptx"] : []),
          ...(out ? ["--out", out] : []),
        ];
        const r = await runExport(args, p.dir, (l) => console.error(l));
        const files = r.files.map((x) => ({ kind: x.kind, path: x.path, size: x.size }));
        return ok(
          { ok: true, pages: r.pages, outDir: r.outDir, files },
          `Exported ${r.pages} pages:\n${files.map((x) => `${x.kind}  ${x.path}`).join("\n")}`,
        );
      },
    ),
  );

  server.registerTool(
    "deck_publish",
    {
      title: "Publish the deck",
      description:
        "Build the deck and publish it to its Kadal Deck host (deck.kadal.cc by default) with a live room; returns the URL. Uses the login saved by `kadal-deck login` (or KADAL_DECK_TOKEN). If nobody is signed in it returns what the person must run — it never signs in by itself.",
      inputSchema: {
        dir: DIR,
        slug: z.string().optional().describe("URL slug (default: the folder name)."),
        workspace: z.string().optional().describe("Workspace handle (default: the token's)."),
        title: z.string().optional(),
      },
      outputSchema: out({ ok: z.boolean(), url: z.string(), version: z.number() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(
      async ({
        dir,
        slug,
        workspace,
        title,
      }: {
        dir?: string;
        slug?: string;
        workspace?: string;
        title?: string;
      }) => {
        const p = project(dir);
        const creds = await loadCredentials();
        if (!creds)
          return failure(
            "Not signed in to a Kadal Deck host. Ask the person to run `npx kadal-deck login` in a terminal (it opens a browser to approve this machine), or to set KADAL_DECK_TOKEN; then call deck_publish again.",
            { signedIn: false, command: "npx kadal-deck login" },
          );
        const { publishCommand } = await import("../cli/index.ts");
        // The CLI's publish, with its one JSON answer captured instead of printed.
        let data: Record<string, unknown> = {};
        const code = await publishCommand(
          p.dir,
          { slug, workspace, title },
          {
            json: true,
            say: (line) => console.error(line),
            emit: (d) => {
              data = d as Record<string, unknown>;
            },
          },
        );
        if (code !== 0)
          return failure(
            String((data.error as { message?: string })?.message ?? "Publishing failed."),
            data,
          );
        return ok(data, `Published version ${data.version}: ${data.url}`);
      },
    ),
  );

  // ── resources ────────────────────────────────────────────────────────────────────────────
  server.registerResource(
    "catalog",
    "kadal-deck://catalog",
    {
      title: "Kadal Deck catalog (JSON)",
      description: "Every component, layout, background, option and key, as data.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(catalog, null, 2) },
      ],
    }),
  );
  server.registerResource(
    "reference",
    "kadal-deck://reference",
    {
      title: "Kadal Deck reference (Markdown)",
      description: "The catalog as one Markdown reference.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: catalogMarkdown(catalog) }],
    }),
  );
  server.registerResource(
    "frontmatter-schema",
    "kadal-deck://schema/frontmatter",
    { title: "Frontmatter JSON Schema", mimeType: "application/schema+json" },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/schema+json",
          text: JSON.stringify(frontmatterSchema(catalog), null, 2),
        },
      ],
    }),
  );
  for (const g of guides()) {
    const name = g.name === "skill" ? "workflow" : g.name;
    server.registerResource(
      `guide-${name}`,
      `kadal-deck://guide/${name}`,
      {
        title: `Guide: ${name.replace(/-/g, " ")}`,
        description:
          name === "workflow"
            ? "The agent workflow (the Kadal Deck skill)."
            : `The Kadal Deck skill's ${name} reference.`,
        mimeType: "text/markdown",
      },
      (uri) => ({
        contents: [
          { uri: uri.href, mimeType: "text/markdown", text: readFileSync(g.file, "utf8") },
        ],
      }),
    );
  }

  // ── prompts ──────────────────────────────────────────────────────────────────────────────
  server.registerPrompt(
    "draft_deck",
    {
      title: "Draft a deck from an outline",
      description:
        "Turn a topic or an outline into a finished Kadal Deck: scaffold, write, check, look, fix.",
      argsSchema: {
        topic: z.string().describe("What the talk is about."),
        outline: z.string().optional().describe("Your outline or notes, if you have them."),
        audience: z.string().optional().describe("Who will be in the room."),
        minutes: z.string().optional().describe("How long the talk is."),
        dir: z
          .string()
          .optional()
          .describe("Folder for the deck (default: a new folder named after the topic)."),
      },
    },
    ({ topic, outline, audience, minutes, dir }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Make a Kadal Deck talk about: ${topic}.`,
              audience ? `Audience: ${audience}.` : "",
              minutes
                ? `Length: ${minutes} minutes (plan roughly one slide per minute, fewer for dense ones).`
                : "",
              outline ? `Outline / notes:\n${outline}` : "",
              "",
              "Work like this:",
              `1. Read kadal-deck://guide/design-guide. If ${dir ?? "the deck folder"} has no deck.mdx yet, call deck_create${dir ? ` with dir "${dir}"` : ""}; otherwise deck_outline.`,
              "2. Plan the arc first: a title, a hook, 3–5 sections with one idea per slide, a close with the one thing to remember. Use section/fact/quote/statement layouts for rhythm.",
              "3. Write slides with slide_update (replace the starter's) and slide_add. Check unfamiliar components with deck_reference first. Reveal lists and steps with <Clicks>/<Click>; give every slide speaker notes with [click] markers.",
              "4. deck_check and fix every error.",
              "5. slide_render all slides, look at each picture critically (overflow, crowding, contrast, too much text), fix, and render again until they are clean. Try scheme dark too if the theme supports it.",
              "6. Summarise the deck (titles in order) and offer deck_preview, deck_export or deck_publish.",
            ]
              .filter((l) => l !== "")
              .join("\n"),
          },
        },
      ],
    }),
  );
  server.registerPrompt(
    "review_deck",
    {
      title: "Review this deck",
      description: "Check, render and critique an existing deck, then propose (or make) fixes.",
      argsSchema: {
        dir: z.string().optional().describe("The deck folder (default: the server's folder)."),
        fix: z.string().optional().describe('"yes" to apply the fixes, otherwise only report.'),
      },
    },
    ({ dir, fix }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Review the Kadal Deck${dir ? ` in ${dir}` : ""}.`,
              "1. deck_outline to see its shape; deck_check for errors and warnings.",
              "2. slide_render every slide (in batches of up to 12) and look closely at each.",
              "3. Judge it against kadal-deck://guide/design-guide: one idea per slide, a clear arc, readable type (nothing under ~24px on the 1920×1080 stage), contrast, no overflow, clicks that pace the story, notes on every slide, consistent layouts.",
              "4. Report: the problems by slide (with what you saw), then the three changes that would improve the talk most.",
              fix === "yes"
                ? "5. Make the fixes with the slide tools, then deck_check and slide_render again to confirm."
                : "5. Do not edit anything; ask before making changes.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  async function close() {
    for (const entry of live.values()) {
      await entry.renderer?.close().catch(() => {});
      entry.server?.stop();
    }
    live.clear();
  }

  return { server, close };
}

/** `kadal-deck mcp`: serve on stdin/stdout until the client goes away. */
export async function serveStdio(options: McpOptions): Promise<void> {
  // stdout is the protocol from here on.
  keepStdoutClean();
  console.log = console.error;
  console.info = console.error;
  console.warn = console.error;
  const { server, close } = createServer(options);
  const transport = new StdioServerTransport();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await close();
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  transport.onclose = () => void shutdown();
  await server.connect(transport);
  console.error(`kadal-deck mcp ${catalog.version}: serving ${resolve(options.dir)}`);
  // Stay up until the client disconnects.
  await new Promise<void>(() => {});
}
