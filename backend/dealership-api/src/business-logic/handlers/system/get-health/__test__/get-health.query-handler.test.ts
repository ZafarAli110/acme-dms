import { describe, expect, it } from "vitest";
import type { IUnitOfWorkFactory } from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { NORTHSIDE } from "#test-setup/postgres/seed-kit";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { GetHealthQueryHandler } from "../get-health.query-handler";

describe("GetHealthQueryHandler", () => {
  const database = useTestDatabase();

  it("reports ok, the service, the product version and a reachable database", async () => {
    await expect(new GetHealthQueryHandler(database.unitOfWorkFactory, fixedClock()).executeAsync()).resolves.toEqual({
      service: "dealership-api",
      status: "ok",
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      databaseReachable: true,
    });
  });

  it("reports degraded when the database does not answer", async () => {
    const unreachable: IUnitOfWorkFactory = { beginAsync: () => Promise.reject(new Error("connection refused")) };

    await expect(new GetHealthQueryHandler(unreachable, fixedClock()).executeAsync()).resolves.toMatchObject({
      status: "degraded",
      databaseReachable: false,
    });
  });

  it("reports degraded when the database takes too long to answer: barely answering is as bad as down", async () => {
    const hanging: IUnitOfWorkFactory = { beginAsync: () => new Promise(() => undefined) };

    await expect(new GetHealthQueryHandler(hanging, fixedClock()).executeAsync()).resolves.toMatchObject({
      status: "degraded",
      databaseReachable: false,
    });
  }, 10_000);

  // Last: the export it queues stays in this file's database.
  it("reports degraded when an export has waited minutes for the worker: background work has stopped", async () => {
    await database.seed.addExportJobAsync({ locationId: NORTHSIDE, createdAt: Temporal.Now.instant() });
    // Started before the seed's time, so an export queued then counts as queued while it ran.
    const health = new GetHealthQueryHandler(
      database.unitOfWorkFactory,
      fixedClock(Temporal.Instant.from("2026-11-01T00:00:00Z")),
    );
    await expect(health.executeAsync()).resolves.toMatchObject({ status: "ok" });

    // Queued days ago (the seed's time) and never taken: no worker is running.
    await database.seed.addExportJobAsync({ locationId: NORTHSIDE });

    await expect(health.executeAsync()).resolves.toMatchObject({ status: "degraded", databaseReachable: true });
    // An instance that started after it does not count it: that export is the sweep's to fail, not a reason to stay red.
    const startedLater = new GetHealthQueryHandler(database.unitOfWorkFactory, fixedClock(Temporal.Now.instant()));
    await expect(startedLater.executeAsync()).resolves.toMatchObject({ status: "ok" });
  });
});
