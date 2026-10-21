import { useState } from "react";

import { downloadTarget } from "../core/download.ts";
import { fileStem } from "../export/shared.ts";
import { cmd, useCommand } from "./commands.ts";
import { useDeck } from "./context.ts";

/**
 * The deck's Download button (`download` in the headmatter; see core/download.ts), beside the
 * theme menu in the corner. A URL is a plain link. `true` asks for the PDF the build put beside
 * the deck when pressed — a HEAD request, so a deck built without one costs nothing until then —
 * and opens the browser exporter (/export) in a new tab when there is none. `deck.download` runs
 * the same from the keyboard, the phone remote or an agent.
 */
export function DownloadButton({ compact = false }: { compact?: boolean }) {
  const deck = useDeck();
  const target = downloadTarget(deck.config, deck.base);
  const [busy, setBusy] = useState(false);
  const name = `${fileStem(deck.config.title, deck.config.slug || "deck")}.pdf`;

  const go = async () => {
    if (target.kind === "none") return;
    if (target.kind === "url") return void open(target.url, name);
    setBusy(true);
    try {
      const res = await fetch(target.pdf, { method: "HEAD", cache: "no-store" });
      // A dev server or an SPA host answers every path with index.html: only a PDF counts.
      if (res.ok && /pdf/i.test(res.headers.get("content-type") ?? "")) open(target.pdf, name);
      else window.open(target.exporter, "_blank", "noopener");
    } catch {
      window.open(target.exporter, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };

  useCommand(
    target.kind === "none"
      ? null
      : cmd({
          id: "deck.download",
          title: "Download",
          description:
            "Download the deck: the PDF the deck offers, or the browser exporter (/export) when it has none.",
          group: "view",
          run: () => go(),
        }),
  );

  if (target.kind === "none" || deck.mode !== "play") return null;
  const icon = (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" />
    </svg>
  );
  if (target.kind === "url")
    return (
      <a
        className="deck-download"
        href={target.url}
        download={name}
        title="Download"
        aria-label="Download"
      >
        {icon}
        {compact ? null : <span>Download</span>}
      </a>
    );
  return (
    <button
      type="button"
      className="deck-download"
      onClick={() => void go()}
      aria-busy={busy || undefined}
      title="Download"
      aria-label="Download"
    >
      {icon}
      {compact ? null : <span>Download</span>}
    </button>
  );
}

/** Follow a link as a download (same origin), or open it (another origin ignores `download`). */
function open(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  if (new URL(url, location.href).origin !== location.origin) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
