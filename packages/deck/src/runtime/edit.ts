import { MULTILINE, lineColumn, lineStarts } from "./edit-map.ts";
import {
  type EditMark,
  type EditMarkKind,
  MARK_CLOSE,
  MARK_OPEN,
  cleanHref,
  extractMarks,
} from "./marks.ts";
import type { FromPreview } from "./protocol.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITING IN PLACE: the preview's side
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The editor arms it (`{type:"edit", on:true}`); then, on the slide on screen:
 *   · hovering outlines the element under the pointer — "Double-click to edit" when its text is
 *     one plain run of the source (runtime/edit-map.ts tagged it `data-deck-edit`), "Edit in
 *     source" otherwise;
 *   · a click says where it is in the source (`located`), so the editor can move its cursor there;
 *   · a double-click on editable text makes it plain-text editable in place. Enter (or leaving the
 *     element) saves, Esc puts it back, Shift+Enter is a line break in a paragraph and nothing
 *     anywhere else, a paste arrives as plain text.
 *   · with `marks` armed (`{type:"edit", on:true, marks:true}`, for an editor that spells them),
 *     Cmd/Ctrl+B and I make the selection bold and italic, and Cmd/Ctrl+K asks for an address in
 *     a field under the element and makes it a link; the same shortcut on a mark takes it off
 *     again, and Cmd/Ctrl+Z takes the last one back. They show at once, and are reported with
 *     the text as `edited.marks` (runtime/marks.ts spells them in Markdown).
 *
 * Saving does not change the deck: it posts `edited` — this range of this file, what it said,
 * what it says now — and the editor applies it to its text and sends the source again, which
 * recompiles the slide. The edited element keeps the typed text meanwhile, so nothing flickers;
 * if no source comes back (the editor refused it), the element is put back as it was.
 *
 * While an element is being edited no key reaches the deck: the listener sits on the window in
 * the capture phase, ahead of the deck's own (the shell installs it before the deck mounts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface InPlaceEditing {
  /** `marks`: the editor spells `edited.marks`, so the formatting shortcuts are on. */
  arm(on: boolean, options?: { marks?: boolean }): void;
  /** The text the editor sent last: every offset this reports is into these. */
  setSource(text: string, files: Record<string, string>): void;
  /** A new source is about to compile: an edit in progress is saved (its element goes away). */
  flush(): void;
  dispose(): void;
}

export interface InPlaceOptions {
  post: (message: FromPreview) => void;
  /** Where the slide on screen starts, for a click on something that is not tagged. */
  slideSource: () => { file: string; line: number } | null;
  /** The deck file's name (`source.text`). Default "deck.mdx". */
  file?: string;
}

/** Without an answer from the editor in this long, an edited element is put back as it was. */
const RESTORE_MS = 5000;

const PRESENT = ".deck-slide.is-present";
const ACCENT = "#2563eb";
const MUTED = "#64748b";

interface Editing {
  el: HTMLElement;
  file: string;
  from: number;
  to: number;
  before: string;
  multiline: boolean;
  restore: () => void;
  off: () => void;
  /** Undo for each formatting shortcut, last first. */
  undo: Array<() => void>;
}

const MARK_TAG: Record<EditMarkKind, string> = { bold: "strong", italic: "em", link: "a" };

/** Where a pointer is, as a DOM caret (Chromium/WebKit spell it one way, Gecko another). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return { node: p.offsetNode, offset: p.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** Every text node under `el` with what it says now, to put back on Esc. */
function snapshot(el: HTMLElement): () => void {
  const children = [...el.childNodes];
  const texts: Array<[Text, string]> = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode())
    texts.push([n as Text, (n as Text).data]);
  return () => {
    el.replaceChildren(...children);
    for (const [node, data] of texts) node.data = data;
  };
}

/**
 * What a person typed, as plain text: line breaks are `<br>`s or new blocks. A formatting mark
 * (an element with `data-deck-mark`) is bracketed with MARK_OPEN/MARK_CLOSE, and listed in
 * `kinds` in the order it opens.
 */
