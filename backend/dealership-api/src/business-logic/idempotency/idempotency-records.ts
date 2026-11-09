import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, lte, type SQL, sql } from "drizzle-orm";
import type {
  IdempotencyClaim,
  IdempotencyClaimRequest,
  IdempotencyClaimResult,
  IIdempotencyRecords,
} from "#business-logic-abstractions/idempotency/idempotency-records.interface";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import { idempotencyRecords } from "#persistence/schema/idempotency-records";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { SETTINGS, type Settings } from "#settings/settings";

/** How long a key is kept: a save sent again within it is done once; after it, the key starts a new save. */
export const IDEMPOTENCY_TTL = Temporal.Duration.from({ hours: 24 });
/** Expired keys deleted per statement, so a sweep never holds a long lock. */
const SWEEP_BATCH = 1_000;

/**
 * The keys saves are sent with (ACME-125), in `idempotency_records`. Each method is one short transaction, and each
 * names the dealer and the user in its `where`: it runs as the request (the policy agrees) or, for the sweep, as the
 * owner. The commit marker is not here: it runs inside the save's own transaction (`UnitOfWorkFactory`).
 */
@Injectable()
export class IdempotencyRecords implements IIdempotencyRecords {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;
  /** A save holds its key this long: twice a request's time limit, so a running save's key is never taken from it. */
  private readonly _leaseMs: number;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
    @Inject(SETTINGS) settings: Settings,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
    this._leaseMs = 2 * settings.requestTimeoutMs;
  }

  public async claimAsync(request: IdempotencyClaimRequest): Promise<IdempotencyClaimResult> {
    const now = this._clock.now();
    const holder = randomUUID();
    await using work = await this._unitOfWorkFactory.beginAsync();
    // One statement claims a new key, one past its 24 hours, or one whose save stopped before it committed (its lease
    // ran out). Postgres locks the row it conflicts with, so of two saves at once only one claims it; the other finds
    // it below. `xmax = 0`: the row was inserted, not taken over.
    const [claimed] = await work.db
      .insert(idempotencyRecords)
      .values({
        dealerId: request.dealerId,
        userId: request.userId,
        key: request.key,
        fingerprint: request.fingerprint,
        state: "running",
        holder,
        leaseUntil: now.add({ milliseconds: this._leaseMs }),
        resource: request.resource,
        createdAt: now,
        expiresAt: now.add(IDEMPOTENCY_TTL),
      })
      .onConflictDoUpdate({
        target: [idempotencyRecords.dealerId, idempotencyRecords.userId, idempotencyRecords.key],
        set: {
          fingerprint: sql`excluded.fingerprint`,
          state: "running",
          holder: sql`excluded.holder`,
          leaseUntil: sql`excluded.lease_until`,
          answer: null,
          resource: sql`excluded.resource`,
          createdAt: sql`excluded.created_at`,
          expiresAt: sql`excluded.expires_at`,
        },
        setWhere: sql`${idempotencyRecords.expiresAt} <= ${now.toString()}::timestamptz
          or (${idempotencyRecords.state} = 'running' and ${idempotencyRecords.leaseUntil} <= ${now.toString()}::timestamptz)`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    if (claimed) {
      await work.commitAsync();
      const claim: IdempotencyClaim = {
        dealerId: request.dealerId,
        userId: request.userId,
        key: request.key,
        holder,
      };
      return claimed.inserted ? { kind: "mine", claim } : { kind: "taken-over", claim };
    }
    const [held] = await work.db
      .select({
        fingerprint: idempotencyRecords.fingerprint,
        state: idempotencyRecords.state,
        answer: idempotencyRecords.answer,
        resource: idempotencyRecords.resource,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.dealerId, request.dealerId),
          eq(idempotencyRecords.userId, request.userId),
          eq(idempotencyRecords.key, request.key),
        ),
      );
    if (!held || held.state === "running") {
      // Still running (or deleted by the sweep this instant, which only happens past its 24 hours): try again shortly.
      return { kind: "running" };
    }
    if (held.state === "done" && held.fingerprint === request.fingerprint) {
      return { kind: "replay", answer: held.answer };
    }
    // Another request with the same key (the form changed after a lost answer), or a save that committed and stopped
    // before its answer was kept: it went through, and is never run again.
    return { kind: "went-through", resource: held.resource };
  }

  public async completeAsync(claim: IdempotencyClaim, answer: unknown, resource: string | null): Promise<void> {
    await using work = await this._unitOfWorkFactory.beginAsync();
    await work.db
      .update(idempotencyRecords)
      .set({ state: "done", answer, resource: sql`coalesce(${resource}, ${idempotencyRecords.resource})` })
      .where(and(this.heldBy(claim), inArray(idempotencyRecords.state, ["running", "committed"])));
    await work.commitAsync();
  }

  public async releaseAsync(claim: IdempotencyClaim): Promise<void> {
    await using work = await this._unitOfWorkFactory.beginAsync();
    // Only while running: a save that committed and then failed (a photo's document not deleted, the re-read) keeps its
    // key, so sending it again never runs it twice.
    await work.db.delete(idempotencyRecords).where(and(this.heldBy(claim), eq(idempotencyRecords.state, "running")));
    await work.commitAsync();
  }

  /** Deletes up to a batch of keys past their 24 hours; returns how many. Outside a request: every dealer's. */
  public async sweepAsync(): Promise<number> {
    await using work = await this._unitOfWorkFactory.beginAsync();
    const expired = work.db
      .select({
        dealerId: idempotencyRecords.dealerId,
        userId: idempotencyRecords.userId,
        key: idempotencyRecords.key,
      })
      .from(idempotencyRecords)
      .where(lte(idempotencyRecords.expiresAt, this._clock.now()))
      .limit(SWEEP_BATCH);
    const deleted = await work.db
      .delete(idempotencyRecords)
      .where(
        sql`(${idempotencyRecords.dealerId}, ${idempotencyRecords.userId}, ${idempotencyRecords.key}) in (${expired})`,
      )
      .returning({ key: idempotencyRecords.key });
    await work.commitAsync();
    return deleted.length;
  }

  private heldBy(claim: IdempotencyClaim): SQL | undefined {
    return and(
      eq(idempotencyRecords.dealerId, claim.dealerId),
      eq(idempotencyRecords.userId, claim.userId),
      eq(idempotencyRecords.key, claim.key),
      eq(idempotencyRecords.holder, claim.holder),
    );
  }
}
