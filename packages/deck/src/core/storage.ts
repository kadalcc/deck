/**
 * Per-browser memory that degrades instead of failing.
 *
 * A host may serve a deck sandboxed (`Content-Security-Policy: sandbox` without
 * `allow-same-origin`), and then the page has an opaque origin: `localStorage`, `sessionStorage`,
 * IndexedDB and `document.cookie` all throw a SecurityError on first touch. Private windows and
 * full disks throw too. Everything the deck remembers goes through here, so in any of those cases
 * it lands in a map that lasts as long as the page — a preference set during the talk still holds
 * until the tab closes — and nothing a viewer does can surface a storage error.
 */
export type StorageKind = "local" | "session";

/** Is this page sandboxed into an opaque origin (a host's `Content-Security-Policy: sandbox`)? */
export const opaqueOrigin = () =>
  typeof window !== "undefined" && (globalThis as { origin?: string }).origin === "null";

const memory = new Map<string, string>();

function backing(kind: StorageKind): Storage | null {
  try {
    // The property access itself is what throws in an opaque origin.
    const store = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

export function readItem(key: string, kind: StorageKind = "local"): string | null {
  const store = backing(kind);
  if (store) {
    try {
      const value = store.getItem(key);
      if (value !== null) return value;
    } catch {
      /* fall through to memory */
    }
  }
  return memory.get(`${kind}:${key}`) ?? null;
}

export function writeItem(key: string, value: string, kind: StorageKind = "local"): void {
  memory.set(`${kind}:${key}`, value);
  const store = backing(kind);
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    /* quota, private mode: the memory copy stands */
  }
}

/** Whether what is written now will still be there after a reload. */
export function persists(kind: StorageKind = "local"): boolean {
  const store = backing(kind);
  if (!store) return false;
  try {
    const probe = "deck.storage-probe";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
