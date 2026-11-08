import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ApiError, PROBLEM_TYPE, RequestTimeoutError } from "../../config/apiErrors";
import { isRetryingBusy } from "../busyQueries";
import { retryDelayMs, shouldRetryQuery } from "../queryClient";

const problem = (type: string, status: number) =>
  new ApiError({
    type,
    title: "Problem",
    status,
    detail: null,
    instance: null,
    location: null,
    userId: null,
    traceId: null,
    timestamp: "2026-11-09T09:00:00.000Z",
  });
const busy = problem(PROBLEM_TYPE.busy, 503);

describe("shouldRetryQuery", () => {
  it("tries a busy page again twice, never a third time", () => {
    // TanStack counts the failures so far: 0 after the first answer.
    expect([0, 1, 2].map((failures) => shouldRetryQuery(failures, busy))).toEqual([true, true, false]);
  });

  it("tries no answer, a timeout or a 5xx again once, as before", () => {
    expect([0, 1].map((failures) => shouldRetryQuery(failures, new RequestTimeoutError()))).toEqual([true, false]);
    expect([0, 1].map((failures) => shouldRetryQuery(failures, problem(PROBLEM_TYPE.internal, 500)))).toEqual([
      true,
      false,
    ]);
    expect(shouldRetryQuery(0, problem(PROBLEM_TYPE.serviceUnavailable, 503))).toBe(true);
    expect(shouldRetryQuery(1, problem(PROBLEM_TYPE.serviceUnavailable, 503))).toBe(false);
  });

  it("never tries a 4xx again: the answer will not change", () => {
    expect(shouldRetryQuery(0, problem(PROBLEM_TYPE.validation, 400))).toBe(false);
    expect(shouldRetryQuery(0, problem(PROBLEM_TYPE.conflict, 409))).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("waits a second between busy tries, as the busy answer's Retry-After says", () => {
    expect([0, 1].map((failures) => retryDelayMs(failures, busy))).toEqual([1000, 1000]);
  });

  it("keeps TanStack's own wait for everything else", () => {
    expect([0, 1, 10].map((failures) => retryDelayMs(failures, new RequestTimeoutError()))).toEqual([
      1000, 2000, 30_000,
    ]);
  });
});

describe("isRetryingBusy", () => {
  it("is true only while a query waits to try again after a busy answer", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 20 } } });
    let answers = 0;
    const released = Promise.withResolvers<void>();
    const fetching = client.fetchQuery({
      queryKey: ["customers"],
      queryFn: async () => {
        answers += 1;
        if (answers === 1) {
          throw busy;
        }
        await released.promise;
        return "rows";
      },
    });

    expect(isRetryingBusy(client.getQueryCache().getAll())).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(isRetryingBusy(client.getQueryCache().getAll())).toBe(true);
    released.resolve();
    await fetching;
    expect(isRetryingBusy(client.getQueryCache().getAll())).toBe(false);
  });

  it("is false while a query waits after no answer: that is not busy", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 20 } } });
    let answers = 0;
    const fetching = client.fetchQuery({
      queryKey: ["parts"],
      queryFn: async () => {
        answers += 1;
        if (answers === 1) {
          throw new RequestTimeoutError();
        }
        return "rows";
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(isRetryingBusy(client.getQueryCache().getAll())).toBe(false);
    await fetching;
  });
});
