/** A held screen wake lock. */
export interface WakeLock {
  release(): Promise<void>;
}

interface PolicyDoc {
  permissionsPolicy?: { allowsFeature(feature: string): boolean };
  featurePolicy?: { allowsFeature(feature: string): boolean };
}

/**
 * Whether this document may ask for a screen wake lock. A frame without
 * `allow="screen-wake-lock"` (a builder's `?preview`, a deck embedded in a page) may not, and
 * asking anyway costs a "Permissions policy violation" in the console on every load, which no
 * `catch` silences. A browser that cannot say is let through, and a refusal there is caught.
 */
export function wakeLockAllowed(doc: PolicyDoc | undefined): boolean {
  const policy = doc?.permissionsPolicy ?? doc?.featurePolicy;
  if (!policy) return true;
  try {
    return policy.allowsFeature("screen-wake-lock");
  } catch {
    return true;
  }
}

/** Keep the screen awake if this document may, else null; never throws. */
export async function requestWakeLock(
  doc: PolicyDoc | undefined = typeof document === "undefined"
    ? undefined
    : (document as PolicyDoc),
  nav: unknown = typeof navigator === "undefined" ? undefined : navigator,
): Promise<WakeLock | null> {
  if (!wakeLockAllowed(doc)) return null;
  const api = (nav as { wakeLock?: { request(type: "screen"): Promise<WakeLock> } } | undefined)
    ?.wakeLock;
  if (!api) return null;
  try {
    return await api.request("screen");
  } catch {
    return null;
  }
}
