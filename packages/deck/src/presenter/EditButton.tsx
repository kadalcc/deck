import { z } from "zod";

import { Icon } from "../components/bling.tsx";
import { readHostOverride } from "../core/model.ts";
import { useCommand } from "../react/commands.ts";
import { useDeck } from "../react/context.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "EDIT" IN THE PRESENTER: a typo spotted mid-rehearsal, fixed on the web
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A host that can quick-edit the deck says where (`window.__KADAL_DECK__.edit`, an http(s) URL —
 * deck.kadal.cc injects `https://deck.kadal.cc/app/decks/<id>/quick-edit`). The presenter view
 * then shows an Edit button, and the `present.edit` command, which open `${edit}?slide=h.v` in a
 * new tab: the builder opens on the slide being presented. Nothing shows without the host's word,
 * and nothing shows outside the presenter view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The quick-edit address for slide h.v, or null when the host gave none. */
export function editUrl(h: number, v: number, scope: unknown = globalThis): string | null {
  const edit = readHostOverride(scope)?.edit;
  if (!edit) return null;
  const url = new URL(edit);
  url.searchParams.set("slide", `${h}.${v}`);
  return url.toString();
}

export function EditOnWebButton() {
  const deck = useDeck();
  const open = () => {
    const s = deck.nav.get();
    const url = editUrl(s.h, s.v);
    if (!url) throw new Error("This deck has no quick edit here: the host did not offer one.");
    window.open(url, "_blank", "noopener");
    return { opened: url };
  };
  useCommand({
    id: "present.edit",
    title: "Edit this slide on the web",
    description:
      "Open the host's quick edit (the web builder) on the slide being presented, in a new tab.",
    group: "present",
    enabled: () => deck.mode === "presenter" && !!readHostOverride()?.edit,
    params: z.object({}).strict(),
    run: () => open(),
  });
  if (!readHostOverride()?.edit) return null;
  return (
    <button
      type="button"
      onClick={() => open()}
      title="Edit this slide on the web (opens a new tab)"
    >
      <Icon name="square-pen" /> Edit
    </button>
  );
}
