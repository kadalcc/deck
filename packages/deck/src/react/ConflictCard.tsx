import { createElement as h, useState } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SLIDE WITH A MERGE CONFLICT ON IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A slide whose source still holds conflict markers (sync/markers.ts) is two slides in one: MDX
 * cannot compile it, and guessing which half to show would hide the other. The compilers (the
 * runtime one for the builder's preview and the kit, the Vite plugin under `kadal-deck dev`)
 * render this card in its place instead: both versions side by side — "Yours" and "Web", each
 * with its marker label — and a choice for each block.
 *
 * The choice goes to whoever can change the file: `setConflictResolver` is set by the shell's
 * preview (a `conflict:resolve` message to the editor, runtime/protocol.ts) and by the dev
 * server's page (a POST to `__kadal/resolve`). Without one the buttons are not shown, and the
 * card says how to resolve from the command line.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ConflictBlockView {
  /** The block's 0-based position among the conflict blocks of its file (`resolveConflict`'s `which`). */
  block: number;
  /** 1-based line of its `<<<<<<<` marker. */
  line: number;
  oursLabel: string;
  theirsLabel: string;
  ours: string;
  theirs: string;
}

export interface ConflictSlideProps {
  file: string;
  /** The slide's flat index in the deck. */
  slide: number;
  blocks: ConflictBlockView[];
}

export type ConflictChoice = "ours" | "theirs" | "both";
export type ConflictResolver = (r: {
  file: string;
  slide: number;
  block: number;
  choice: ConflictChoice;
}) => void | Promise<void>;

let resolver: ConflictResolver | null = null;

/** Who settles a conflict when a button on the card is pressed (null: no buttons). */
export function setConflictResolver(fn: ConflictResolver | null): void {
  resolver = fn;
}

/**
 * The other side's name, from its label's first word: "web v14 (…)" → "Web", "CLI v15" → "CLI".
 * Ours is always "Yours" — whoever is looking at the card made it.
 */
export function theirsName(label: string): string {
  const w = /^[A-Za-z][\w-]*/.exec(label.trim())?.[0];
  if (!w || w === "theirs") return "Theirs";
  return w === w.toUpperCase() ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase();
}

/** A side that deleted the slide (or the file) says so. */
const sideTitle = (label: string, name: string) =>
  /deleted this (slide|file)/.test(label) ? `${name} — deleted it` : name;

export function ConflictSlide({ file, slide, blocks }: ConflictSlideProps) {
  const [busy, setBusy] = useState<number | null>(null);
  const choose = (block: number, choice: ConflictChoice) => {
    if (!resolver) return;
    setBusy(block);
    void Promise.resolve(resolver({ file, slide, block, choice })).finally(() => setBusy(null));
  };
  const button = (block: number, choice: ConflictChoice, label: string) =>
    h(
      "button",
      {
        type: "button",
        key: choice,
        className: "deck-conflict__choice",
        disabled: busy !== null,
        onClick: (e: { stopPropagation(): void }) => {
          e.stopPropagation();
          choose(block, choice);
        },
      },
      label,
    );
  return h(
    "div",
    { className: "deck-conflict", role: "alert", "data-conflict-slide": slide },
    h(
      "div",
      { className: "deck-conflict__head" },
      h(
        "strong",
        null,
        blocks.length > 1
          ? `${blocks.length} merge conflicts on this slide`
          : "Merge conflict on this slide",
      ),
      h(
        "span",
        null,
        resolver
          ? "Both versions are kept until you choose."
          : "Both versions are kept until you choose: kadal-deck resolve, or edit the file.",
      ),
    ),
    ...blocks.map((b) => {
      const other = theirsName(b.theirsLabel);
      return h(
        "section",
        { className: "deck-conflict__block", key: b.block },
        h("code", { className: "deck-conflict__where" }, `${file}:${b.line}`),
        h(
          "div",
          { className: "deck-conflict__sides" },
          h(
            "figure",
            { className: "deck-conflict__side is-ours" },
            h("figcaption", null, h("b", null, sideTitle(b.oursLabel, "Yours")), " ", b.oursLabel),
            h("pre", null, b.ours.trim() || "(nothing)"),
          ),
          h(
            "figure",
            { className: "deck-conflict__side is-theirs" },
            h(
              "figcaption",
              null,
              h("b", null, sideTitle(b.theirsLabel, other)),
              " ",
              b.theirsLabel,
            ),
            h("pre", null, b.theirs.trim() || "(nothing)"),
          ),
        ),
        resolver
          ? h(
              "div",
              { className: "deck-conflict__choices" },
              button(b.block, "ours", "Keep yours"),
              button(
                b.block,
                "theirs",
                `Keep ${other === other.toUpperCase() ? other : other.toLowerCase()}`,
              ),
              button(b.block, "both", "Keep both"),
            )
          : null,
      );
    }),
  );
}
