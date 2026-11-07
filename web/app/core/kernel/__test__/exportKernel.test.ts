import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../../storage/sessionStore";
import { type ExportJob, ExportKernel } from "../exportKernel";

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

const running: ExportJob = {
  id: "job-1",
  kind: "customers",
  status: "writing",
  rows: 10,
  totalRows: 100,
  rowsPerSecond: null,
  elapsedMs: 0,
  etaMs: null,
  queuePosition: null,
  fileName: "customers.xlsx",
  fileBytes: null,
  downloadPath: null,
  expiresAt: null,
  error: null,
};

/** dealership-api: answers each call and records where it was sent for. */
function fakeService() {
  const calls: { method: string; url: string; location: string | null }[] = [];
  const handler = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), location: new Headers(init?.headers).get("x-location-id") });
    if (String(url).endsWith("/events")) {
      // A stream that stays open until the kernel stops following it.
      return new Response(new ReadableStream(), { headers: { "content-type": "text/event-stream" } });
    }
    return method === "DELETE" ? new Response(null, { status: 204 }) : Response.json(running);
  };
  return { calls, handler };
}

describe("ExportKernel", () => {
  let kernel: ExportKernel;
  let service: ReturnType<typeof fakeService>;

  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: new FakeStorage() });
    service = fakeService();
    vi.stubGlobal("fetch", vi.fn(service.handler));
    session.setLocationId("northside");
    kernel = new ExportKernel();
  });

  afterEach(() => {
    kernel.reset();
    vi.unstubAllGlobals();
  });

  it("follows and cancels an export at the location it was started at, after a switch to another", async () => {
    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});
    session.setLocationId("riverside");

    await kernel.cancelAsync("job-1");

    expect(service.calls.map((call) => [call.method, call.location])).toEqual([
      ["POST", "northside"],
      ["GET", "northside"],
      ["DELETE", "northside"],
    ]);
    expect(kernel.getSnapshot()[0]?.locationId).toBe("northside");
  });

  it("forgets every card, and stops following, when the sign-in ends or changes", async () => {
    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});

    kernel.reset();

    expect(kernel.getSnapshot()).toEqual([]);
  });
});
