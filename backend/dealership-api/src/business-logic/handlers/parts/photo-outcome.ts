import { and, eq, inArray, sql } from "drizzle-orm";
import { SYSTEM_USER_ID } from "#business-logic-abstractions/user-context/system-user";
import { earlyDocumentOutcomes } from "#persistence/schema/early-document-outcomes";
import { partPhotos } from "#persistence/schema/part-photos";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import type { Database } from "#persistence/unit-of-work/unit-of-work";

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
        eq(partPhotos.status, "pending"),
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

/** One document's events and its upload take turns, until the transaction ends. */
async function lockDocumentAsync(db: Database, documentId: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${documentId}::text, 0))`);
}
