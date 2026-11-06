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
    store.setItem("acme.gridScroll", JSON.stringify({ bad: { top: "not a number", at: 1 }, worse: 7 }));

    expect(scrollMemory.read("abc")).toBeNull();
    expect(scrollMemory.read("bad")).toBeNull();
    expect(scrollMemory.read("worse")).toBeNull();
    store.setItem("acme.gridScroll", "{not json");
    expect(scrollMemory.read("abc")).toBeNull();
    expect(() => scrollMemory.write("abc", 10)).not.toThrow();
    expect(scrollMemory.read("abc")).toBe(10);
  });

  it("keeps the 50 most recently written entries, not the ones the storage happens to list first", () => {
    for (let index = 0; index < 60; index += 1) {
      scrollMemory.write(`k${index}`, index + 1, 1000 + index);
    }
    // The first entry is written again, so it is the newest: it must survive the next trim.
    scrollMemory.write("k0", 999, 5000);
    scrollMemory.write("k60", 61, 5001);

    expect(scrollMemory.read("k0")).toBe(999);
    expect(scrollMemory.read("k60")).toBe(61);
    expect(scrollMemory.read("k1")).toBeNull();
    expect(scrollMemory.read("k11")).toBeNull();
    expect(scrollMemory.read("k12")).toBe(13);
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
