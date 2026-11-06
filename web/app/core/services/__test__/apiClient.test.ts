import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../config/apiErrors";
import { session } from "../../storage/sessionStore";
import { apiClient } from "../apiClient";
import { sessionExpiry } from "../sessionExpiry";

class FakeStorage implements Storage {
  private readonly _items = new Map<string, string>();
  public get length(): number {
    return this._items.size;
  }
  public clear(): void {
    this._items.clear();
  }
  public getItem(key: string): string | null {
    return this._items.get(key) ?? null;
  }
  public key(index: number): string | null {
    return [...this._items.keys()][index] ?? null;
  }
  public removeItem(key: string): void {
    this._items.delete(key);
  }
  public setItem(key: string, value: string): void {
    this._items.set(key, value);
  }
}

const problem = (status: number) =>
  new Response(
    JSON.stringify({
      type: "urn:acme:error:unauthorized",
      title: "Unauthorized",
      status,
      detail: "no",
      instance: "/",
      timestamp: "",
    }),
    { status, headers: { "content-type": "application/problem+json" } },
  );
const json = (body: unknown) => Response.json(body);

/** A service that accepts one access token at a time and trades the refresh cookie (the browser sends it) for the next. */
function fakeService(options: { refreshAnswer: () => Response | Promise<Response> }) {
  let valid = "token-1";
  const calls: { url: string; authorization: string | null; fromThePage: string | null }[] = [];
  const handler = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const address = String(url);
    const headers = new Headers(init?.headers);
    calls.push({
      url: address,
      authorization: headers.get("authorization"),
      fromThePage: headers.get("x-requested-with"),
    });
    if (address.endsWith("/v1/tokens/revoke")) {
      return new Response(null, { status: 204 });
    }
    if (address.endsWith("/v1/tokens/refresh")) {
      const answer = await options.refreshAnswer();
      if (answer.ok) {
        valid = "token-2";
        return json({ accessToken: "token-2", tokenType: "Bearer", expiresIn: 900 });
      }
      return answer;
    }
    return headers.get("authorization") === `Bearer ${valid}` ? json({ ok: true }) : problem(401);
  };
  return { handler, calls, expireAccessToken: () => (valid = "token-rotated-away") };
}

describe("ApiClient and an expired access token", () => {
  let expired: number;

  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: new FakeStorage() });
    session.setToken("token-1");
    expired = 0;
    sessionExpiry.onExpired(() => {
      expired += 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionExpiry.onExpired(() => undefined);
  });

  it("trades the refresh token for a new access token and sends the request again", async () => {
    const service = fakeService({ refreshAnswer: () => json({}) });
    service.expireAccessToken();
    vi.stubGlobal("fetch", vi.fn(service.handler));

    await expect(apiClient.getAsync("/api/dealership/v1/customers")).resolves.toEqual({ ok: true });

    expect(service.calls.map((call) => call.authorization)).toEqual(["Bearer token-1", null, "Bearer token-2"]);
    // The refresh is the page's own request (a header a form on another site cannot add), and carries no token.
    expect(service.calls[1]).toMatchObject({ url: "/api/identity/v1/tokens/refresh", fromThePage: "acme-web" });
    expect(session.getToken()).toBe("token-2");
    expect(expired).toBe(0);
  });

  it("refreshes once for requests that found the token expired together", async () => {
    const service = fakeService({ refreshAnswer: () => json({}) });
    service.expireAccessToken();
    vi.stubGlobal("fetch", vi.fn(service.handler));

    const answers = await Promise.all([
      apiClient.getAsync("/api/dealership/v1/customers"),
      apiClient.getAsync("/api/dealership/v1/parts"),
      apiClient.getAsync("/api/dealership/v1/stock"),
    ]);

    expect(answers).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(service.calls.filter((call) => call.url.endsWith("/v1/tokens/refresh"))).toHaveLength(1);
  });

  it("ends the sign-in when the service refuses the refresh cookie, and the caller gets its 401", async () => {
    const service = fakeService({ refreshAnswer: () => problem(401) });
    service.expireAccessToken();
    vi.stubGlobal("fetch", vi.fn(service.handler));

    const error = await apiClient.getAsync("/api/dealership/v1/customers").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.status).toBe(401);
    expect(expired).toBe(1);
  });

  it("keeps the sign-in when the service cannot be reached to refresh", async () => {
    const service = fakeService({ refreshAnswer: () => Promise.reject(new TypeError("offline")) });
    service.expireAccessToken();
    vi.stubGlobal("fetch", vi.fn(service.handler));

    const error = await apiClient.getAsync("/api/dealership/v1/customers").catch((caught: unknown) => caught);

    expect((error as ApiError).problem.status).toBe(401);
    expect(expired).toBe(0);
    expect(session.getToken()).toBe("token-1");
  });

  it("does not refresh without an access token, or for the token endpoints' own 401 (a wrong password)", async () => {
    const service = fakeService({ refreshAnswer: () => json({}) });
    vi.stubGlobal("fetch", vi.fn(service.handler));
    service.expireAccessToken();

    await expect(apiClient.postAsync("/api/identity/v1/tokens", { email: "a", password: "b" })).rejects.toBeInstanceOf(
      ApiError,
    );
    session.clear();
    await expect(apiClient.getAsync("/api/dealership/v1/customers")).rejects.toBeInstanceOf(ApiError);

    expect(service.calls.some((call) => call.url.endsWith("/v1/tokens/refresh"))).toBe(false);
  });

  it("gets a new tab or a reload its first access token from the cookie: true when there is a sign-in, false when not", async () => {
    session.clear();
    const signedIn = fakeService({ refreshAnswer: () => json({}) });
    vi.stubGlobal("fetch", vi.fn(signedIn.handler));
    await expect(apiClient.refreshAccessTokenAsync()).resolves.toBe(true);
    expect(session.getToken()).toBe("token-2");

    session.clear();
    const signedOut = fakeService({ refreshAnswer: () => problem(401) });
    vi.stubGlobal("fetch", vi.fn(signedOut.handler));
    await expect(apiClient.refreshAccessTokenAsync()).resolves.toBe(false);
    expect(session.getToken()).toBeNull();

    const down = fakeService({ refreshAnswer: () => new Response(null, { status: 503 }) });
    vi.stubGlobal("fetch", vi.fn(down.handler));
    await expect(apiClient.refreshAccessTokenAsync()).rejects.toThrow();
  });

  it("signs out on the service as the page: true when it answered, false when it could not be reached", async () => {
    const service = fakeService({ refreshAnswer: () => json({}) });
    const fetchMock = vi.fn(service.handler);
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.revokeSignInAsync()).resolves.toBe(true);
    expect(service.calls[0]).toMatchObject({
      url: "/api/identity/v1/tokens/revoke",
      authorization: null,
      fromThePage: "acme-web",
    });

    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(apiClient.revokeSignInAsync()).resolves.toBe(false);
  });
});
