import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSettings } from "#settings/settings";
import type { AccessTokenClaims } from "../access-token-claims";
import { OPEN_SIGN_IN_REMEMBERED_MS, SessionStatusChecker } from "../session-status.checker";

const NOW = 1_800_000_000_000;
const claims = (overrides: Partial<AccessTokenClaims> = {}): AccessTokenClaims => ({
  sub: "u",
  sid: "sign-in-1",
  exp: (NOW + 15 * 60_000) / 1000,
  email: "e",
  name: "n",
  dealer_id: "d",
  dealer_name: "D",
  locations: [],
  ...overrides,
});

describe("SessionStatusChecker", () => {
  let identity: ReturnType<typeof vi.fn>;
  let checker: SessionStatusChecker;

  beforeEach(() => {
    identity = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", identity);
    checker = new SessionStatusChecker(readSettings({ "services__identity-api__http__0": "http://identity" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks identity-api with the token, and accepts a sign-in that is open", async () => {
    await expect(checker.isOpenAsync("the-token", claims(), NOW)).resolves.toBe(true);

    expect(identity).toHaveBeenCalledWith("http://identity/v1/sessions/current", {
      headers: { authorization: "Bearer the-token" },
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it("asks again only after ten seconds, so a sign-out reaches this service within them", async () => {
    await checker.isOpenAsync("t", claims(), NOW);
    await checker.isOpenAsync("t", claims(), NOW + OPEN_SIGN_IN_REMEMBERED_MS - 1);
    expect(identity).toHaveBeenCalledTimes(1);

    await checker.isOpenAsync("t", claims(), NOW + OPEN_SIGN_IN_REMEMBERED_MS + 1);
    expect(identity).toHaveBeenCalledTimes(2);
  });

  it("refuses a sign-in that was ended, and does not ask again while its token could be shown", async () => {
    identity.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(checker.isOpenAsync("t", claims(), NOW)).resolves.toBe(false);
    await expect(checker.isOpenAsync("t", claims(), NOW + 10 * 60_000)).resolves.toBe(false);

    expect(identity).toHaveBeenCalledTimes(1);
  });

  it("accepts the token when identity-api cannot be reached, and asks again after the same ten seconds", async () => {
    identity.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(checker.isOpenAsync("t", claims(), NOW)).resolves.toBe(true);
    await expect(checker.isOpenAsync("t", claims(), NOW + 1)).resolves.toBe(true);
    expect(identity).toHaveBeenCalledTimes(1);

    await checker.isOpenAsync("t", claims(), NOW + OPEN_SIGN_IN_REMEMBERED_MS + 1);
    expect(identity).toHaveBeenCalledTimes(2);
  });

  it("accepts a token that has no sign-in id (issued before sign-ins had one) without asking", async () => {
    await expect(checker.isOpenAsync("t", claims({ sid: undefined }), NOW)).resolves.toBe(true);

    expect(identity).not.toHaveBeenCalled();
  });

  it("asks again once an ended sign-in's token could no longer be shown", async () => {
    identity.mockImplementation(async () => new Response(null, { status: 401 }));

    await checker.isOpenAsync("t", claims(), NOW);
    await checker.isOpenAsync("t", claims(), NOW + 16 * 60_000);

    expect(identity).toHaveBeenCalledTimes(2);
  });

  it("accepts the token when identity-api answers with an error of its own (not 401): it is failing, not ending sign-ins", async () => {
    for (const status of [500, 403, 503]) {
      identity.mockImplementationOnce(async () => new Response(null, { status }));
      await expect(
        new SessionStatusChecker(readSettings({ "services__identity-api__http__0": "http://identity" })).isOpenAsync(
          "t",
          claims(),
          NOW,
        ),
      ).resolves.toBe(true);
    }
  });

  it("shares one question among requests that find nothing remembered at the same moment", async () => {
    let release: () => void = () => undefined;
    identity.mockImplementation(
      () => new Promise<Response>((resolve) => (release = () => resolve(new Response(null, { status: 204 })))),
    );

    const together = [1, 2, 3, 4, 5].map(() => checker.isOpenAsync("t", claims(), NOW));
    release();

    await expect(Promise.all(together)).resolves.toEqual([true, true, true, true, true]);
    expect(identity).toHaveBeenCalledTimes(1);
  });

  it("remembers a bounded number of sign-ins", async () => {
    for (let index = 0; index < 10_050; index += 1) {
      await checker.isOpenAsync("t", claims({ sid: `sign-in-${index}` }), NOW);
    }

    const remembered = (checker as unknown as { _remembered: Map<string, unknown> })._remembered;
    expect(remembered.size).toBeLessThanOrEqual(10_000);
    // The newest are kept: asking about the last one again is answered from memory.
    identity.mockClear();
    await checker.isOpenAsync("t", claims({ sid: "sign-in-10049" }), NOW + 1);
    expect(identity).not.toHaveBeenCalled();
  });
});
