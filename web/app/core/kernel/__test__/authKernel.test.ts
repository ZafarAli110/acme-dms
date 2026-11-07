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

describe("AuthKernel", () => {
  let replace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replace = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: new FakeStorage(),
      localStorage: new FakeStorage(),
      location: { replace },
    });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).endsWith("/users/me") ? Response.json(rita) : new Response(null, { status: 204 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A tab signed in as Rita, working at Northside. */
  async function ritasTabAsync(): Promise<AuthKernel> {
    const kernel = new AuthKernel();
    await kernel.waitForResolvedAuthAsync();
    session.setLocationId("northside");
    return kernel;
  }

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
});
