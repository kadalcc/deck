import type { ReactNode } from "react";

import type { LayoutProps } from "@kadal/deck";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Terminal's module: two layouts for live-coding talks, and a session component.
 *
 *   layout: code     the heading small and the code block as tall as the slide allows;
 *                    `::side::` puts notes in a column beside it
 *   layout: shell    the whole slide is a terminal window (`title:` names its bar, default
 *                    "zsh"); the slide's markdown and code run inside it, in mono
 *   <Terminal>       a session, line by line: `lines` (or children, one line each) where
 *                    `$ ` starts a command, `# ` a comment, `! ` an error, `✓ ` a success,
 *                    and anything else is output. `title` names the bar, `prompt` the prompt.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function Code({ children }: LayoutProps) {
  return <div className="deck-layout deck-layout-code">{children}</div>;
}

function Bar({ title }: { title: string }) {
  return (
    <div className="terminal-bar" aria-hidden="true">
      {title}
    </div>
  );
}

function Shell({ children, frontmatter }: LayoutProps) {
  const title = str(frontmatter.title) ?? "zsh";
  return (
    <div className="deck-layout deck-layout-shell">
      <div className="terminal-window">
        <Bar title={title} />
        <div className="terminal-screen">{children}</div>
      </div>
    </div>
  );
}

/** The text of whatever MDX passed: strings, and the strings inside elements, joined. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const props = (node as { props?: { children?: ReactNode } }).props;
  return props ? textOf(props.children) : "";
}

type Kind = "command" | "comment" | "error" | "ok" | "output";

function parseLine(line: string): { kind: Kind; text: string } {
  if (line.startsWith("$ ")) return { kind: "command", text: line.slice(2) };
  if (line.startsWith("# ")) return { kind: "comment", text: line };
  if (line.startsWith("! ")) return { kind: "error", text: line.slice(2) };
  if (line.startsWith("✓ ")) return { kind: "ok", text: line };
  return { kind: "output", text: line };
}

function Terminal({
  lines,
  title = "zsh",
  prompt = "❯",
  children,
}: {
  lines?: string[];
  title?: string;
  prompt?: string;
  children?: ReactNode;
}) {
  const all = lines ?? textOf(children).split("\n");
  const shown = all
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l, i, a) => l || (i > 0 && i < a.length - 1));
  return (
    <figure className="terminal-window is-inline" aria-label={`Terminal: ${title}`}>
      <Bar title={title} />
      <pre className="terminal-lines">
        {shown.map((line, i) => {
          const { kind, text } = parseLine(line);
          return (
            <span key={i} className={`terminal-line is-${kind}`}>
              {kind === "command" ? <span className="terminal-prompt">{prompt} </span> : null}
              {text || " "}
            </span>
          );
        })}
      </pre>
    </figure>
  );
}

export default {
  layouts: { code: Code, shell: Shell },
  components: { Terminal },
};
