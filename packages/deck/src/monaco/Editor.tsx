import { useEffect, useRef } from "react";

import { type MonacoHost, type MonacoLoader, loadMonaco } from "./loader.ts";
import type { MonacoTypesOptions } from "./types.ts";

/**
 * The Monaco editor itself: the lazy half of a `{monaco…}` block (components/MonacoCode.tsx is
 * the eager half — the static face, the toolbar, the runner's output). This chunk is fetched
 * only when a block is on the slide being presented, and Monaco only through the loader.
 *
 * It sizes itself from the static block it replaces — the same font, size and line height — so
 * nothing jumps when the editor takes over; `height` in the block's options overrides that
 * (`'auto'` grows with the content). The theme follows the deck's colour scheme live, and the
 * theme menu: a theme with its own Shiki pair recolours the editor as it does the static code.
 * The packages the code imports get their types (monaco/types.ts) as the editor opens and again
 * as imports are typed, so their hovers and errors are TypeScript's own.
 *
 * Keys: the editor owns every key while it has focus (the deck's own handler skips
 * `[data-deck-own-keys]`); Escape hands focus back to the slide, so the arrows move slides
 * again; Ctrl/Cmd+Enter runs the block (`{monaco-run}`), Ctrl/Cmd+S saves it (`{monaco-write}`).
 */
export interface EditorProps {
  loader: MonacoLoader;
  mode: "editor" | "diff" | "run" | "write";
  lang: string;
  code: string;
  /** The left side of a diff. */
  original?: string;
  scheme: "light" | "dark";
  /** The Shiki theme the static code wears now (compiler/code-themes.ts); null: the scheme's. */
  shikiTheme?: string | null;
  /** Where the imported packages' types come from (`monacoTypes`, `monacoPackages`…). */
  types?: MonacoTypesOptions;
  readOnly: boolean;
  lines: boolean;
  /** CSS height, or "auto" to grow with the content; null sizes to the first content. */
  height: string | null;
  /** The block's `editorOptions`. */
  editorOptions: Record<string, unknown>;
  /**
   * The diff editor side by side or inline; null (the default) lets Monaco go inline when the
   * block is too narrow for two columns.
   */
  sideBySide: boolean | null;
  /** Font, size and line height to match, read from the static block. */
  metrics: { fontFamily: string; fontSize: number; lineHeight: number };
  onChange?: (code: string) => void;
  onRun?: () => void;
  onSave?: () => void;
  onReady?: (host: MonacoHost) => void;
  onError?: (message: string) => void;
}

let modelSeq = 0;

