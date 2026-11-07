import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { ETagInterceptor, ETagWithoutRevalidationInterceptor } from "../etag.interceptor";

/** A GET that already has version 3, and the headers the interceptor sets on its answer. */
function getOfVersion3() {
  const headers = new Map<string, string>();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method: "GET", headers: { "if-none-match": '"3"' } }),
      getResponse: () => ({ setHeader: (name: string, value: string) => headers.set(name, value) }),
    }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of({ id: "part-1", version: 3 }) };
  return { headers, context, next };
}

describe("ETag interceptors", () => {
  it("answers a GET whose copy is current with 304, for a record its version covers", async () => {
    const { context, next } = getOfVersion3();

    await expect(lastValueFrom(new ETagInterceptor().intercept(context, next))).rejects.toThrow();
  });

  it("always answers in full, and lets nothing keep it, for a record that shows more than its version", async () => {
    const { headers, context, next } = getOfVersion3();

    const body = await lastValueFrom(new ETagWithoutRevalidationInterceptor().intercept(context, next));

    expect(body).toEqual({ id: "part-1", version: 3 });
    expect(headers.get("etag")).toBe('"3"');
    expect(headers.has("cache-control")).toBe(false);
  });
});
