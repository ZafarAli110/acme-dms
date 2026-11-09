import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type {
  IdempotencyClaim,
  IdempotencyClaimRequest,
  IdempotencyClaimResult,
} from "#business-logic-abstractions/idempotency/idempotency-records.interface";
import type { IClock } from "#business-logic-abstractions/time/clock.interface";
import { idempotencyRecords } from "#persistence/schema/idempotency-records";
import { CITY_MOTORS, NORTHWIND, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { TEST_NOW } from "#test-setup/time/fixed-clock";
import { AT_CENTRAL, AT_NORTHSIDE } from "#test-setup/users/test-users";
import { inRequest } from "#test-setup/postgres/as-request";
import { readSettings } from "#settings/settings";
import { IdempotencyRecords } from "../idempotency-records";

const OTHER_USER_ID = "30000000-0000-0000-0000-0000000000bb";

/** A clock the test moves on. */
function movableClock(): IClock & { advance(duration: Temporal.DurationLike): void } {
  let at = TEST_NOW;
  return {
    now: () => at,
    advance(duration) {
      at = at.add(duration);
    },
  };
}

function claimOf(result: IdempotencyClaimResult): IdempotencyClaim {
  if (result.kind !== "mine" && result.kind !== "taken-over") {
    throw new Error(`Expected a claim, got ${result.kind}.`);
  }
  return result.claim;
}

/** Each call as sam's request at Northside, under the table's policy. */
const asSam = <T>(work: () => Promise<T>): Promise<T> => inRequest(AT_NORTHSIDE, work);

describe("IdempotencyRecords", () => {
  const context = useTestDatabase();
  // A request's time limit of 30 s: a save holds its key for 60 s.
  const settings = readSettings({ REQUEST_TIMEOUT: "30s" });
  let keyNumber = 0;

  function setUp(): {
    records: IdempotencyRecords;
    clock: ReturnType<typeof movableClock>;
    request: IdempotencyClaimRequest;
  } {
    const clock = movableClock();
    keyNumber += 1;
    return {
      records: new IdempotencyRecords(context.unitOfWorkFactory, clock, settings),
      clock,
      request: {
        dealerId: NORTHWIND,
        userId: TEST_USER_ID,
        key: `key-${keyNumber}`,
        fingerprint: "fingerprint-a",
        resource: null,
      },
    };
  }

  it("claims a new key, and keeps the answer the save gave for the same request sent again", async () => {
    const { records, request } = setUp();

    const first = await asSam(() => records.claimAsync(request));
    expect(first.kind).toBe("mine");
    await asSam(() => records.completeAsync(claimOf(first), { id: "c-1", version: 1 }, "/v1/customers/c-1"));

    const again = await asSam(() => records.claimAsync(request));
    expect(again).toEqual({ kind: "replay", answer: { id: "c-1", version: 1 } });
  });

  it("says a save with the key is still running, whatever it was sent with", async () => {
    const { records, request } = setUp();
    await asSam(() => records.claimAsync(request));

    expect(await asSam(() => records.claimAsync(request))).toEqual({ kind: "running" });
    expect(await asSam(() => records.claimAsync({ ...request, fingerprint: "fingerprint-b" }))).toEqual({
      kind: "running",
    });
  });

  it("says the first save went through when the same key comes with another request, and where it is", async () => {
    const { records, request } = setUp();
    const first = claimOf(await asSam(() => records.claimAsync(request)));
    await asSam(() => records.completeAsync(first, { id: "c-2" }, "/v1/customers/c-2"));

    const changed = await asSam(() => records.claimAsync({ ...request, fingerprint: "fingerprint-b" }));

    expect(changed).toEqual({ kind: "went-through", resource: "/v1/customers/c-2" });
  });

  it("never runs a save again that committed without its answer kept, even sent unchanged", async () => {
    const { records, request } = setUp();
    claimOf(await asSam(() => records.claimAsync({ ...request, resource: "/v1/customers/c-3" })));
    // What the save's own transaction does (UnitOfWorkFactory); then the process stops before the answer is kept.
    await context.db
      .update(idempotencyRecords)
      .set({ state: "committed" })
      .where(eq(idempotencyRecords.key, request.key));

    expect(await asSam(() => records.claimAsync(request))).toEqual({
      kind: "went-through",
      resource: "/v1/customers/c-3",
    });
  });

  it("lets a second save take over a key whose save stopped before committing, with a new holder", async () => {
    const { records, request, clock } = setUp();
    const first = claimOf(await asSam(() => records.claimAsync(request)));

    clock.advance({ seconds: 59 });
    expect((await asSam(() => records.claimAsync(request))).kind).toBe("running");

    clock.advance({ seconds: 1 });
    const second = await asSam(() => records.claimAsync(request));
    expect(second.kind).toBe("taken-over");
    expect(claimOf(second).holder).not.toBe(first.holder);

    // The first, if it wakes up, can neither keep an answer nor free the key: it is no longer its holder.
    await asSam(() => records.completeAsync(first, { id: "stale" }, null));
    await asSam(() => records.releaseAsync(first));
    const [row] = await context.db.select().from(idempotencyRecords).where(eq(idempotencyRecords.key, request.key));
    expect(row).toMatchObject({ state: "running", holder: claimOf(second).holder, answer: null });
  });

  it("never takes over a committed key, however long ago its lease ran out", async () => {
    const { records, request, clock } = setUp();
    claimOf(await asSam(() => records.claimAsync(request)));
    await context.db
      .update(idempotencyRecords)
      .set({ state: "committed" })
      .where(eq(idempotencyRecords.key, request.key));

    clock.advance({ hours: 1 });

    expect((await asSam(() => records.claimAsync(request))).kind).toBe("went-through");
  });

  it("frees a key whose save failed before committing, so the corrected save can use it", async () => {
    const { records, request } = setUp();
    const failed = claimOf(await asSam(() => records.claimAsync(request)));

    await asSam(() => records.releaseAsync(failed));

    expect((await asSam(() => records.claimAsync({ ...request, fingerprint: "corrected" }))).kind).toBe("mine");
  });

  it("never frees a key whose save committed, even when the request failed after", async () => {
    const { records, request } = setUp();
    const committed = claimOf(await asSam(() => records.claimAsync(request)));
    await context.db
      .update(idempotencyRecords)
      .set({ state: "committed" })
      .where(eq(idempotencyRecords.key, request.key));

    await asSam(() => records.releaseAsync(committed));

    expect((await asSam(() => records.claimAsync(request))).kind).toBe("went-through");
  });

  it("starts a new save with a key 24 hours after it was first used, and the sweep deletes it then", async () => {
    const { records, request, clock } = setUp();
    const first = claimOf(await asSam(() => records.claimAsync(request)));
    await asSam(() => records.completeAsync(first, { id: "old" }, null));

    clock.advance({ hours: 23, minutes: 59 });
    expect((await asSam(() => records.claimAsync(request))).kind).toBe("replay");
    expect(await records.sweepAsync()).toBe(0);

    clock.advance({ minutes: 1 });
    expect(await records.sweepAsync()).toBeGreaterThanOrEqual(1);
    expect(await context.db.select().from(idempotencyRecords).where(eq(idempotencyRecords.key, request.key))).toEqual(
      [],
    );
    expect((await asSam(() => records.claimAsync(request))).kind).toBe("mine");
  });

  it("treats an expired key as free even before the sweep has deleted it", async () => {
    const { records, request, clock } = setUp();
    const first = claimOf(await asSam(() => records.claimAsync(request)));
    await asSam(() => records.completeAsync(first, { id: "old" }, null));

    clock.advance({ hours: 24 });

    expect((await asSam(() => records.claimAsync({ ...request, fingerprint: "new" }))).kind).toBe("taken-over");
  });

  it("keeps each user's keys, and each dealer's, apart: the same key is another person's own save", async () => {
    const { records, request } = setUp();
    const sams = claimOf(await asSam(() => records.claimAsync(request)));
    await asSam(() => records.completeAsync(sams, { id: "sams" }, null));

    const anotherUser = { ...AT_NORTHSIDE, userId: OTHER_USER_ID };
    const theirs = await inRequest(anotherUser, () => records.claimAsync({ ...request, userId: OTHER_USER_ID }));
    expect(theirs.kind).toBe("mine");

    const tom = { ...AT_CENTRAL, userId: TEST_USER_ID };
    const toms = await inRequest(tom, () => records.claimAsync({ ...request, dealerId: CITY_MOTORS }));
    expect(toms.kind).toBe("mine");
  });

  it("refuses, under the policy, a claim in another user's or dealer's name", async () => {
    const { records, request } = setUp();

    // sam's request naming another user: the policy refuses the row it would write.
    await expect(asSam(() => records.claimAsync({ ...request, userId: OTHER_USER_ID }))).rejects.toThrow();
    await expect(asSam(() => records.claimAsync({ ...request, dealerId: CITY_MOTORS }))).rejects.toThrow();
    const rows = await context.db
      .select()
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.key, request.key)));
    expect(rows).toEqual([]);
  });
});
