import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createWebHandler } from "./serve-web";

describe("serve-web", () => {
  const root = mkdtempSync(join(tmpdir(), "acme-web-"));
  const seen: { method: string; path: string; body: string; forwardedProto: string | null }[] = [];
  let gateway: ReturnType<typeof Bun.serve>;
  let handle: (request: Request) => Promise<Response>;

  beforeAll(() => {
    writeFileSync(join(root, "index.html"), "<!doctype html><title>Acme</title>");
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "root-abc123.js"), "console.log('acme')");
    writeFileSync(join(root, "favicon.svg"), "<svg/>");
    // A stand-in gateway that says what reached it.
    gateway = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        seen.push({
          method: request.method,
          path: `${url.pathname}${url.search}`,
          body: await request.text(),
          forwardedProto: request.headers.get("x-forwarded-proto"),
        });
        return Response.json({ ok: true }, { status: 201 });
      },
    });
    handle = createWebHandler(root, `http://localhost:${gateway.port}`);
  });

  afterAll(() => {
    void gateway.stop(true);
  });

  it("sends a hashed asset as it is, cached for a year", async () => {
    const response = await handle(new Request("http://web.test/assets/root-abc123.js"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console.log('acme')");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("revalidates a file that is not hashed", async () => {
    const response = await handle(new Request("http://web.test/favicon.svg"));

    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("answers an app route with index.html, for the app's router to read the URL", async () => {
    const response = await handle(new Request("http://web.test/customers/42"));

    expect(await response.text()).toContain("<title>Acme</title>");
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("never serves a file outside the build", async () => {
    const response = await handle(new Request("http://web.test/%2e%2e/%2e%2e/etc/hosts"));

    expect(await response.text()).toContain("<title>Acme</title>");
  });

  it("passes /api to the gateway with its method, query and body, and gives back its answer", async () => {
    const response = await handle(
      new Request("http://web.test/api/dealership/v1/parts?page=2", { method: "POST", body: '{"a":1}' }),
    );

    expect(response.status).toBe(201);
    expect(seen.at(-1)).toEqual({
      method: "POST",
      path: "/api/dealership/v1/parts?page=2",
      body: '{"a":1}',
      forwardedProto: "http",
    });
  });

  it("tells the gateway the browser's connection was HTTPS, as a load balancer does (ACME-130)", async () => {
    seen.length = 0;
    await handle(new Request("https://localhost/api/session", { method: "GET" }));
    await handle(new Request("http://localhost/api/session", { method: "GET" }));

    expect(seen.map((request) => request.forwardedProto)).toEqual(["https", "http"]);
  });
});
