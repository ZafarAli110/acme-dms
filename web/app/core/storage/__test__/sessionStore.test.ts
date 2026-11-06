import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../sessionStore";

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

describe("session", () => {
  let local: FakeStorage;
  let tab: FakeStorage;

  beforeEach(() => {
    local = new FakeStorage();
    tab = new FakeStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: tab });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    session.clear();
  });

  it("knows whether this tab is signed in, keeps nothing of it in storage, and forgets it on clear", () => {
    session.setSignedIn(true);

    expect(session.isSignedIn()).toBe(true);
    expect([
      ...Array.from({ length: local.length }, (_, i) => local.key(i)),
      ...Array.from({ length: tab.length }, (_, i) => tab.key(i)),
    ]).toEqual([]);
    session.clear();
    expect(session.isSignedIn()).toBe(false);
  });

  it("keeps the selected location in this tab only, and forgets it on clear", () => {
    session.setLocationId("riverside");

    expect(tab.getItem("acme.locationId")).toBe("riverside");
    expect(local.length).toBe(0);
    session.clear();
    expect(session.getLocationId()).toBeNull();
  });

  it("remembers a sign-out the service did not get, for the next tab, until it is ended", () => {
    expect(session.isRevokePending()).toBe(false);

    session.setRevokePending(true);
    expect(session.isRevokePending()).toBe(true);
    expect(local.getItem("acme.revokePending")).not.toBeNull();

    session.setRevokePending(false);
    expect(session.isRevokePending()).toBe(false);
  });

  it("does not fail when storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("blocked");
      },
      sessionStorage: tab,
    });

    expect(session.isRevokePending()).toBe(false);
    expect(() => session.setRevokePending(true)).not.toThrow();
  });
});
