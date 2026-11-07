import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { SYSTEM_USER_ID } from "#business-logic-abstractions/user-context/system-user";
import { earlyDocumentOutcomes } from "#persistence/schema/early-document-outcomes";
import { partPhotos } from "#persistence/schema/part-photos";
import { processedMessages } from "#persistence/schema/processed-messages";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import type { Database } from "#persistence/unit-of-work/unit-of-work";

/** A photo still processing after this long is failed (`sweepPhotosAsync`): its document's event is not coming. */
export const PHOTO_DEADLINE_MINUTES = 10;
/** Why a photo was failed by the sweep. A late `processed` may still make it ready (`recordPhotoOutcomeAsync`). */
export const PHOTO_TIMED_OUT = "Processing did not finish in time.";

/** What document-api said about a photo's document: processed (`ready`) or `failed`, with its reason. */
export interface PhotoOutcome {
  dealerId: string;
  documentId: string;
  status: "ready" | "failed";
  failureReason: string | null;
}

/**
 * A photo's status moves once: `pending` to `ready` or `failed`, never back and never again. So a late or repeated
 * event changes nothing, and neither does one for a photo the user removed. An event for a photo not saved yet (its
 * upload stored the file first and has not committed the photo) is kept, and the upload applies it
 * (`applyEarlyOutcomesAsync`). Both take the document's lock first, in their transaction, so whichever commits second
 * sees what the first did: the outcome is never lost between them.
 */
export async function recordPhotoOutcomeAsync(
  db: Database,
  outcome: PhotoOutcome,
  now: Temporal.Instant,
): Promise<void> {
  await lockDocumentAsync(db, outcome.documentId);
  const moved = await db
    .update(partPhotos)
    // Background work: no signed-in user, so the system is recorded as the one who changed the photo.
    .set({ status: outcome.status, failureReason: outcome.failureReason, updatedAt: now, updatedBy: SYSTEM_USER_ID })
    .where(
      and(
        eq(partPhotos.dealerId, outcome.dealerId),
        eq(partPhotos.documentId, outcome.documentId),
        // Pending, or failed only because the sweep stopped waiting: the document's real answer still counts.
        or(
          eq(partPhotos.status, "pending"),
          and(eq(partPhotos.status, "failed"), eq(partPhotos.failureReason, PHOTO_TIMED_OUT)),
        ),
        notDeleted(partPhotos),
      ),
    )
    .returning({ id: partPhotos.id });
  if (moved.length > 0) {
    return;
  }
  const [saved] = await db
    .select({ id: partPhotos.id })
    .from(partPhotos)
    .where(and(eq(partPhotos.dealerId, outcome.dealerId), eq(partPhotos.documentId, outcome.documentId)));
  if (saved) {
    // Already ready or failed, or removed: this event is late, and changes nothing.
    return;
  }
  // The first word on a document stands, as it would on its photo.
  await db
    .insert(earlyDocumentOutcomes)
    .values({ ...outcome, receivedAt: now })
    .onConflictDoNothing();
}

/**
 * In the transaction that saves new photos, after inserting them: applies what document-api already said about their
 * documents, and forgets it.
 */
export async function applyEarlyOutcomesAsync(
  db: Database,
  documentIds: string[],
  now: Temporal.Instant,
): Promise<void> {
  for (const documentId of documentIds.toSorted()) {
    await lockDocumentAsync(db, documentId);
  }
  const outcomes = await db
    .delete(earlyDocumentOutcomes)
    .where(inArray(earlyDocumentOutcomes.documentId, documentIds))
    .returning();
  for (const outcome of outcomes) {
    await db
      .update(partPhotos)
      .set({ status: outcome.status, failureReason: outcome.failureReason, updatedAt: now, updatedBy: SYSTEM_USER_ID })
      .where(and(eq(partPhotos.documentId, outcome.documentId), eq(partPhotos.status, "pending")));
  }
}

/**
 * The way out of `pending` when document-api's answer never comes (its message dead-lettered, its document stuck): a
 * photo pending past PHOTO_DEADLINE_MINUTES is failed, "timed out". Also forgets what is no longer needed: early
 * outcomes after a day (their upload failed or was refused) and the inbox's message ids after 30 days (a redelivery
 * comes within minutes). Every statement is conditional, so a sweep on several instances at once does no harm.
 */
export async function sweepPhotosAsync(db: Database, now: Temporal.Instant): Promise<{ timedOut: number }> {
  const timedOut = await db
    .update(partPhotos)
    .set({ status: "failed", failureReason: PHOTO_TIMED_OUT, updatedAt: now, updatedBy: SYSTEM_USER_ID })
    .where(
      and(
        eq(partPhotos.status, "pending"),
        notDeleted(partPhotos),
        lt(partPhotos.createdAt, now.subtract({ minutes: PHOTO_DEADLINE_MINUTES })),
      ),
    )
    .returning({ id: partPhotos.id });
  await db.delete(earlyDocumentOutcomes).where(lt(earlyDocumentOutcomes.receivedAt, now.subtract({ hours: 24 })));
  await db.delete(processedMessages).where(lt(processedMessages.processedAt, now.subtract({ hours: 24 * 30 })));
  return { timedOut: timedOut.length };
}

/** One document's events and its upload take turns, until the transaction ends. */
async function lockDocumentAsync(db: Database, documentId: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${documentId}::text, 0))`);
}
