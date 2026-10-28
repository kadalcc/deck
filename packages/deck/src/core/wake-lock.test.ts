import { describe, expect, test } from "bun:test";

import { requestWakeLock, wakeLockAllowed } from "./wake-lock.ts";

const policy = (allowed: boolean) => ({
  allowsFeature: (f: string) => f !== "screen-wake-lock" || allowed,
});
const lock = { release: async () => {} };

describe("the screen wake lock", () => {
  test("a frame whose policy forbids it never asks (the builder's preview)", async () => {
    let asked = 0;
    const nav = { wakeLock: { request: async () => (asked++, lock) } };
    expect(wakeLockAllowed({ featurePolicy: policy(false) })).toBe(false);
    expect(await requestWakeLock({ featurePolicy: policy(false) }, nav)).toBeNull();
    expect(await requestWakeLock({ permissionsPolicy: policy(false) }, nav)).toBeNull();
    expect(asked).toBe(0);
  });
  test("a page that may, asks; one that cannot say is let through", async () => {
    const nav = { wakeLock: { request: async () => lock } };
    expect(await requestWakeLock({ featurePolicy: policy(true) }, nav)).toBe(lock);
    expect(await requestWakeLock({}, nav)).toBe(lock);
    expect(wakeLockAllowed(undefined)).toBe(true);
  });
  test("no API, or a refusal, is null and never a throw", async () => {
    expect(await requestWakeLock({}, {})).toBeNull();
    const refusing = { wakeLock: { request: () => Promise.reject(new Error("NotAllowedError")) } };
    expect(await requestWakeLock({}, refusing)).toBeNull();
    const broken = {
      featurePolicy: {
        allowsFeature: (): boolean => {
          throw new Error("x");
        },
      },
    };
    expect(wakeLockAllowed(broken)).toBe(true);
  });
});