function typed(el: HTMLElement): {
  raw: string;
  kinds: Array<{ mark: EditMarkKind; href?: string }>;
} {
  let out = "";
  const kinds: Array<{ mark: EditMarkKind; href?: string }> = [];
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += (child as Text).data;
      else if (child.nodeName === "BR") out += "\n";
      else {
        if ((child.nodeName === "DIV" || child.nodeName === "P") && out) out += "\n";
        const mark = (child as HTMLElement).getAttribute?.("data-deck-mark") as EditMarkKind | null;
        if (mark) {
          const href = (child as HTMLElement).getAttribute("data-deck-href");
          kinds.push(mark === "link" && href ? { mark, href } : { mark });
          out += MARK_OPEN;
          walk(child);
          out += MARK_CLOSE;
        } else walk(child);
      }
    }
  };
  walk(el);
  return { raw: out, kinds };
}

/** Undo a wrap: the mark's children back where it stood. */
function unwrap(mark: HTMLElement): () => void {
  const parent = mark.parentNode!;
  const next = mark.nextSibling;
  const kids = [...mark.childNodes];
  for (const k of kids) parent.insertBefore(k, mark);
  mark.remove();
  return () => {
    parent.insertBefore(mark, kids[0] ?? next);
    mark.append(...kids);
  };
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/**
 * The text to report: no-break spaces (which contenteditable inserts for runs of spaces) as
 * spaces, no blank lines (a paragraph break would split the paragraph), one line where only one
 * fits, nothing at the ends.
 */
export function cleanTyped(raw: string, multiline: boolean): string {
  const text = raw.replace(/ /g, " ");
  return (multiline ? text.replace(/[ \t]*\n\s*/g, "\n") : text.replace(/\s*\n\s*/g, " ")).trim();
}

export function inPlaceEditing(options: InPlaceOptions): InPlaceEditing {
  const deckFile = options.file ?? "deck.mdx";
  let source: { text: string; files: Record<string, string> } = { text: "", files: {} };
  let armed = false;
  let marksOn = false;
  let editing: Editing | null = null;
  /** Cmd/Ctrl+K's address field, while it is open: the selection it will link. */
  let linking: { range: Range; form: HTMLFormElement; input: HTMLInputElement } | null = null;
  let hovered: HTMLElement | null = null;
  let pending: { restore: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

  const textOf = (file: string): string | undefined =>
    file === deckFile ? source.text : source.files[file];

  // ─── the outline: one fixed box over the slide, never inside it ───
  let box: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let frame = 0;
  const ensureBox = () => {
    if (box) return;
    box = document.createElement("div");
    box.className = "deck-edit-outline";
    box.setAttribute("aria-hidden", "true");
    box.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;border-radius:4px;display:none";
    label = document.createElement("div");
    label.style.cssText =
      "position:absolute;left:-2px;padding:2px 6px;border-radius:4px;color:#fff;font:600 11px/1.4 system-ui,sans-serif;white-space:nowrap";
    box.append(label);
    document.body.append(box);
  };
  const place = () => {
    frame = 0;
    const el = editing?.el ?? hovered;
    if (!box || !label || !el || !el.isConnected) {
      if (box) box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 3;
    Object.assign(box.style, {
      display: "block",
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const editable = el.hasAttribute("data-deck-edit");
    const colour = editing || editable ? ACCENT : MUTED;
    box.style.border = `2px ${editing || editable ? "solid" : "dashed"} ${colour}`;
    label.style.background = colour;
    const mod = IS_MAC ? "⌘" : "Ctrl+";
    label.textContent = editing
      ? `Enter saves · Esc cancels${editing.multiline ? " · Shift+Enter: new line" : ""}${marksOn ? ` · ${mod}B bold · ${mod}I italic · ${mod}K link` : ""}`
      : editable
        ? "Double-click to edit"
        : "Edit in source";
    // Above the element, or inside its top edge when there is no room above.
    label.style.top = r.top < 24 ? "2px" : "-22px";
    // Follow the element while it moves (a transition, the fit settling, a scroll).
    frame = requestAnimationFrame(place);
  };
  const redraw = () => {
    ensureBox();
    if (frame) cancelAnimationFrame(frame);
    place();
  };

  const style = document.createElement("style");
  style.textContent = `:root[data-deck-edit-mode] ${PRESENT} [data-deck-edit] { cursor: text; }
:root[data-deck-edit-mode] ${PRESENT} [data-deck-editing] { outline: none; caret-color: ${ACCENT}; }`;

  const inSlide = (target: EventTarget | null): HTMLElement | null => {
    const t = target as Element | null;
    const slide = t?.closest?.(PRESENT);
    if (!slide) return null;
    const el = t!.closest<HTMLElement>("[data-deck-at]");
    return el && slide.contains(el) ? el : (slide as HTMLElement);
  };

  // ─── located: where a click is in the source ───
  const locate = (el: HTMLElement, x: number, y: number) => {
    const file = el.getAttribute("data-deck-file");
    const at = el.getAttribute("data-deck-at");
    let offset: number | null = null;
    let where = file;
    if (file !== null && at !== null) {
      offset = Number(at);
      // On editable text, the very character clicked: the editor's cursor lands under the mouse.
      const range = el.getAttribute("data-deck-edit")?.split("-").map(Number);
      const text = textOf(file);
      const caret = caretAt(x, y);
      if (range && text !== undefined && caret && caret.node.parentNode === el) {
        const shown = caret.node.nodeType === 3 ? caret.offset : 0;
        // Walk the source run, skipping the `\r`s a CRLF file has and the screen does not.
        let i = range[0]!;
        for (let n = 0; n < shown && i < range[1]!; i++) if (text[i] !== "\r") n++;
        offset = i;
      }
    } else {
      const slide = options.slideSource();
      if (!slide) return;
      where = slide.file;
      const text = textOf(slide.file);
      offset = text === undefined ? null : (lineStarts(text)[slide.line - 1] ?? 0);
    }
    const text = where === null ? undefined : textOf(where);
    if (where === null || offset === null || text === undefined) return;
    options.post({ kadal: 1, type: "located", file: where, ...lineColumn(text, offset), offset });
  };

  // ─── editing one element ───
  const finish = () => {
    if (!editing) return;
    closeLink();
    const e = editing;
    editing = null;
    e.off();
    e.el.removeAttribute("contenteditable");
    e.el.removeAttribute("data-deck-editing");
    if (document.activeElement === e.el) e.el.blur();
    redraw();
  };
  const cancel = () => {
    const e = editing;
    if (!e) return;
    finish();
    e.restore();
  };
  const commit = () => {
    const e = editing;
    if (!e) return;
    const shown = e.before.replace(/\r\n/g, "\n");
    const t = typed(e.el);
    const cleaned = extractMarks(cleanTyped(t.raw, e.multiline), t.kinds);
    let after = cleaned.text;
    const marks: EditMark[] = cleaned.marks;
    finish();
    if (!after || (after === shown && !marks.length)) {
      e.restore();
      return;
    }
    // Line breaks spelled as the file spells them.
    if (e.before.includes("\r\n") || textOf(e.file)?.includes("\r\n"))
      after = after.replace(/\n/g, "\r\n");
    options.post({
      kadal: 1,
      type: "edited",
      file: e.file,
      from: e.from,
      to: e.to,
      before: e.before,
      after,
      ...(marks.length ? { marks } : {}),
    });
    if (pending) clearTimeout(pending.timer);
    pending = {
      restore: e.restore,
      timer: setTimeout(() => {
        pending?.restore();
        pending = null;
      }, RESTORE_MS),
    };
  };

  const start = (el: HTMLElement, x: number, y: number): boolean => {
    const file = el.getAttribute("data-deck-file");
    const [from, to] = (el.getAttribute("data-deck-edit") ?? "").split("-").map(Number);
    const text = file === null ? undefined : textOf(file);
    if (file === null || text === undefined || !Number.isFinite(from) || !Number.isFinite(to))
      return false;
    const before = text.slice(from, to);
    // The element must still show exactly that text (a component may have changed it).
    if (el.textContent !== before.replace(/\r\n/g, "\n")) return false;
    const multiline = MULTILINE.has(el.tagName.toLowerCase());
    const restore = snapshot(el);
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      /* not supported here: plain "true", with the paste and format guards below */
    }
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.setAttribute("data-deck-editing", "");

    // Focus moving to the link field is not leaving the element.
    const onBlur = () => {
      if (!linking) commit();
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const raw = e.clipboardData?.getData("text/plain") ?? "";
      const clean = multiline
        ? raw.replace(/\r\n?/g, "\n").replace(/\n\s*\n/g, "\n")
        : raw.replace(/\s*[\r\n]+\s*/g, " ");
      document.execCommand("insertText", false, clean);
    };
    const onBeforeInput = (e: InputEvent) => {
      const t = e.inputType;
      if (
        t === "insertParagraph" ||
        (t === "insertLineBreak" && !multiline) ||
        t.startsWith("format") ||
        t === "insertFromDrop"
      )
        e.preventDefault();
    };
    const onDrop = (e: DragEvent) => e.preventDefault();
    el.addEventListener("blur", onBlur);
    el.addEventListener("paste", onPaste);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("drop", onDrop);
    editing = {
      el,
      file,
      from: from!,
      to: to!,
      before,
      multiline,
      restore,
      undo: [],
      off: () => {
        el.removeEventListener("blur", onBlur);
        el.removeEventListener("paste", onPaste);
        el.removeEventListener("beforeinput", onBeforeInput);
        el.removeEventListener("drop", onDrop);
      },
    };
    el.focus({ preventScroll: true });
    // The caret where the double-click was, not at the start.
    const caret = caretAt(x, y);
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      if (caret && el.contains(caret.node)) {
        r.setStart(caret.node, caret.offset);
        r.collapse(true);
      } else {
        r.selectNodeContents(el);
        r.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(r);
    }
    redraw();
    return true;
  };

  // ─── formatting: Cmd/Ctrl+B, I, K ───
  /** The selection inside the edited element, its spaces left outside, or null. */
  const selected = (): Range | null => {
    const sel = window.getSelection();
    if (!editing || !sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (r.collapsed || !editing.el.contains(r.commonAncestorContainer)) return null;
    return r.toString().trim() ? r : null;
  };
  /** The mark of this kind the selection sits in (this edit's own), to take it off again. */
  const markAround = (r: Range, kind: EditMarkKind): HTMLElement | null => {
    let n: Node | null = r.commonAncestorContainer;
    for (; n && n !== editing?.el; n = n.parentNode)
      if ((n as HTMLElement).getAttribute?.("data-deck-mark") === kind) return n as HTMLElement;
    return null;
  };
  const selectContents = (node: Node) => {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  const toggleMark = (kind: EditMarkKind, href?: string, at?: Range) => {
    const e = editing;
    const r = at ?? selected();
    if (!e || !r) return;
    const existing = markAround(r, kind);
    if (existing && kind !== "link") {
      const first = existing.firstChild;
      const last = existing.lastChild;
      e.undo.push(unwrap(existing));
      const sel = window.getSelection();
      if (sel && first && last) {
        const nr = document.createRange();
        nr.setStartBefore(first);
        nr.setEndAfter(last);
        sel.removeAllRanges();
        sel.addRange(nr);
      }
      return;
    }
    if (existing) {
      // a link again on a link: a new address
      const was = existing.getAttribute("data-deck-href");
      existing.setAttribute("data-deck-href", href!);
      e.undo.push(() => existing.setAttribute("data-deck-href", was ?? ""));
      return;
    }
    const mark = document.createElement(MARK_TAG[kind]);
    mark.setAttribute("data-deck-mark", kind);
    if (kind === "link") {
      mark.setAttribute("data-deck-href", href!);
      mark.style.textDecoration = "underline";
    }
    mark.append(r.extractContents());
    r.insertNode(mark);
    // a mark inside a mark of the same kind says nothing more
    for (const inner of mark.querySelectorAll<HTMLElement>(`[data-deck-mark="${kind}"]`))
      unwrap(inner);
    e.undo.push(() => {
      unwrap(mark);
    });
    selectContents(mark);
  };
  const closeLink = (refocus = false) => {
    const l = linking;
    if (!l) return;
    linking = null;
    l.form.remove();
    if (refocus && editing) {
      editing.el.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(l.range);
    }
  };
  const askLink = () => {
    const r = selected();
    if (!editing || !r || !box) return;
    closeLink();
    const form = document.createElement("form");
    form.className = "deck-edit-link";
    form.style.cssText =
      "position:absolute;left:-2px;top:calc(100% + 6px);display:flex;gap:6px;align-items:center;padding:6px;border-radius:6px;background:#fff;box-shadow:0 4px 16px rgba(15,23,42,.25);pointer-events:auto;font:500 13px/1.4 system-ui,sans-serif;color:#0f172a";
    const input = document.createElement("input");
    input.type = "url";
    input.placeholder = "Paste or type a link";
    input.setAttribute("aria-label", "Link address");
    input.style.cssText =
      "width:260px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:4px;font:inherit;color:inherit;background:#fff;outline-color:" +
      ACCENT;
    const existing = markAround(r, "link");
    input.value = existing?.getAttribute("data-deck-href") ?? "";
    const hint = document.createElement("span");
    hint.textContent = "Enter links · Esc cancels";
    hint.style.cssText = "color:#64748b;white-space:nowrap;font-size:11px";
    form.append(input, hint);
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      applyLink();
    });
    input.addEventListener("blur", () => {
      // clicking away from the field: no link, and the edit is saved as it stands
      setTimeout(() => {
        if (linking?.input !== input) return;
        closeLink();
        if (editing && document.activeElement !== editing.el) commit();
      }, 0);
    });
    box.append(form);
    linking = { range: r.cloneRange(), form, input };
    input.focus({ preventScroll: true });
  };
  const applyLink = () => {
    const l = linking;
    if (!l) return;
    const href = cleanHref(l.input.value);
    closeLink(true);
    if (href) toggleMark("link", href, l.range);
  };

  // ─── the listeners: capture phase on the window, ahead of the deck's ───
  const onKey = (e: KeyboardEvent) => {
    if (!editing) return;
    if (linking && e.target === linking.input) {
      // The link field takes its own keys; Enter and Esc finish it, nothing reaches the deck.
      if (e.type === "keydown" && e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        applyLink();
      } else if (e.type === "keydown" && e.key === "Escape") {
        e.preventDefault();
        closeLink(true);
      }
      e.stopImmediatePropagation();
      return;
    }
    const shortcut = (e.metaKey || e.ctrlKey) && !e.altKey ? e.key.toLowerCase() : "";
    if (e.type === "keydown" && marksOn && ["b", "i", "k"].includes(shortcut) && !e.shiftKey) {
      e.preventDefault();
      if (shortcut === "k") askLink();
      else toggleMark(shortcut === "b" ? "bold" : "italic");
    } else if (e.type === "keydown" && shortcut === "z" && !e.shiftKey && editing.undo.length) {
      e.preventDefault();
      editing.undo.pop()!();
    } else if (e.type === "keydown") {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && !e.isComposing) {
        if (e.shiftKey && editing.multiline) document.execCommand("insertLineBreak");
        else if (!e.shiftKey) commit();
        e.preventDefault();
      }
    }
    // Nothing the person types reaches the deck's shortcuts.
    e.stopImmediatePropagation();
  };
  const onClick = (e: MouseEvent) => {
    if (!armed) return;
    if (editing?.el.contains(e.target as Node)) return;
    const el = inSlide(e.target);
    if (!el) return;
    // A click in edit mode points at the source; it does not follow links or press buttons.
    e.preventDefault();
    e.stopPropagation();
    if (e.detail <= 1) locate(el, e.clientX, e.clientY);
  };
  const onDouble = (e: MouseEvent) => {
    if (!armed || editing) return;
    const el = inSlide(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const editable = el.closest<HTMLElement>("[data-deck-edit]");
    if (editable && start(editable, e.clientX, e.clientY)) return;
    hovered = el;
    redraw();
  };
  const onMove = (e: PointerEvent) => {
    if (!armed || editing) return;
    const el = inSlide(e.target);
    const next = el?.hasAttribute("data-deck-at") ? el : null;
    if (next === hovered) return;
    hovered = next;
    redraw();
  };
  const onLeave = (e: PointerEvent) => {
    if (e.relatedTarget || editing) return;
    hovered = null;
    redraw();
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  window.addEventListener("keypress", onKey, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("dblclick", onDouble, true);
  window.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerout", onLeave, true);

  return {
    arm(on, opts) {
      if (on) marksOn = opts?.marks === true;
      if (on === armed) return;
      armed = on;
      if (on) {
        document.head.append(style);
        document.documentElement.setAttribute("data-deck-edit-mode", "");
      } else {
        commit();
        hovered = null;
        style.remove();
        document.documentElement.removeAttribute("data-deck-edit-mode");
        redraw();
      }
    },
    setSource(text, files) {
      source = { text, files };
    },
    flush() {
      commit();
      if (pending) clearTimeout(pending.timer);
      pending = null;
      hovered = null;
    },
    dispose() {
      if (pending) clearTimeout(pending.timer);
      cancel();
      if (frame) cancelAnimationFrame(frame);
      box?.remove();
      style.remove();
      document.documentElement.removeAttribute("data-deck-edit-mode");
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("keypress", onKey, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("dblclick", onDouble, true);
      window.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerout", onLeave, true);
    },
  };
}
