import { describe, expect, test } from "bun:test";

import { readHostOverride } from "../core/model.ts";
import {
  feedbackEndpoint,
  type FeedbackContext,
  feedbackPayload,
  MAX_SCREENSHOT,
  sendFeedback,
} from "./Feedback.tsx";

const ctx: FeedbackContext = {
  url: "https://deck.kadal.cc/d/abc/presenter#/2",
  deck: { slug: "my-talk", title: "My talk" },
  slide: { index: 2, title: "The middle" },
  engine: "0.7.0",
  userAgent: "test",
};

describe("the host's feedback endpoint", () => {
  const of = (feedback: unknown) => readHostOverride({ __KADAL_DECK__: { feedback } })?.feedback;
  test("an http(s) URL or a same-site path, nothing else", () => {
    expect(of("https://deck.kadal.cc/api/feedback")).toBe("https://deck.kadal.cc/api/feedback");
    expect(of("http://127.0.0.1:5472/feedback")).toBe("http://127.0.0.1:5472/feedback");
    expect(of("/api/feedback")).toBe("/api/feedback");
    expect(of("//evil.test/x")).toBeUndefined();
    expect(of("javascript:alert(1)")).toBeUndefined();
    expect(of("https://")).toBeUndefined();
    expect(of(42)).toBeUndefined();
  });
  test("no host word, no actions", () => {
    expect(feedbackEndpoint({})).toBeNull();
    expect(feedbackEndpoint({ __KADAL_DECK__: { feedback: "/fb" } })).toBe("/fb");
  });
});

describe("the feedback payload", () => {
  test("a bug: trimmed, with its severity and picture, and where the deck is", () => {
    const p = feedbackPayload(
      {
        kind: "bug",
        title: "  Next pane blank  ",
        description: " after two quick Spaces \n",
        severity: "high",
        screenshotDataUrl: "data:image/jpeg;base64,AAAA",
      },
      ctx,
    );
    expect(p).toEqual({
      kind: "bug",
      title: "Next pane blank",
      description: "after two quick Spaces",
      severity: "high",
      screenshotDataUrl: "data:image/jpeg;base64,AAAA",
      ...ctx,
    });
  });

  test("a bug's severity defaults to medium; a bad one is medium too", () => {
    expect(feedbackPayload({ kind: "bug", title: "x", description: "" }, ctx).severity).toBe(
      "medium",
    );
    expect(
      feedbackPayload(
        { kind: "bug", title: "x", description: "", severity: "urgent" as never },
        ctx,
      ).severity,
    ).toBe("medium");
  });

  test("a picture that is not an image data URL, or is too large, is left out", () => {
    const shot = (screenshotDataUrl: string) =>
      feedbackPayload({ kind: "bug", title: "x", description: "", screenshotDataUrl }, ctx)
        .screenshotDataUrl;
    expect(shot("https://example.com/a.png")).toBeUndefined();
    expect(shot(`data:image/png;base64,${"A".repeat(MAX_SCREENSHOT)}`)).toBeUndefined();
  });

  test("a feature request or feedback carries neither severity nor picture", () => {
    for (const kind of ["feature", "feedback"] as const) {
      const p = feedbackPayload(
        {
          kind,
          title: "t",
          description: "d",
          severity: "critical",
          screenshotDataUrl: "data:image/png;base64,AA",
        },
        ctx,
      );
      expect(p.kind).toBe(kind);
      expect("severity" in p).toBe(false);
      expect("screenshotDataUrl" in p).toBe(false);
      expect(p.deck).toEqual(ctx.deck);
      expect(p.slide).toEqual(ctx.slide);
    }
  });
});

describe("sending it", () => {
  const payload = feedbackPayload({ kind: "feedback", title: "Love it", description: "" }, ctx);

  test("POSTs JSON with the ticket and resolves to the host's id", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const send = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({ id: "fb_1" });
    }) as unknown as typeof fetch;
    const r = await sendFeedback("/api/feedback", payload, send, {
      "x-deck-ticket": "t".repeat(20),
    });
    expect(r).toEqual({ id: "fb_1" });
    expect(seen!.url).toBe("/api/feedback");
    expect(seen!.init.method).toBe("POST");
    expect(seen!.init.headers).toEqual({
      "Content-Type": "application/json",
      "x-deck-ticket": "t".repeat(20),
    });
    expect(JSON.parse(String(seen!.init.body))).toEqual(payload);
  });

  test("no ticket, no ticket header", async () => {
    let headers: unknown;
    const send = (async (_: string, init: RequestInit) => {
      headers = init.headers;
      return Response.json({ id: 7 });
    }) as unknown as typeof fetch;
    expect(await sendFeedback("/fb", payload, send, {})).toEqual({ id: "7" });
    expect(headers).toEqual({ "Content-Type": "application/json" });
  });

  test("failures come back as sentences for the dialog", async () => {
    const answer = (r: Response) => (async () => r) as unknown as typeof fetch;
    await expect(
      sendFeedback(
        "/fb",
        payload,
        answer(Response.json({ error: "Too many." }, { status: 429 })),
        {},
      ),
    ).rejects.toThrow("The host answered 429. Too many.");
    await expect(
      sendFeedback("/fb", payload, answer(new Response("", { status: 401 })), {}),
    ).rejects.toThrow("did not accept this presenter sign-in (401)");
    await expect(sendFeedback("/fb", payload, answer(Response.json({})), {})).rejects.toThrow(
      "no reference",
    );
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(sendFeedback("/fb", payload, offline, {})).rejects.toThrow("could not be reached");
  });
});
