import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { TooManyRequestsException } from "#business-logic-abstractions/errors/too-many-requests.exception";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import { exportJobs } from "#persistence/schema/index";
import { readSettings } from "#settings/settings";
import { NORTHSIDE, RIVERSIDE, SEEDED_AT } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { fixedClock, TEST_NOW } from "#test-setup/time/fixed-clock";
import { AT_NORTHSIDE } from "#test-setup/users/test-users";
import { ExportQueue } from "../export-queue";
import { customerExportSource } from "../sources/customer-export-source";

const REQUEST = { columns: [{ field: "name", header: "Name" }] } as ExportRequestDto;

/** A user of their own for each test, so one test's exports never count against another's limit. */
function newUserAt(userId: string): UserContext {
  return { ...AT_NORTHSIDE, userId };
}

describe("ExportQueue", () => {
  const database = useTestDatabase();
  let queue: ExportQueue;

  beforeAll(() => {
    queue = new ExportQueue(database.unitOfWorkFactory, fixedClock(), readSettings({}));
  });

  const enqueueAsync = (user: UserContext, key: string | null, request: ExportRequestDto = REQUEST) =>
    queue.enqueueAsync(
      user,
      {
        kind: "customers",
        request,
        source: customerExportSource({ dealerId: user.dealerId, locationId: NORTHSIDE }, request, TEST_NOW),
      },
      key,
    );

  it("refuses a third export while a user has two running or waiting: 429, saying why and when to retry", async () => {
    const user = newUserAt("30000000-0000-0000-0000-0000000000c1");
    const first = await enqueueAsync(user, "first");
    await enqueueAsync(user, null);

    const refused = await enqueueAsync(user, null).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(TooManyRequestsException);
    expect((refused as TooManyRequestsException).getStatus()).toBe(429);
    expect((refused as TooManyRequestsException).message).toBe(
      "You already have 2 exports running or waiting. Wait for one to finish, or cancel one.",
    );
    expect((refused as TooManyRequestsException).retryAfterSeconds).toBe(30);
    // A retry of an export already queued is not a new one: it gets its export back, even at the limit.
    await expect(enqueueAsync(user, "first")).resolves.toMatchObject({ id: first.id });
  });

  it("frees a place when an export finishes or is cancelled", async () => {
    const user = newUserAt("30000000-0000-0000-0000-0000000000c2");
    const first = await enqueueAsync(user, null);
    await enqueueAsync(user, null);
    await queue.cancelAsync(user, first.id);

    await expect(enqueueAsync(user, null)).resolves.toMatchObject({ status: "queued" });
  });

  it("gives a retry with the same idempotency key the same export, stored once", async () => {
    const user = newUserAt("30000000-0000-0000-0000-0000000000c3");
    const first = await enqueueAsync(user, "retry-me");
    const retry = await enqueueAsync(user, "retry-me");

    const rows = await database.db.select().from(exportJobs).where(eq(exportJobs.ownerId, user.userId));

    expect(retry.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.request).toEqual(REQUEST);
  });

  it("cancels a waiting export at once, and asks a running one to stop", async () => {
    const user = newUserAt("30000000-0000-0000-0000-0000000000c4");
    const waiting = await enqueueAsync(user, null);
    const running = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      ownerId: user.userId,
      status: "writing",
      workerId: "a-worker",
      attempts: 1,
      heartbeatAt: SEEDED_AT,
    });

    await queue.cancelAsync(user, waiting.id);
    await queue.cancelAsync(user, running.id);

    await expect(queue.getAsync(user, waiting.id)).resolves.toMatchObject({
      status: "cancelled",
      error: "Cancelled before it started.",
    });
    const [stillRunning] = await database.db.select().from(exportJobs).where(eq(exportJobs.id, running.id));
    expect(stillRunning?.status).toBe("writing");
    expect(stillRunning?.cancelRequestedAt?.toString()).toBe(TEST_NOW.toString());
  });

  it("lists the user's exports at this location that have not expired, newest first", async () => {
    const user = newUserAt("30000000-0000-0000-0000-0000000000c5");
    const older = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      ownerId: user.userId,
      status: "completed",
      createdAt: SEEDED_AT.subtract({ minutes: 5 }),
    });
    const newer = await database.seed.addExportJobAsync({ locationId: NORTHSIDE, ownerId: user.userId });
    await database.seed.addExportJobAsync({ locationId: NORTHSIDE, ownerId: user.userId, status: "expired" });
    await database.seed.addExportJobAsync({ locationId: RIVERSIDE, ownerId: user.userId });
    await database.seed.addExportJobAsync({ locationId: NORTHSIDE });

    const listed = await queue.listAsync(user);

    expect(listed.map((job) => job.id)).toEqual([newer.id, older.id]);
  });
});
