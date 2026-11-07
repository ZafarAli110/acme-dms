import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_PAGE } from "../../../../core/paging/listParams";
import { session } from "../../../../core/storage/sessionStore";
import { partQueryOptions } from "../partQueryOptions";

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

describe("partQueryOptions", () => {
  const locationsAsked: (string | null)[] = [];

  beforeEach(() => {
    locationsAsked.length = 0;
    vi.stubGlobal("window", { sessionStorage: new FakeStorage() });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        locationsAsked.push(new Headers(init?.headers).get("x-location-id"));
        return Response.json({ items: [], total: 0 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the location its key names, even when another is selected by the time it runs", async () => {
    // A query of the Northside list refetching just after the user switched to Riverside: its rows must be Northside's,
    // or Riverside's would be cached under Northside's key.
    session.setLocationId("riverside");

    await new QueryClient().fetchQuery(partQueryOptions.list("northside", FIRST_PAGE));

    expect(locationsAsked).toEqual(["northside"]);
  });
});
