import { describe, expect, it } from "vitest";
import type { IGetHealthQueryHandler } from "#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface";
import type { IGetUserContextQueryHandler } from "#business-logic-abstractions/handlers/system/get-user-context/get-user-context.query-handler.interface";
import { SystemController } from "../system.controller";

const fails = (): Promise<never> => Promise.reject(new Error("the database is down"));

describe("SystemController", () => {
  // ACME-121: liveness never touches the database, so a database outage never restarts every copy at once.
  it("answers alive without asking the health check or the database anything", () => {
    const health: IGetHealthQueryHandler = { executeAsync: fails };
    const userContext: IGetUserContextQueryHandler = { executeAsync: fails };

    expect(new SystemController(health, userContext).findAlive()).toEqual({
      service: "dealership-api",
      status: "alive",
    });
  });
});