export default function Editor(props: EditorProps) {
  const el = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const api = useRef<{ setTheme(s: "light" | "dark", shiki: string | null): void } | null>(null);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const p = latest.current;
    loadMonaco(p.loader)
      .then(async (host) => {
        if (disposed || !el.current) return;
        const { monaco } = host;
        const language = await host.language(p.lang);
        if (disposed || !el.current) return;
        const { fontFamily, fontSize, lineHeight } = p.metrics;
        const options = {
          theme: host.theme(p.scheme),
          fontFamily,
          fontSize,
          lineHeight,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: p.lines ? "on" : "off",
          lineNumbersMinChars: 3,
          folding: false,
          glyphMargin: false,
          // The static block's left padding (1.2em), so the code does not move when the editor arrives.
          lineDecorationsWidth: p.lines ? Math.round(fontSize * 0.6) : Math.round(fontSize * 1.2),
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: Math.round(fontSize * 0.7), bottom: Math.round(fontSize * 0.7) },
          tabSize: 2,
          fixedOverflowWidgets: false,
          readOnly: p.readOnly,
          domReadOnly: p.readOnly,
          ...host.editorOptions,
          ...p.editorOptions,
        } as Record<string, unknown>;

        const id = ++modelSeq;
        const ext = language === "typescript" ? "ts" : language === "javascript" ? "js" : "txt";
        const uri = (name: string) => monaco.Uri.parse(`file:///kadal-deck/${name}-${id}.${ext}`);
        const modified = monaco.editor.createModel(p.code, language, uri("block"));
        cleanups.push(() => modified.dispose());
        // Types for what the code imports: now, and again a moment after an edit settles.
        const typed = language === "typescript" || language === "javascript";
        const acquire = (code: string) => {
          if (typed) void host.acquireTypes?.(code, latest.current.types).catch(() => {});
        };
        acquire(p.code);
        if (p.mode === "diff") acquire(p.original ?? "");
        let typesTimer: ReturnType<typeof setTimeout> | undefined;
        const typesSub = modified.onDidChangeContent(() => {
          clearTimeout(typesTimer);
          typesTimer = setTimeout(() => acquire(modified.getValue()), 700);
        });
        cleanups.push(() => {
          clearTimeout(typesTimer);
          typesSub.dispose();
        });
        let codeEditor: {
          getContentHeight(): number;
          onDidContentSizeChange(f: () => void): { dispose(): void };
        };
        let diffUpdated: ((f: () => void) => { dispose(): void }) | null = null;
        let focusable: { addCommand(k: number, f: () => void): unknown; hasTextFocus(): boolean };

        if (p.mode === "diff") {
          const original = monaco.editor.createModel(p.original ?? "", language, uri("original"));
          cleanups.push(() => original.dispose());
          const diff = monaco.editor.createDiffEditor(el.current, {
            ...(options as object),
            renderSideBySide: p.sideBySide !== false,
            originalEditable: false,
            enableSplitViewResizing: false,
            renderOverviewRuler: false,
            useInlineViewWhenSpaceIsLimited: p.sideBySide === null,
          } as never);
          diff.setModel({ original, modified });
          cleanups.push(() => diff.dispose());
          const edit = diff.getModifiedEditor();
          diffUpdated = (f) => diff.onDidUpdateDiff(f);
          codeEditor = edit as never;
          focusable = edit as never;
          const sub = modified.onDidChangeContent(() =>
            latest.current.onChange?.(modified.getValue()),
          );
          cleanups.push(() => sub.dispose());
        } else {
          const editor = monaco.editor.create(el.current, {
            ...(options as object),
            model: modified,
          } as never);
          cleanups.push(() => editor.dispose());
          codeEditor = editor as never;
          focusable = editor as never;
          const sub = editor.onDidChangeModelContent(() =>
            latest.current.onChange?.(editor.getValue()),
          );
          cleanups.push(() => sub.dispose());
        }

        // Height: fixed, the first content's, or growing with the content.
        const box = el.current;
        const fit = () => {
          box.style.height = `${Math.max(lineHeight * 2, codeEditor.getContentHeight())}px`;
        };
        // A diff grows once it is computed (the inline view adds the removed lines), so it follows
        // its content like `height: 'auto'`.
        if (p.height && p.height !== "auto") box.style.height = p.height;
        else {
          fit();
          if (p.height === "auto" || diffUpdated) {
            const sub = codeEditor.onDidContentSizeChange(fit);
            cleanups.push(() => sub.dispose());
          }
          if (diffUpdated) {
            const sub = diffUpdated(fit);
            cleanups.push(() => sub.dispose());
          }
        }

        const { KeyMod, KeyCode } = monaco;
        focusable.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => latest.current.onRun?.());
        focusable.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => latest.current.onSave?.());
        // Escape: give the keys back to the deck (unless a widget — suggestions, find — is open,
        // which Monaco closes on Escape itself, before this sees it).
        const onKey = (e: KeyboardEvent) => {
          if (e.key !== "Escape" || !focusable.hasTextFocus()) return;
          const active = document.activeElement as HTMLElement | null;
          if (active && box.contains(active)) {
            active.blur();
            box.closest<HTMLElement>(".deck-code-block")?.focus({ preventScroll: true });
          }
        };
        box.addEventListener("keydown", onKey);
        cleanups.push(() => box.removeEventListener("keydown", onKey));

        // The theme on show: by its Shiki name when the host can load any (the theme menu's),
        // else the deck's pair by scheme. The latest ask wins a race between two loads.
        let asked = 0;
        api.current = {
          setTheme: (s, shiki) => {
            const ask = ++asked;
            if (!shiki || !host.themeNamed) {
              monaco.editor.setTheme(host.theme(s));
              return;
            }
            host.themeNamed(shiki).then(
              (name) => ask === asked && !disposed && monaco.editor.setTheme(name),
              () => ask === asked && !disposed && monaco.editor.setTheme(host.theme(s)),
            );
          },
        };
        // The scheme (or the theme) may have changed while Monaco loaded.
        api.current.setTheme(latest.current.scheme, latest.current.shikiTheme ?? null);
        latest.current.onReady?.(host);
      })
      .catch((err: unknown) => {
        if (!disposed) latest.current.onError?.(err instanceof Error ? err.message : String(err));
      });
    return () => {
      disposed = true;
      api.current = null;
      for (const c of cleanups.reverse()) c();
    };
    // The editor is made once per block; later prop changes reach it through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.setTheme(props.scheme, props.shikiTheme ?? null);
  }, [props.scheme, props.shikiTheme]);

  return <div ref={el} className="deck-monaco-host" />;
}
