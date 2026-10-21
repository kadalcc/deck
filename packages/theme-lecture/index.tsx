import type { ReactNode } from "react";

import { type LayerProps, type LayoutProps, useDeck, useSlideOptional } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Lecture's module: the footer, numbered sections, the blocks a textbook sets, citations.
 *
 *   the footer          a slide-bottom layer on every slide but the cover: the course (bold),
 *                       the author and the institution; the current section; "page / total".
 *                       `themeConfig.footer: false` turns it off, `footer: false` on a slide
 *                       hides it there. It is drawn on printed pages too.
 *   layout: section     the built-in section, numbered: "Section 2" over the title (counted
 *                       from the deck's section slides; `n:` overrides, and
 *                       `themeConfig.sectionNumbers: false` leaves them off)
 *   layout: definition  a slide that is one definition, large: `name:` and `n:` label it
 *   layout: theorem     the same for a theorem (`kind: lemma | corollary | proposition`)
 *   layout: references  the slide's list as a numbered bibliography, [1] [2] …, two columns
 *                       past six entries
 *   <Definition> <Theorem> <Lemma> <Corollary> <Proposition> <Example> <Remark>
 *                       a run-in label ("Theorem 2.1 (Pythagoras).") then the body; `n` numbers
 *                       it, `title` names it
 *   <Proof>             "Proof." … ∎   (`of="Theorem 2.1"` → "Proof of Theorem 2.1.")
 *   <Cite n={3} />      [3]   (`n="3, 7"`, `page="12"` → [3, 7, p. 12]); with children, the
 *                       author-year form: <Cite>Knuth 1984</Cite> → (Knuth 1984)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEFAULTS = {
  course: "",
  author: "",
  institution: "",
  footer: true,
  sectionNumbers: true,
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const label = (v: unknown) => (v == null || v === "" ? null : String(v).trim());

/** The theme's settings: its defaults under the deck's `themeConfig`. */
function useLectureConfig() {
  const deck = useDeck();
  return { ...DEFAULTS, ...deck.config.themeConfig } as typeof DEFAULTS & Record<string, unknown>;
}

/** The section a slide is in: its number and title, from the deck's `layout: section` slides. */
function useSectionOf(index: number): { n: number; title: string | null } | null {
  const deck = useDeck();
  const sections = deck.manifest.slides.filter(
    (s) => s.index <= index && s.frontmatter.layout === "section",
  );
  const last = sections.at(-1);
  if (!last) return null;
  const given = label(last.frontmatter.n);
  return { n: given && /^\d+$/.test(given) ? Number(given) : sections.length, title: last.title };
}

function Footer({ slide, page, total, layout, frontmatter }: LayerProps) {
  const deck = useDeck();
  const cfg = useLectureConfig();
  const section = useSectionOf(slide?.index ?? 0);
  if (cfg.footer === false || frontmatter.footer === false || layout === "cover") return null;
  const course = str(cfg.course);
  const rest = [str(cfg.author) ?? str(deck.config.author), str(cfg.institution)].filter(Boolean);
  return (
    <footer className="lecture-footer" aria-hidden="true">
      <span>
        {course ? <b>{course}</b> : null}
        {course && rest.length ? " · " : null}
        {rest.join(" · ")}
      </span>
      <span className="lecture-footer-section">
        {section?.title
          ? `${cfg.sectionNumbers === false ? "" : `${section.n}  `}${section.title}`
          : ""}
      </span>
      <span className="lecture-footer-page">
        {page} / {total}
      </span>
    </footer>
  );
}

function Section({ children, frontmatter }: LayoutProps) {
  const cfg = useLectureConfig();
  const index = useSlideOptional()?.meta.index ?? 0;
  const section = useSectionOf(index);
  const n = label(frontmatter.n) ?? (section ? String(section.n) : null);
  return (
    <div className="deck-layout deck-layout-section">
      {cfg.sectionNumbers !== false && n ? (
        <div className="lecture-section-number">
          Section <b>{n}</b>
        </div>
      ) : null}
      {children}
    </div>
  );
}

type Kind =
  | "definition"
  | "theorem"
  | "lemma"
  | "corollary"
  | "proposition"
  | "proof"
  | "example"
  | "remark";

const NAMES: Record<Kind, string> = {
  definition: "Definition",
  theorem: "Theorem",
  lemma: "Lemma",
  corollary: "Corollary",
  proposition: "Proposition",
  proof: "Proof",
  example: "Example",
  remark: "Remark",
};

interface BlockProps {
  n?: string | number;
  title?: string;
  /** Proof only: what it proves ("Theorem 2.1"). */
  of?: string;
  children?: ReactNode;
}

function Block({ kind, n, title, of, children }: BlockProps & { kind: Kind }) {
  const name = kind === "proof" && of ? `Proof of ${of}` : NAMES[kind];
  const num = label(n);
  return (
    <div className={`lecture-block is-${kind}`} role="note" aria-label={name}>
      <div className="lecture-block-body">
        <span className="lecture-label">
          {name}
          {num ? ` ${num}` : ""}
          {title ? (
            <>
              {" "}
              <i>({title})</i>
            </>
          ) : null}
          .{" "}
        </span>
        {children}
      </div>
    </div>
  );
}

const block = (kind: Kind) =>
  function LectureBlock(props: BlockProps) {
    return <Block kind={kind} {...props} />;
  };

const Definition = block("definition");
const Theorem = block("theorem");
const Lemma = block("lemma");
const Corollary = block("corollary");
const Proposition = block("proposition");
const Proof = block("proof");
const Example = block("example");
const Remark = block("remark");

function DefinitionLayout({ children, frontmatter }: LayoutProps) {
  return (
    <div className="deck-layout deck-layout-definition">
      <Block
        kind="definition"
        n={label(frontmatter.n) ?? undefined}
        title={str(frontmatter.name) ?? undefined}
      >
        {children}
      </Block>
    </div>
  );
}

function TheoremLayout({ children, frontmatter }: LayoutProps) {
  const k = str(frontmatter.kind);
  const kind: Kind = k === "lemma" || k === "corollary" || k === "proposition" ? k : "theorem";
  return (
    <div className="deck-layout deck-layout-theorem">
      <Block
        kind={kind}
        n={label(frontmatter.n) ?? undefined}
        title={str(frontmatter.name) ?? undefined}
      >
        {children}
      </Block>
    </div>
  );
}

function References({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-references">{children}</div>;
}

function Cite({
  n,
  page,
  children,
}: {
  n?: string | number;
  page?: string | number;
  children?: ReactNode;
}) {
  const p = label(page);
  if (children != null && n == null)
    return (
      <span className="lecture-cite">
        ({children}
        {p ? `, p. ${p}` : ""})
      </span>
    );
  return (
    <span className="lecture-cite">
      [{label(n) ?? "?"}
      {p ? `, p. ${p}` : ""}]
    </span>
  );
}

export default {
  layouts: {
    section: Section,
    definition: DefinitionLayout,
    theorem: TheoremLayout,
    references: References,
  },
  components: {
    Definition,
    Theorem,
    Lemma,
    Corollary,
    Proposition,
    Proof,
    Example,
    Remark,
    Cite,
  },
  layers: { "slide-bottom": Footer },
};
