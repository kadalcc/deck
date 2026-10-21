import { readFileSync } from "node:fs";

/**
 * Just enough of the `vscode` API for the extension to activate under `bun test`: registrations
 * are recorded so a test can call the providers and commands the extension registered, the way
 * VS Code would. Not a simulator — no rendering, no real editor — but it runs the extension's own
 * code end to end against a real deck.
 */

type Listener<T> = (e: T) => unknown;

export class EventEmitter<T> {
  private listeners = new Set<Listener<T>>();
  event = (fn: Listener<T>) => {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  };
  fire(e: T) {
    for (const fn of Array.from(this.listeners)) fn(e);
  }
  dispose() {
    this.listeners.clear();
  }
}

const noopEvent = () => ({ dispose() {} });

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
    this.start = typeof a === "number" ? new Position(a, b as number) : a;
    this.end = typeof a === "number" ? new Position(c!, d!) : (b as Position);
  }
}
export class Selection extends Range {
  get active() {
    return this.end;
  }
}
export class Uri {
  constructor(readonly fsPath: string) {}
  static file(p: string) {
    return new Uri(p);
  }
  static parse(s: string) {
    return new Uri(s);
  }
  toString() {
    return this.fsPath;
  }
}

export class TextDocument {
  isDirty = false;
  eol = 1;
  languageId = "kadal-deck";
  readonly uri: Uri;
  constructor(
    path: string,
    private text: string,
  ) {
    this.uri = Uri.file(path);
  }
  getText() {
    return this.text;
  }
  setText(t: string) {
    this.text = t;
  }
  get lineCount() {
    return this.text.split("\n").length;
  }
  lineAt(line: number) {
    const text = this.text.split("\n")[line] ?? "";
    return { text, range: new Range(line, 0, line, text.length) };
  }
  offsetAt(p: Position) {
    const lines = this.text.split("\n");
    let o = 0;
    for (let i = 0; i < p.line; i++) o += lines[i]!.length + 1;
    return o + p.character;
  }
  positionAt(offset: number) {
    const before = this.text.slice(0, offset).split("\n");
    return new Position(before.length - 1, before[before.length - 1]!.length);
  }
  getWordRangeAtPosition(p: Position, re: RegExp) {
    const line = this.lineAt(p.line).text;
    for (const m of line.matchAll(new RegExp(re.source, "g"))) {
      if (m.index! <= p.character && p.character <= m.index! + m[0].length)
        return new Range(p.line, m.index!, p.line, m.index! + m[0].length);
    }
    return undefined;
  }
  async save() {
    this.isDirty = false;
    return true;
  }
}

