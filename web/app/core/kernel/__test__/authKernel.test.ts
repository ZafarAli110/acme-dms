import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../../storage/sessionStore";
import { AuthKernel } from "../authKernel";

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

/** The tabs' shared channel: what another tab posts reaches this one's listeners. */
class FakeBroadcastChannel {
  public static last: FakeBroadcastChannel | null = null;
  public readonly posted: unknown[] = [];
  private readonly _listeners = new Set<(event: MessageEvent) => void>();
  public constructor() {
    FakeBroadcastChannel.last = this;
  }
  public postMessage(data: unknown): void {
    this.posted.push(data);
  }
  public addEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this._listeners.add(listener);
  }
  public removeEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this._listeners.delete(listener);
  }
  /** Another tab posts `data`. */
  public fromOtherTab(data: unknown): void {
    for (const listener of this._listeners) {
      listener({ data } as MessageEvent);
    }
  }
}

const rita = {
  id: "user-rita",
  email: "rita@northwind.test",
  displayName: "Rita",
  locations: [],
  defaultLocationId: null,
};

/** A tab signed in as Rita, working at Northside. */
async function ritasTabAsync(): Promise<AuthKernel> {
  const kernel = new AuthKernel();
  await kernel.waitForResolvedAuthAsync();
  session.setLocationId("northside");
  return kernel;
}

/** The gateway the tab talks to: who is signed in, and what each sign-out does. Every request is recorded. */
class FakeGateway {
  public isSignedIn = true;
  public readonly requests: string[] = [];
  /** How a sign-out is answered: at once, by default. */
  public signOut: () => Promise<Response> = async () => new Response(null, { status: 204 });

  public readonly fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const path = String(url);
    this.requests.push(`${method} ${path}`);
    if (path === "/api/session" && method === "GET") {
      return Response.json({ isSignedIn: this.isSignedIn });
    }
    if (path === "/api/session" && method === "DELETE") {
      return this.signOut();
    }
    if (path.endsWith("/users/me")) {
      return Response.json(rita);
    }
    return new Response(null, { status: 204 });
  };
}

describe("AuthKernel", () => {
  let replace: ReturnType<typeof vi.fn>;
  let gateway: FakeGateway;

  beforeEach(() => {
    replace = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: new FakeStorage(),
      localStorage: new FakeStorage(),
      location: { replace },
    });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    gateway = new FakeGateway();
    vi.stubGlobal("fetch", vi.fn(gateway.fetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes nothing when the same person signs in again in another tab", async () => {
    const kernel = await ritasTabAsync();

    FakeBroadcastChannel.last!.fromOtherTab({ kind: "signed-in", userId: rita.id });

    expect(kernel.getSnapshot()).toMatchObject({ status: "signed-in", user: { id: rita.id } });
    expect(session.getLocationId()).toBe("northside");
    expect(replace).not.toHaveBeenCalled();
  });

  it("starts afresh from the home page when someone else signs in in another tab", async () => {
    await ritasTabAsync();

    FakeBroadcastChannel.last!.fromOtherTab({ kind: "signed-in", userId: "user-tom" });

    expect(session.getLocationId()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("leaves for the sign-in page itself once signed out, and tells the other tabs", async () => {
    const kernel = await ritasTabAsync();

    await kernel.signOutAsync();

    expect(FakeBroadcastChannel.last!.posted).toContainEqual({ kind: "signed-out" });
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  // The state sweep's F2: the same person signing in again in another tab while this tab's sign-out waited was ignored
  // here, so this tab wrote the "sign-out pending" note back, and its next load revoked the new sign-in.
  it("leaves no sign-out pending when the same person signs in again in another tab while it waited", async () => {
    const kernel = await ritasTabAsync();
    let answer: (response: Response) => void = () => undefined;
    gateway.signOut = () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      });

    const signingOut = kernel.signOutAsync();
    await Promise.resolve();
    expect(session.isRevokePending()).toBe(true);
    // The other tab's sign-in clears the shared note, then says who signed in.
    session.setRevokePending(false);
    FakeBroadcastChannel.last!.fromOtherTab({ kind: "signed-in", userId: rita.id });
    answer(new Response(null, { status: 503 }));
    await signingOut;

    expect(session.isRevokePending()).toBe(false);
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("asks the gateway once when Sign out is pressed twice", async () => {
    const kernel = await ritasTabAsync();

    await Promise.all([kernel.signOutAsync(), kernel.signOutAsync()]);

    expect(gateway.requests.filter((request) => request === "DELETE /api/session")).toHaveLength(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("asks the gateway, not a service, whether anyone is signed in: a signed-out visit logs no 401", async () => {
    gateway.isSignedIn = false;
    const kernel = new AuthKernel();

    const auth = await kernel.waitForResolvedAuthAsync();

    expect(auth.status).toBe("signed-out");
    expect(gateway.requests).not.toContain("GET /api/identity/v1/users/me");
    expect(gateway.requests).toContain("DELETE /api/session/cache");
  });

  it("shows the sign-in page at once when a sign-out is still pending, and ends it in the background", async () => {
    const signOutAnswer = Promise.withResolvers<Response>();
    gateway.signOut = () => signOutAnswer.promise;
    session.setRevokePending(true);
    const kernel = new AuthKernel();

    const auth = await kernel.waitForResolvedAuthAsync();

    expect(auth.status).toBe("signed-out");
    expect(gateway.requests).toContain("DELETE /api/session");
    expect(session.isRevokePending()).toBe(true);
    signOutAnswer.resolve(new Response(null, { status: 204 }));
    await vi.waitFor(() => expect(session.isRevokePending()).toBe(false));
  });

  it("signs in only once a sign-out still ending in the background has its answer, so it cannot remove the new cookie", async () => {
    const signOutAnswer = Promise.withResolvers<Response>();
    gateway.signOut = () => signOutAnswer.promise;
    session.setRevokePending(true);
    const kernel = new AuthKernel();
    await kernel.waitForResolvedAuthAsync();

    const signingIn = kernel.signInAsync("rita@northwind.test", "Acme123!");
    await Promise.resolve();
    expect(gateway.requests).not.toContain("POST /api/session");
    signOutAnswer.resolve(new Response(null, { status: 204 }));
    await signingIn;

    expect(gateway.requests.indexOf("POST /api/session")).toBeGreaterThan(
      gateway.requests.indexOf("DELETE /api/session"),
    );
    expect(kernel.getSnapshot()).toMatchObject({ status: "signed-in", user: { id: rita.id } });
  });
});
