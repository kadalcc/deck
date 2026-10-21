/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF OUTLINE  —  bookmarks, metadata and merging, after Chromium has printed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Chromium prints pages; it knows nothing of slides. Once it has, pdf-lib (MIT, Node-only here,
 * imported only when a PDF is finished) opens the file and adds what a reader expects of a deck:
 *
 *   - an OUTLINE (the sidebar of bookmarks every PDF viewer shows): one entry per slide that has
 *     a title, at that slide's first page, `hideInToc` slides left out as the deck's `<Toc>` leaves
 *     them. A slide below another (a vertical stack) sits under its column's entry; a slide's
 *     `level` (its heading's, or the frontmatter's) nests it under the nearest slide before it
 *     with a lower one, so `##` slides read as chapters of the `#` slide that opened them. The
 *     first slide is the deck's cover, never a chapter: a `#` title there does not swallow the
 *     `##` slides after it.
 *   - METADATA: the title, author, subject (`info`) and keywords, so the file is named in a
 *     reader's library and found by a search.
 *
 * `--per-slide` prints each slide in a page load of its own; `mergePdfs` joins those files into one.
 * `readOutline` parses an outline back, for the tests and for `export --json` to report.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** One printed page, as the print view labels it. */
export interface PrintedPage {
  /** 0-based flat slide index (`data-slide`), or null for a page that is not a slide's. */
  slide: number | null;
  /** A notes page (`showNotes: "separate-page"`) — never a bookmark's target. */
  notes?: boolean;
}

/** A slide, as much of it as the outline needs. */
export interface OutlineSlide {
  /** 0-based flat index. */
  index: number;
  h: number;
  v: number;
  title: string | null;
  /** The slide's heading level (1 for `#`) or its `level` frontmatter. */
  level: number;
  /** `hideInToc`: left out, as the deck's own `<Toc>` leaves it out. */
  hideInToc?: boolean;
}

export interface OutlineNode {
  title: string;
  /** 0-based page index in the PDF. */
  page: number;
  children: OutlineNode[];
}

/**
 * The outline for a printed deck: the bookmark tree, each entry pointing at its slide's first page.
 * Slides with no title, or not printed (outside `--range`), have no entry; their children attach
 * to the nearest ancestor that does.
 */
export function outlineTree(pages: PrintedPage[], slides: OutlineSlide[]): OutlineNode[] {
  const firstPage = new Map<number, number>();
  pages.forEach((p, i) => {
    if (p.slide !== null && !p.notes && !firstPage.has(p.slide)) firstPage.set(p.slide, i);
  });
  const roots: OutlineNode[] = [];
  // The open chain of entries, deepest last, each with the level that opened it.
  let stack: { node: OutlineNode; level: number }[] = [];
  const columnHead = new Map<number, { node: OutlineNode; level: number }>();
  for (const s of slides) {
    const page = firstPage.get(s.index);
    const title = s.title?.replace(/\s+/g, " ").trim();
    if (page === undefined || !title || s.hideInToc) continue;
    const node: OutlineNode = { title, page, children: [] };
    const level = Math.max(1, Math.round(s.level || 1));
    const head = s.v > 0 ? columnHead.get(s.h) : undefined;
    if (head) {
      // Under its column's slide: the levels count from there.
      head.node.children.push(node);
      stack = [...stack.slice(0, stack.indexOf(head) + 1), { node, level: head.level + 1 }];
      continue;
    }
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    (stack.length ? stack[stack.length - 1]!.node.children : roots).push(node);
    const entry = { node, level };
    if (s.index > 0) stack.push(entry);
    if (s.v === 0) columnHead.set(s.h, entry);
  }
  return roots;
}

export interface PdfMeta {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
}

type PdfLib = typeof import("pdf-lib");
type PdfDoc = import("pdf-lib").PDFDocument;

async function pdfLib(): Promise<PdfLib> {
  const mod = (await import("pdf-lib")) as PdfLib & { default?: PdfLib };
  return mod.PDFDocument ? mod : mod.default!;
}

/**
 * The PDF with its outline and metadata. `outline: []` (or a deck with no titles) adds none and
 * leaves the reader's sidebar as it was; the metadata is always written.
 */