export class MarkdownString {
  value = "";
  constructor(v = "") {
    this.value = v;
  }
  appendMarkdown(s: string) {
    this.value += s;
    return this;
  }
  appendText(s: string) {
    this.value += s;
    return this;
  }
}
export class SnippetString {
  constructor(readonly value: string) {}
}
export class CompletionItem {
  detail?: string;
  documentation?: unknown;
  insertText?: unknown;
  sortText?: string;
  command?: unknown;
  constructor(
    readonly label: string,
    readonly kind?: number,
  ) {}
}
export class Hover {
  constructor(
    readonly contents: MarkdownString,
    readonly range?: Range,
  ) {}
}
export class FoldingRange {
  constructor(
    readonly start: number,
    readonly end: number,
  ) {}
}
export class TreeItem {
  description?: string;
  id?: string;
  contextValue?: string;
  iconPath?: unknown;
  tooltip?: unknown;
  command?: unknown;
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}
export class ThemeIcon {
  constructor(readonly id: string) {}
}
export class ThemeColor {
  constructor(readonly id: string) {}
}
export class Diagnostic {
  source?: string;
  code?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: number,
  ) {}
}
export class DataTransferItem {
  constructor(readonly value: unknown) {}
}
export class DataTransfer {
  private map = new Map<string, DataTransferItem>();
  get(m: string) {
    return this.map.get(m);
  }
  set(m: string, v: DataTransferItem) {
    this.map.set(m, v);
  }
}
export const TextEdit = {
  replace: (range: Range, newText: string) => ({ range, newText }),
};
export class WorkspaceEdit {
  readonly edits: Array<{ uri: Uri; range: Range; text: string }> = [];
  replace(uri: Uri, range: Range, text: string) {
    this.edits.push({ uri, range, text });
  }
}

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const CompletionItemKind = { Property: 9, Value: 12, Class: 6 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const EndOfLine = { LF: 1, CRLF: 2 };
export const ConfigurationTarget = { Global: 1 };
export const ProgressLocation = { Window: 10 };
export const TextEditorRevealType = { InCenterIfOutsideViewport: 2 };

/* ── the recorded world ─────────────────────────────────────────────────── */

export const recorded = {
  commands: new Map<string, (...a: unknown[]) => unknown>(),
  providers: {} as Record<string, unknown>,
  trees: new Map<string, { treeDataProvider: unknown; dragAndDropController?: unknown }>(),
  webviews: new Map<string, unknown>(),
  context: new Map<string, unknown>(),
  documents: new Map<string, TextDocument>(),
  files: [] as string[],
  edits: [] as WorkspaceEdit[],
  config: {} as Record<string, unknown>,
};

const docFor = (path: string) => {
  let d = recorded.documents.get(path);
  if (!d) {
    d = new TextDocument(path, readFileSync(path, "utf8"));
    recorded.documents.set(path, d);
  }
  return d;
};

export const commands = {
  registerCommand(id: string, fn: (...a: unknown[]) => unknown) {
    recorded.commands.set(id, fn);
    return { dispose() {} };
  },
  async executeCommand(id: string, ...args: unknown[]) {
    if (id === "setContext") {
      recorded.context.set(args[0] as string, args[1]);
      return;
    }
    return recorded.commands.get(id)?.(...args);
  },
};

const changeDoc = new EventEmitter<{ document: TextDocument }>();
export const workspace = {
  get textDocuments() {
    return [...recorded.documents.values()];
  },
  workspaceFolders: [],
  getConfiguration: () => ({
    get: <T>(key: string, fallback: T): T => (recorded.config[key] as T) ?? fallback,
    update: async (key: string, value: unknown) => {
      recorded.config[key] = value;
    },
  }),
  findFiles: async (glob: string) =>
    recorded.files.filter((f) => f.endsWith(glob.replace("**/", "/"))).map((f) => Uri.file(f)),
  onDidChangeTextDocument: changeDoc.event,
  onDidSaveTextDocument: noopEvent,
  onDidChangeConfiguration: noopEvent,
  createFileSystemWatcher: () => ({
    onDidCreate: noopEvent,
    onDidDelete: noopEvent,
    onDidChange: noopEvent,
    dispose() {},
  }),
  asRelativePath: (p: string) => p.split("/").slice(-2).join("/"),
  openTextDocument: async (p: string | Uri) => docFor(typeof p === "string" ? p : p.fsPath),
  async applyEdit(edit: WorkspaceEdit) {
    recorded.edits.push(edit);
    for (const e of edit.edits) {
      const d = docFor(e.uri.fsPath);
      const text = d.getText();
      d.setText(
        text.slice(0, d.offsetAt(e.range.start)) + e.text + text.slice(d.offsetAt(e.range.end)),
      );
      changeDoc.fire({ document: d });
    }
    return true;
  },
};

export const window = {
  activeTextEditor: undefined as unknown,
  createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
  createTreeView: (
    id: string,
    options: { treeDataProvider: unknown; dragAndDropController?: unknown },
  ) => {
    recorded.trees.set(id, options);
    return {
      visible: false,
      reveal: async () => {},
      dispose() {},
      message: undefined,
      description: undefined,
    };
  },
  registerWebviewViewProvider: (id: string, provider: unknown) => {
    recorded.webviews.set(id, provider);
    return { dispose() {} };
  },
  createTextEditorDecorationType: () => ({ dispose() {} }),
  onDidChangeTextEditorSelection: noopEvent,
  onDidChangeActiveTextEditor: noopEvent,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showTextDocument: async (doc: TextDocument) => ({
    document: doc,
    selection: new Selection(0, 0, 0, 0),
    revealRange() {},
    setDecorations() {},
  }),
  withProgress: async (_o: unknown, fn: () => Promise<unknown>) => fn(),
};

const register = (kind: string) => (_sel: unknown, provider: unknown) => {
  recorded.providers[kind] = provider;
  return { dispose() {} };
};
export const languages = {
  registerDocumentFormattingEditProvider: register("format"),
  registerCompletionItemProvider: register("completion"),
  registerHoverProvider: register("hover"),
  registerFoldingRangeProvider: register("folding"),
  createDiagnosticCollection: () => ({ set() {}, clear() {}, dispose() {} }),
};

export const env = {
  asExternalUri: async (u: Uri) => u,
  openExternal: async () => true,
};
