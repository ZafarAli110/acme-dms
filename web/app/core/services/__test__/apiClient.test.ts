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

/** The gateway and the services behind it: 401 once the session has ended, otherwise an answer. */
function fakeGateway() {
  let ended = false;
  const calls: { url: string; method: string; authorization: string | null; fromThePage: string | null }[] = [];
  const handler = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
      fromThePage: headers.get("x-requested-with"),
    });
    if (String(url) === "/api/session") {
      return new Response(null, { status: 204 });
    }
    return ended ? problem(401) : json({ ok: true });
  };
  return { handler, calls, end: () => (ended = true) };
}

describe("ApiClient with the gateway's session", () => {
  let expired: number;

  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: new FakeStorage() });
    session.setSignedIn(true);
    expired = 0;
    sessionExpiry.onExpired(() => {
      expired += 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    session.clear();
    sessionExpiry.onExpired(() => undefined);
  });

  it("sends no token, only the page's own header and the location: the browser sends the session cookie", async () => {
    const gateway = fakeGateway();
    vi.stubGlobal("fetch", vi.fn(gateway.handler));
    session.setLocationId("riverside");

    await expect(apiClient.getAsync("/api/dealership/v1/customers")).resolves.toEqual({ ok: true });

    expect(gateway.calls[0]).toMatchObject({ authorization: null, fromThePage: "acme-web" });
  });

  it("ends the sign-in when a signed-in tab gets a 401, and the caller gets its 401", async () => {
    const gateway = fakeGateway();
    gateway.end();
    vi.stubGlobal("fetch", vi.fn(gateway.handler));

    const error = await apiClient.getAsync("/api/dealership/v1/customers").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.status).toBe(401);
    expect(expired).toBe(1);
  });

  it("does not end anything for a 401 before signing in, or for signing in's own 401 (a wrong password)", async () => {
    const gateway = fakeGateway();
    gateway.end();
    vi.stubGlobal("fetch", vi.fn(gateway.handler));

    await expect(apiClient.postAsync("/api/dealership/v1/anything", {}, { anonymous: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    session.clear();
    await expect(apiClient.getAsync("/api/identity/v1/users/me")).rejects.toBeInstanceOf(ApiError);

    expect(expired).toBe(0);
  });

  it("signs out at the gateway as the page: true when it answered, false when it could not be reached", async () => {
    const gateway = fakeGateway();
    const fetchMock = vi.fn(gateway.handler);
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.signOutAsync()).resolves.toBe(true);
    expect(gateway.calls[0]).toMatchObject({ url: "/api/session", method: "DELETE", fromThePage: "acme-web" });

    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(apiClient.signOutAsync()).resolves.toBe(false);
  });
});
