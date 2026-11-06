import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollMemory } from "../scrollMemory";

/** A `sessionStorage` that keeps keys in the order they were first written, as the browser's does. */
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

describe("scrollMemory", () => {
  let store: FakeStorage;

  beforeEach(() => {
    store = new FakeStorage();
    vi.stubGlobal("window", { sessionStorage: store });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives back what was saved for a history entry, and nothing for another", () => {
    scrollMemory.write("abc", 480.4);

    expect(scrollMemory.read("abc")).toBe(480);
    expect(scrollMemory.read("other")).toBeNull();
  });

  it("forgets an entry that is back at the top, and a value that is not a position", () => {
    scrollMemory.write("abc", 300);
    scrollMemory.write("abc", 0);
    store.setItem("gridScroll:bad", "not a number");

    expect(scrollMemory.read("abc")).toBeNull();
    expect(scrollMemory.read("bad")).toBeNull();
  });

  it("keeps the newest 50 entries", () => {
    for (let index = 0; index < 60; index += 1) {
      scrollMemory.write(`k${index}`, index + 1);
    }

    expect(scrollMemory.read("k0")).toBeNull();
    expect(scrollMemory.read("k9")).toBeNull();
    expect(scrollMemory.read("k10")).toBe(11);
    expect(scrollMemory.read("k59")).toBe(60);
  });

  it("does nothing when the storage is blocked", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    });

    expect(() => scrollMemory.write("abc", 100)).not.toThrow();
    expect(scrollMemory.read("abc")).toBeNull();
  });
});