export async function finishPdf(
  bytes: Uint8Array,
  { outline = [], meta = {} }: { outline?: OutlineNode[]; meta?: PdfMeta },
): Promise<Uint8Array> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false });
  if (meta.title) doc.setTitle(meta.title, { showInWindowTitleBar: true });
  if (meta.author) doc.setAuthor(meta.author);
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords?.length) doc.setKeywords(meta.keywords);
  doc.setCreator("Kadal Deck");
  doc.setProducer("Kadal Deck (Chromium, pdf-lib)");
  if (outline.length) addOutline(lib, doc, outline);
  return doc.save({ useObjectStreams: false });
}

/**
 * Write `/Outlines` into the catalog. pdf-lib has no outline API, so the dictionaries are made
 * by hand, as the PDF spec (§12.3.3) lays them out: a root with `/First`, `/Last` and `/Count`,
 * and per entry `/Title`, `/Parent`, `/Prev`, `/Next`, its own `/First`/`/Last`/`/Count` when it
 * has children, and `/Dest [page /Fit]`. Every level is open (a positive count) so the reader
 * shows the whole tree, as a deck's outline is short.
 */
function addOutline(lib: PdfLib, doc: PdfDoc, tree: OutlineNode[]): void {
  const { PDFName, PDFHexString, PDFNumber, PDFArray } = lib;
  const ctx = doc.context;
  const pages = doc.getPages();
  const rootRef = ctx.nextRef();

  /** Write one level of siblings under `parentRef`; returns their refs and the visible count. */
  const level = (
    nodes: OutlineNode[],
    parentRef: ReturnType<typeof ctx.nextRef>,
  ): { refs: ReturnType<typeof ctx.nextRef>[]; count: number } => {
    const refs = nodes.map(() => ctx.nextRef());
    let count = 0;
    nodes.forEach((node, i) => {
      const page = pages[Math.min(node.page, pages.length - 1)];
      const dict = ctx.obj({});
      dict.set(PDFName.of("Title"), PDFHexString.fromText(node.title));
      dict.set(PDFName.of("Parent"), parentRef);
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]!);
      if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]!);
      if (page) {
        const dest = PDFArray.withContext(ctx);
        dest.push(page.ref);
        dest.push(PDFName.of("Fit"));
        dict.set(PDFName.of("Dest"), dest);
      }
      count++;
      if (node.children.length) {
        const kids = level(node.children, refs[i]!);
        dict.set(PDFName.of("First"), kids.refs[0]!);
        dict.set(PDFName.of("Last"), kids.refs[kids.refs.length - 1]!);
        dict.set(PDFName.of("Count"), PDFNumber.of(kids.count));
        count += kids.count;
      }
      ctx.assign(refs[i]!, dict);
    });
    return { refs, count };
  };

  const top = level(tree, rootRef);
  const root = ctx.obj({});
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), top.refs[0]!);
  root.set(PDFName.of("Last"), top.refs[top.refs.length - 1]!);
  root.set(PDFName.of("Count"), PDFNumber.of(top.count));
  ctx.assign(rootRef, root);
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

/** Several PDFs as one, in order: what `--per-slide` prints. */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const lib = await pdfLib();
  const out = await lib.PDFDocument.create();
  for (const bytes of parts) {
    const src = await lib.PDFDocument.load(bytes);
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
  }
  return out.save({ useObjectStreams: false });
}

/** The outline of a PDF as a flat list (depth-first): title, 0-based page and depth. */
export async function readOutline(
  bytes: Uint8Array,
): Promise<{ title: string; page: number; depth: number }[]> {
  const lib = await pdfLib();
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFHexString, PDFString } = lib;
  const doc = await lib.PDFDocument.load(bytes);
  const pageIndex = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i]));
  const deref = (v: unknown) => (v instanceof PDFRef ? doc.context.lookup(v) : v);
  const out: { title: string; page: number; depth: number }[] = [];
  const walk = (first: unknown, depth: number) => {
    for (
      let item = deref(first);
      item instanceof PDFDict;
      item = deref(item.get(PDFName.of("Next")))
    ) {
      const t = item.get(PDFName.of("Title"));
      const title =
        t instanceof PDFHexString || t instanceof PDFString ? t.decodeText() : String(t ?? "");
      const dest = deref(item.get(PDFName.of("Dest")));
      const target = dest instanceof PDFArray ? dest.get(0) : null;
      out.push({ title, page: target ? (pageIndex.get(target.toString()) ?? -1) : -1, depth });
      walk(item.get(PDFName.of("First")), depth + 1);
    }
  };
  const root = deref(doc.catalog.get(PDFName.of("Outlines")));
  if (root instanceof PDFDict) walk(root.get(PDFName.of("First")), 0);
  return out;
}
