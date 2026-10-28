import {
  type ReactNode,
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { linesOn } from "../compiler/code-meta.ts";
import { codeThemeFor } from "../compiler/code-themes.ts";
import type { MonacoHost } from "../monaco/loader.ts";
import { monacoLoaderFor } from "../monaco/loader.ts";
import { type CodeOutput, loadCodeRunnerSetup, runCode } from "../monaco/runners.ts";
import { monacoTypesOptions, runImportResolver } from "../monaco/types-config.ts";
import { useDeck, useSlide } from "../react/context.ts";
import { useClick, useUi } from "../react/hooks.ts";
import type { CodeProps } from "./Code.tsx";
import { CodeGroupContext } from "./CodeGroup.tsx";
import { CodeTitle } from "./file-icons.tsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A `{monaco…}` BLOCK: the editor's eager half
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ```ts {monaco}             an editor on the slide
 *   ```ts {monaco-diff}        a diff editor: the original, a `~~~` line, the modified version
 *   ```ts {monaco-run}         an editor with a Run button and the output under it (or beside
 *                              it, `{outputPosition:'right'}`); runs on load and on every edit
 *                              unless `{autorun:false}`; `{showOutputAt:'+1'}` keeps the output
 *                              back until a click; `{outputHeight:'200px'}`, `{timeout:10000}`
 *   <<< ./x.ts {monaco-write}  an editor whose edits are saved to the file (dev only)
 *
 * This half is in the main bundle and stays small: the block's static face (the Shiki HTML the
 * build made), the toolbar, the runner's output. The editor is a lazy chunk (monaco/Editor.tsx)
 * mounted only where someone can use it — the slide on show in the deck or the presenter's
 * current slide — and Monaco itself loads through the deck's loader (monaco/loader.ts). Print,
 * export, previews, the phone remote and the audience's copy keep the static face, and a
 * `{monaco-run}` block still runs there (the runners need no editor), so a printed page carries
 * the code and its output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Editor = lazy(() => import("../monaco/Editor.tsx"));

type Mode = "editor" | "diff" | "run" | "write";

/** An output, ready to show (HTML already sanitised). */
type Shown =
  | { kind: "text"; text: string; level: string; transient?: boolean }
  | { kind: "html"; html: string }
  | { kind: "node"; node: ReactNode }
  | { kind: "dom"; el: HTMLElement }
  | { kind: "error"; text: string };

function parseOptions(json: string | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const atOf = (v: unknown): number | string | undefined =>
  v === undefined || v === null || v === ""
    ? undefined
    : typeof v === "number"
      ? v
      : /^\d+$/.test(String(v))
        ? Number(v)
        : String(v);

let purify: Promise<(html: string) => string> | null = null;
/** DOMPurify, loaded the first time a runner returns HTML. */
const sanitiser = () =>
  (purify ??= import("dompurify").then((m) => {
    const p = (m.default ?? m) as unknown as { sanitize(h: string): string };
    return (html: string) => p.sanitize(html);
  }));

async function show(o: CodeOutput): Promise<Shown> {
  if ("error" in o) return { kind: "error", text: o.error };
  if ("html" in o) return { kind: "html", html: (await sanitiser())(o.html) };
  if ("element" in o)
    return typeof HTMLElement !== "undefined" && o.element instanceof HTMLElement
      ? { kind: "dom", el: o.element }
      : { kind: "node", node: o.element as ReactNode };
  return { kind: "text", text: o.text, level: o.level ?? "log", transient: o.transient };
}

export function MonacoCode(props: CodeProps) {
  const {
    children,
    className,
    "data-title": title,
    "data-lang": langAttr,
    "data-lines": linesAttr,
    "data-max-height": maxHeight,
    "data-start": startAttr,
    "data-code": codeAttr,
    "data-original": original,
    "data-monaco": modeAttr,
    "data-monaco-options": optionsAttr,
    "data-snippet": snippet,
    "data-total": total,
  } = props;
  const mode = (
    ["editor", "diff", "run", "write"].includes(modeAttr ?? "") ? modeAttr : "editor"
  ) as Mode;
  const lang = langAttr ?? "text";
  const initial = codeAttr ?? "";
  const options = useMemo(() => parseOptions(optionsAttr), [optionsAttr]);
  const deck = useDeck();
  const slide = useSlide();
  const scheme = useUi((s) => s.colorScheme);
  const uiTheme = useUi((s) => s.theme);
  // The editor wears what the static code wears: the theme on show's Shiki theme for the scheme.
  const shikiTheme = codeThemeFor(deck.manifest.codeThemes, uiTheme, scheme);
  const typing = useMemo(
    () => monacoTypesOptions(deck.config as unknown as Record<string, unknown>),
    [deck.config],
  );
  const inGroup = useContext(CodeGroupContext);
  const loader = monacoLoaderFor(deck.manifest);
  const printing = deck.mode === "print";
  const interactive = deck.mode === "play" || deck.mode === "presenter";
  const onStage = interactive && slide.active && !slide.preview;
  const live = !!loader && onStage;

  const pre = useRef<HTMLPreElement>(null);
  const [metrics, setMetrics] = useState<{
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
  } | null>(null);
  const [host, setHost] = useState<MonacoHost | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const code = useRef(initial);

  // The editor matches the static block's type exactly; read it once the block is laid out.
  useLayoutEffect(() => {
    if (!live || metrics || !pre.current) return;
    const cs = getComputedStyle(pre.current);
    const fontSize = Number.parseFloat(cs.fontSize) || 16;
    const lh = Number.parseFloat(cs.lineHeight);
    setMetrics({
      fontFamily: cs.fontFamily,
      fontSize,
      lineHeight: Number.isFinite(lh) ? Math.round(lh) : Math.round(fontSize * 1.6),
    });
  }, [live, metrics]);

  // ── the runner ────────────────────────────────────────────────────────────────────────
  const runs = mode === "run";
  const autorun = options.autorun !== false && options.autorun !== "false";
  const outputAt = runs ? atOf(options.showOutputAt) : undefined;
  const { shown: outputShown } = useClick(outputAt !== undefined ? { at: outputAt } : { at: 0 });
  const [outputs, setOutputs] = useState<Shown[]>([]);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const runnerOptions =
    options.runnerOptions && typeof options.runnerOptions === "object"
      ? (options.runnerOptions as Record<string, unknown>)
      : {};
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : undefined;

  const run = useCallback(
    async (source: string) => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setRunning(true);
      setRan(true);
      setOutputs([]);
      await loadCodeRunnerSetup(deck.manifest.codeRunners);
      // Outputs are prepared in order (HTML is sanitised asynchronously), then shown.
      let chain = Promise.resolve();
      await runCode(source, lang, {
        options: runnerOptions,
        timeout,
        // Bare imports through the deck's CDN, at the versions its editors' types use.
        resolveImport: runImportResolver(deck.config.monacoRunImports, typing.versions),
        signal: ac.signal,
        onOutput: (o) => {
          chain = chain.then(async () => {
            const s = await show(o);
            // A status line gives way to whatever comes next.
            if (!ac.signal.aborted)
              setOutputs((prev) => [...prev.filter((p) => !(p.kind === "text" && p.transient)), s]);
          });
        },
      });
      await chain;
      if (!ac.signal.aborted) {
        setOutputs((prev) => prev.filter((p) => !(p.kind === "text" && p.transient)));
        setRunning(false);
      }
    },
    // runnerOptions/timeout come from the block's fixed options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, optionsAttr, deck.manifest, deck.config.monacoRunImports, typing],
  );

  // Autorun: when the block is on stage (or printed), and again after each edit.
  const canRun = runs && (onStage || printing);
  useEffect(() => {
    if (!canRun || !autorun) return;
    void run(code.current);
    return () => abort.current?.abort();
  }, [canRun, autorun, run, resetKey]);
  useEffect(() => () => abort.current?.abort(), []);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  // ── saving ({monaco-write}, dev only) ─────────────────────────────────────────────────
  const writable = mode === "write" && !!host?.writeEndpoint;
  const [saveState, setSaveState] = useState<{
    kind: "idle" | "saving" | "saved" | "error";
    text?: string;
  }>({ kind: "idle" });
  const saved = useRef(initial);
  const save = useCallback(async () => {
    if (!host?.writeEndpoint) return;
    const next = code.current;
    if (next === saved.current) return;
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch(host.writeEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slide: slide.meta.index,
          file: slide.meta.source?.file ?? null,
          snippet: snippet ?? null,
          original: saved.current,
          code: next,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        file?: string;
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      saved.current = next;
      setSaveState({ kind: "saved", text: body.file });
    } catch (err) {
      setSaveState({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }, [host, slide.meta, snippet]);

  const onChange = useCallback(
    (next: string) => {
      code.current = next;
      if (debounce.current) clearTimeout(debounce.current);
      if (runs && autorun) debounce.current = setTimeout(() => void run(code.current), 650);
      else if (writable) debounce.current = setTimeout(() => void save(), 700);
    },
    [runs, autorun, run, writable, save],
  );

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };
  const reset = () => {
    code.current = initial;
    setResetKey((k) => k + 1);
    setHost(null);
  };

  const ready = live && !!host && !failed;
  const readOnly = mode === "write" ? !writable && !!host : options.readonly === true;
  const height =
    typeof options.height === "string" || typeof options.height === "number"
      ? String(options.height)
      : null;
  const editorHeight = height && /^\d+$/.test(height) ? `${height}px` : height;
  const lines = linesOn(linesAttr, deck.config.lineNumbers);
  const showTitle = !!title && !inGroup;
  const right = options.outputPosition === "right";
  const outputHeight =
    typeof options.outputHeight === "string" || typeof options.outputHeight === "number"
      ? /^\d+$/.test(String(options.outputHeight))
        ? `${options.outputHeight}px`
        : String(options.outputHeight)
      : undefined;
  const changed = ready && code.current !== initial;

  const toolbar = (
    <div className="deck-monaco-toolbar">
      {mode === "write" && host ? (
        <span
          className={`deck-monaco-status is-${writable ? saveState.kind : "readonly"}`}
          role="status"
        >
          {!writable
            ? "read-only here"
            : saveState.kind === "saving"
              ? "Saving…"
              : saveState.kind === "saved"
                ? `Saved${saveState.text ? ` to ${saveState.text}` : ""}`
                : saveState.kind === "error"
                  ? `Not saved: ${saveState.text}`
                  : "Edits save to the file"}
        </span>
      ) : null}
      {mode !== "diff" && ready ? (
        <button
          type="button"
          onClick={reset}
          disabled={!changed && resetKey === 0}
          aria-label="Reset the code to the slide's"
        >
          Reset
        </button>
      ) : null}
      <button type="button" onClick={copy} aria-label="Copy code">
        {copied ? "Copied" : "Copy"}
      </button>
      {runs ? (
        <button
          type="button"
          className="deck-monaco-run"
          onClick={() => void run(code.current)}
          aria-label="Run the code (Ctrl+Enter or ⌘+Enter in the editor)"
          aria-busy={running}
          disabled={!interactive && !printing}
        >
          <svg viewBox="0 0 16 16" width="0.9em" height="0.9em" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
          </svg>
          {running ? "Running" : "Run"}
        </button>
      ) : null}
    </div>
  );

  const start = Number(startAttr ?? 1);
  return (
    <div
      className={[
        "deck-code-block",
        "deck-monaco",
        `is-${mode}`,
        showTitle ? "has-title" : "",
        ready ? "is-live" : "",
        right ? "has-output-right" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-lang={lang}
      tabIndex={-1}
    >
      {showTitle ? (
        <CodeTitle title={title} lang={lang}>
          {toolbar}
        </CodeTitle>
      ) : null}
      {!showTitle ? toolbar : null}
      <div className="deck-monaco-main">
        <div className="deck-monaco-body" data-deck-own-keys={ready ? "" : undefined}>
          <pre
            ref={pre}
            hidden={ready}
            className={["deck-code", "shiki", lines ? "has-lines" : "", className]
              .filter(Boolean)
              .join(" ")}
            style={{
              ...(maxHeight ? { maxHeight, overflow: "auto" } : null),
              ...(editorHeight && editorHeight !== "auto"
                ? { height: editorHeight, overflow: "auto" }
                : null),
              counterReset: `line ${start - 1}`,
            }}
            data-total={total || undefined}
          >
            {children}
          </pre>
          {live && metrics && !failed ? (
            <Suspense fallback={null}>
              <Editor
                key={resetKey}
                loader={loader!}
                mode={mode}
                lang={lang}
                code={code.current}
                original={original}
                scheme={scheme}
                shikiTheme={shikiTheme}
                types={typing}
                readOnly={readOnly}
                lines={lines}
                height={editorHeight}
                editorOptions={
                  options.editorOptions && typeof options.editorOptions === "object"
                    ? (options.editorOptions as Record<string, unknown>)
                    : {}
                }
                sideBySide={typeof options.sideBySide === "boolean" ? options.sideBySide : null}
                metrics={metrics}
                onChange={onChange}
                onRun={runs ? () => void run(code.current) : undefined}
                onSave={writable ? () => void save() : undefined}
                onReady={setHost}
                onError={setFailed}
              />
            </Suspense>
          ) : null}
          {onStage && !loader ? (
            <p className="deck-monaco-note">
              The editor is not available on this page; this is the code as written.
            </p>
          ) : null}
          {failed ? (
            <p className="deck-monaco-note" role="status">
              The editor did not load ({failed}); this is the code as written.
            </p>
          ) : null}
        </div>
        {runs ? (
          <div
            className={[
              "deck-run-output",
              outputShown ? "" : "is-held",
              running ? "is-running" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="log"
            aria-live="polite"
            aria-label="Output"
            style={outputHeight ? { height: outputHeight } : undefined}
            hidden={!outputShown}
          >
            {outputs.length === 0 ? (
              <span className="deck-run-empty">
                {running
                  ? "Running…"
                  : ran
                    ? "No output"
                    : autorun
                      ? ""
                      : "Press Run to see the output"}
              </span>
            ) : (
              outputs.map((o, i) => <OutputLine key={i} out={o} />)
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OutputLine({ out }: { out: Shown }) {
  if (out.kind === "text") return <div className={`deck-run-line is-${out.level}`}>{out.text}</div>;
  if (out.kind === "error") return <div className="deck-run-line is-error">{out.text}</div>;
  if (out.kind === "html")
    return <div className="deck-run-html" dangerouslySetInnerHTML={{ __html: out.html }} />;
  if (out.kind === "dom") return <DomOutput el={out.el} />;
  return <div className="deck-run-html">{out.node}</div>;
}

function DomOutput({ el }: { el: HTMLElement }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    b.replaceChildren(el);
    return () => b.replaceChildren();
  }, [el]);
  return <div ref={box} className="deck-run-html" />;
}
