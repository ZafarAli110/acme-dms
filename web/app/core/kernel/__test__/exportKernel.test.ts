import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../../storage/sessionStore";
import { type ExportJob, ExportKernel, isLinkExpired, isRunning } from "../exportKernel";

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

/** dealership-api: answers each call and records where it was sent for, and with which idempotency key. */
function fakeService() {
  const calls: { method: string; url: string; location: string | null; key: string | null }[] = [];
  const behaviour = {
    /** How the events stream answers: open until stopped, ended at once with no final state, or gone. */
    events: "open" as "open" | "ends" | "gone" | "drops",
    /** For `drops`: how many streams send one running state and then drop, before one sends the finished state. */
    drops: 0,
    /** What a read of the export returns. */
    job: running,
    /** POSTs that never reach the service, before one does. */
    unreachablePosts: 0,
    /** Whether a cancel (DELETE) never reaches the service. */
    cancelFails: false,
  };
  const handler = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({
      method,
      url: String(url),
      location: headers.get("x-location-id"),
      key: headers.get("idempotency-key"),
    });
    if (method === "POST" && behaviour.unreachablePosts > 0) {
      behaviour.unreachablePosts--;
      throw new TypeError("Failed to fetch");
    }
    if (String(url).endsWith("/events")) {
      if (behaviour.events === "gone") {
        return Response.json(
          {
            type: "urn:acme:error:not-found",
            title: "Not Found",
            status: 404,
            detail: "",
            instance: "",
            timestamp: "",
          },
          { status: 404, headers: { "content-type": "application/problem+json" } },
        );
      }
      if (behaviour.events === "drops") {
        const job = behaviour.drops-- > 0 ? running : { ...running, status: "completed" as const };
        return new Response(`data: ${JSON.stringify(job)}\n\n`, { headers: { "content-type": "text/event-stream" } });
      }
      const body = behaviour.events === "ends" ? "" : new ReadableStream();
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    if (method === "DELETE") {
      if (behaviour.cancelFails) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(null, { status: 204 });
    }
    return Response.json(method === "POST" ? running : behaviour.job);
  };
  return { calls, behaviour, handler };
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

  // The state sweep's F11: dismissing a running export took the card off at once, whether the cancel worked or not.
  it("keeps a running export's card, with the problem, when its cancel never reached the service", async () => {
    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});
    service.behaviour.cancelFails = true;

    kernel.dismiss("job-1");
    await vi.waitFor(() => expect(kernel.getSnapshot()[0]?.problem).toBeTruthy());

    expect(kernel.getSnapshot().map((entry) => entry.job.id)).toEqual(["job-1"]);
  });

  it("takes a running export's card off once the service took its cancel", async () => {
    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});

    kernel.dismiss("job-1");
    await vi.waitFor(() => expect(kernel.getSnapshot()).toEqual([]));

    expect(service.calls.some((call) => call.method === "DELETE")).toBe(true);
  });

  it("forgets every card, and stops following, when the sign-in ends or changes", async () => {
    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});

    kernel.reset();

    expect(kernel.getSnapshot()).toEqual([]);
  });

  it("reads the state and follows again when the events stop without a final state", async () => {
    service.behaviour.events = "ends";
    service.behaviour.job = { ...running, status: "completed", rows: 100 };

    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});
    await vi.waitFor(() => expect(kernel.getSnapshot()[0]?.job.status).toBe("completed"), { timeout: 3000 });

    expect(kernel.getSnapshot()[0]?.connection).toBe("following");
  });

  it("marks an export the service no longer has as lost: no longer running", async () => {
    service.behaviour.events = "gone";

    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});
    await vi.waitFor(() => expect(kernel.getSnapshot()[0]?.connection).toBe("lost"));

    expect(isRunning(kernel.getSnapshot()[0]!)).toBe(false);
  });

  it("sends a start that never reached the service again, with the same key, so it makes one export", async () => {
    service.behaviour.unreachablePosts = 1;

    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});

    const posts = service.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0]?.key).toBeTruthy();
    expect(posts[1]?.key).toBe(posts[0]?.key);
  });

  it("does not stall a long export whose stream drops now and then: each time events came, the count starts again", async () => {
    service.behaviour.events = "drops";
    service.behaviour.drops = 6;

    await kernel.startAsync("Customers", "/api/dealership", "v1/customers/exports", {});
    await vi.waitFor(() => expect(kernel.getSnapshot()[0]?.job.status).toBe("completed"), { timeout: 15_000 });

    expect(kernel.getSnapshot()[0]?.connection).toBe("following");
  }, 20_000);

  it("knows when a finished export's link has run out", () => {
    const completed = { ...running, status: "completed" as const, expiresAt: "2026-11-07T10:00:00Z" };

    expect(isLinkExpired(completed, Date.parse("2026-11-07T09:59:59Z"))).toBe(false);
    expect(isLinkExpired(completed, Date.parse("2026-11-07T10:00:00Z"))).toBe(true);
    expect(isLinkExpired(running, Date.parse("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
