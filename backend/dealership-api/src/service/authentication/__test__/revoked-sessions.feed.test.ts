import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSettings } from "#settings/settings";
import { ASK_EVERY_MS, REMEMBER_FOR_MS, RevokedSessionsFeed } from "../revoked-sessions.feed";

const NOW = Date.parse("2026-11-07T10:00:00Z");

describe("RevokedSessionsFeed", () => {
  let revoked: string[];
  let down: boolean;
  let questions: string[];
  let clock: number;
  let feed: RevokedSessionsFeed;

  beforeEach(() => {
    revoked = [];
    down = false;
    questions = [];
    clock = NOW;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (down) {
          throw new TypeError("fetch failed");
        }
        questions.push(new URL(url).searchParams.get("since") ?? "");
        return Response.json({ now: new Date(clock).toISOString(), revoked });
      }),
    );
    feed = new RevokedSessionsFeed(readSettings({ "services__identity-api__http__0": "http://identity" }));
  });

  afterEach(() => {
    feed.onModuleDestroy();
    vi.unstubAllGlobals();
  });

  it("refuses a sign-in identity-api listed as ended, and no other", async () => {
    revoked = ["ended-1"];

    await feed.refreshAsync(clock);

    expect(feed.isEnded("ended-1")).toBe(true);
    expect(feed.isEnded("open-1")).toBe(false);
  });

  it("looks up in memory: a request never waits for identity-api", async () => {
    await feed.refreshAsync(clock);
    const asked = questions.length;

    for (let index = 0; index < 100; index += 1) {
      feed.isEnded(`sign-in-${index}`);
    }

    expect(questions.length).toBe(asked);
  });

  it("first looks back as far as an access token can live, then starts a little before the last answer", async () => {
    await feed.refreshAsync(clock);
    clock = NOW + ASK_EVERY_MS;
    await feed.refreshAsync(clock);

    expect(questions[0]).toBe(new Date(NOW - REMEMBER_FOR_MS).toISOString());
    expect(questions[1]).toBe(new Date(NOW - 2_000).toISOString());
  });

  it("keeps what it knows when identity-api cannot be reached, and refuses no one it did not list", async () => {
    revoked = ["ended-1"];
    await feed.refreshAsync(clock);

    down = true;
    await feed.refreshAsync(NOW + ASK_EVERY_MS);

    expect(feed.isEnded("ended-1")).toBe(true);
    expect(feed.isEnded("open-1")).toBe(false);
  });

  it("keeps what it knows when identity-api answers with an error", async () => {
    revoked = ["ended-1"];
    await feed.refreshAsync(clock);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await feed.refreshAsync(NOW + ASK_EVERY_MS);

    expect(feed.isEnded("ended-1")).toBe(true);
  });

  it("forgets an ended sign-in once its access token could no longer be shown", async () => {
    revoked = ["ended-1"];
    await feed.refreshAsync(clock);
    revoked = [];

    await feed.refreshAsync(NOW + REMEMBER_FOR_MS - 1_000);
    expect(feed.isEnded("ended-1")).toBe(true);

    await feed.refreshAsync(NOW + REMEMBER_FOR_MS + 1_000);
    expect(feed.isEnded("ended-1")).toBe(false);
  });

  it("asks once before the service takes requests, then every few seconds", async () => {
    vi.useFakeTimers();
    try {
      await feed.onModuleInit();
      expect(questions).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(ASK_EVERY_MS * 3);

      expect(questions.length).toBeGreaterThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
