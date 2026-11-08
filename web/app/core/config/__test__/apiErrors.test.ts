import { describe, expect, it } from "vitest";
import { i18n } from "../../../i18n";
import { ApiError, isBusyError, PROBLEM_TYPE, problemErrorMessage, RequestTimeoutError } from "../apiErrors";

const problem = (type: string, status: number) =>
  new ApiError({
    type,
    title: "Service Unavailable",
    status,
    detail: "The service's own words.",
    instance: null,
    location: null,
    userId: null,
    traceId: null,
    timestamp: "2026-11-09T09:00:00.000Z",
  });

describe("isBusyError", () => {
  it("knows busy by its type", () => {
    expect(isBusyError(problem(PROBLEM_TYPE.busy, 503))).toBe(true);
  });

  it("does not take a database that is down for busy, though both are 503", () => {
    expect(isBusyError(problem(PROBLEM_TYPE.serviceUnavailable, 503))).toBe(false);
  });

  it("does not take no answer or a timeout for busy", () => {
    expect(isBusyError(new RequestTimeoutError())).toBe(false);
    expect(isBusyError(null)).toBe(false);
  });
});

describe("problemErrorMessage", () => {
  it("tells a busy save that nothing was saved and the changes are still there", () => {
    expect(problemErrorMessage(problem(PROBLEM_TYPE.busy, 503), "fallback")).toBe(i18n.t("errors.busySave"));
    expect(i18n.t("errors.busySave")).toBe(
      "The system is busy and nothing was saved. Your changes are still here: try again in a moment.",
    );
  });

  it("keeps the service's detail for every other problem", () => {
    expect(problemErrorMessage(problem(PROBLEM_TYPE.serviceUnavailable, 503), "fallback")).toBe(
      "The service's own words.",
    );
  });
});
