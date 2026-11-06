import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { AccessTokenClaims } from "../../authentication/access-token-claims";
import type { AccessTokenVerifier } from "../../authentication/access-token.verifier";
import type { RevokedSessionsFeed } from "../../authentication/revoked-sessions.feed";
import { AuthenticationGuard } from "../authentication.guard";

const claims = (overrides: Partial<AccessTokenClaims> = {}): AccessTokenClaims => ({
  sub: "u",
  sid: "sign-in-1",
  email: "e",
  name: "n",
  dealer_id: "d",
  dealer_name: "D",
  locations: [],
  ...overrides,
});

function guardFor(options: { verified?: AccessTokenClaims | Error; ended?: string[]; isPublic?: boolean }) {
  const verifier = {
    verifyAsync: vi.fn(async () => {
      if (options.verified instanceof Error) {
        throw options.verified;
      }
      return options.verified ?? claims();
    }),
  } as unknown as AccessTokenVerifier;
  const feed = { isEnded: (sid: string) => (options.ended ?? []).includes(sid) } as unknown as RevokedSessionsFeed;
  const reflector = { getAllAndOverride: () => options.isPublic ?? false } as unknown as Reflector;
  const request: { headers: Record<string, string>; accessToken?: AccessTokenClaims; rawAccessToken?: string } = {
    headers: { authorization: "Bearer the-token" },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { guard: new AuthenticationGuard(reflector, verifier, feed), context, request };
}

describe("AuthenticationGuard", () => {
  it("accepts a valid token whose sign-in is open, and hands the claims on", async () => {
    const { guard, context, request } = guardFor({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.accessToken?.sid).toBe("sign-in-1");
    expect(request.rawAccessToken).toBe("the-token");
  });

  it("refuses a valid, unexpired token whose sign-in was ended (signed out)", async () => {
    const { guard, context, request } = guardFor({ ended: ["sign-in-1"] });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.accessToken).toBeUndefined();
  });

  it("refuses a token that has no sign-in id, because it could never be ended", async () => {
    const { guard, context } = guardFor({ verified: claims({ sid: undefined }) });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a token that does not verify, and a request with none", async () => {
    await expect(
      guardFor({ verified: new Error("expired") }).guard.canActivate(
        guardFor({ verified: new Error("expired") }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const { guard, context, request } = guardFor({});
    request.headers = {};
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("lets a public endpoint through without a token", async () => {
    const { guard, context, request } = guardFor({ isPublic: true });
    request.headers = {};

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
