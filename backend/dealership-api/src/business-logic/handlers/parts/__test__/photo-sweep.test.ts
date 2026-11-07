import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { earlyDocumentOutcomes } from "#persistence/schema/early-document-outcomes";
import { partPhotos } from "#persistence/schema/part-photos";
import { processedMessages } from "#persistence/schema/processed-messages";
import { NORTHSIDE, NORTHWIND } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { fixedClock, TEST_NOW } from "#test-setup/time/fixed-clock";
import { MarkPartPhotoReadyCommandHandler } from "../mark-photo-ready/mark-part-photo-ready.command-handler";
import { PHOTO_TIMED_OUT, sweepPhotosAsync } from "../photo-outcome";
import { PhotoSweeper } from "../../../photos/photo-sweeper";

describe("the photo sweep", () => {
  const database = useTestDatabase();
  const statusOf = async (id: string) => (await database.db.select().from(partPhotos).where(eq(partPhotos.id, id)))[0];

  it("fails a photo still processing after the deadline, and leaves a recent or removed one alone", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "SWP-001" });
    const old = await database.seed.addPhotoAsync({ partId: part.id, isDefault: true, status: "pending" });
    const recent = await database.seed.addPhotoAsync({ partId: part.id, isDefault: false, status: "pending" });
    // Saved five minutes after the others (the seed kit stamps every row with the same time).
    await database.db
      .update(partPhotos)
      .set({ createdAt: TEST_NOW.add({ minutes: 5 }) })
      .where(eq(partPhotos.id, recent.id));
    const removed = await database.seed.addPhotoAsync({
      partId: part.id,
      isDefault: false,
      status: "pending",
      deleted: true,
    });

    const { timedOut } = await sweepPhotosAsync(database.db, TEST_NOW.add({ minutes: 11 }));

    expect(timedOut).toBe(1);
    expect(await statusOf(old.id)).toMatchObject({ status: "failed", failureReason: PHOTO_TIMED_OUT });
    expect((await statusOf(recent.id))?.status).toBe("pending");
    expect((await statusOf(removed.id))?.status).toBe("pending");
  });

  it("still takes document-api's late answer for a photo it failed only because it stopped waiting", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "SWP-002" });
    const photo = await database.seed.addPhotoAsync({ partId: part.id, isDefault: true, status: "pending" });
    await sweepPhotosAsync(database.db, TEST_NOW.add({ minutes: 11 }));

    await new MarkPartPhotoReadyCommandHandler(database.unitOfWorkFactory, fixedClock()).executeAsync({
      messageId: crypto.randomUUID(),
      type: "document.processed.v1",
      occurredAt: "2026-11-03T09:12:00Z",
      correlationId: null,
      data: { documentId: photo.documentId, dealerId: NORTHWIND, ownerType: "part", ownerId: part.id, variants: [] },
    });

    expect(await statusOf(photo.id)).toMatchObject({ status: "ready", failureReason: null });
  });

  it("forgets early outcomes after a day and the inbox's message ids after 30 days, not sooner", async () => {
    const now = TEST_NOW.add({ hours: 24 * 31 });
    const stale = {
      documentId: crypto.randomUUID(),
      dealerId: NORTHWIND,
      status: "ready" as const,
      failureReason: null,
    };
    const fresh = { ...stale, documentId: crypto.randomUUID() };
    await database.db.insert(earlyDocumentOutcomes).values([
      { ...stale, receivedAt: now.subtract({ hours: 25 }) },
      { ...fresh, receivedAt: now.subtract({ hours: 1 }) },
    ]);
    const oldMessage = crypto.randomUUID();
    const newMessage = crypto.randomUUID();
    await database.db.insert(processedMessages).values([
      { messageId: oldMessage, processedAt: now.subtract({ hours: 24 * 31 }) },
      { messageId: newMessage, processedAt: now.subtract({ hours: 24 }) },
    ]);

    await sweepPhotosAsync(database.db, now);

    const outcomes = await database.db.select().from(earlyDocumentOutcomes);
    expect(outcomes.map((outcome) => outcome.documentId)).toEqual([fresh.documentId]);
    const messages = await database.db.select().from(processedMessages);
    expect(messages.map((message) => message.messageId)).toContain(newMessage);
    expect(messages.map((message) => message.messageId)).not.toContain(oldMessage);
  });

  it("tells document-api about a document no photo claimed in a day, and forgets it only once that is sent", async () => {
    const now = TEST_NOW.add({ hours: 25 });
    const orphan = {
      documentId: crypto.randomUUID(),
      dealerId: NORTHWIND,
      status: "ready" as const,
      failureReason: null,
    };
    await database.db.insert(earlyDocumentOutcomes).values({ ...orphan, receivedAt: TEST_NOW });
    const broker = {
      publishUnclaimedAsync: vi.fn<(documents: { documentId: string; dealerId: string }[]) => Promise<void>>(() =>
        Promise.reject(new Error("RabbitMQ is not connected")),
      ),
    };
    const stillThere = async () =>
      (await database.db.select().from(earlyDocumentOutcomes)).some((row) => row.documentId === orphan.documentId);

    // The broker is down: the outcome stays for the next sweep.
    await new PhotoSweeper(database.unitOfWorkFactory, fixedClock(now), broker).sweepAsync();
    expect(await stillThere()).toBe(true);

    broker.publishUnclaimedAsync.mockResolvedValueOnce(undefined);
    await new PhotoSweeper(database.unitOfWorkFactory, fixedClock(now), broker).sweepAsync();

    expect(broker.publishUnclaimedAsync.mock.lastCall?.[0]).toContainEqual({
      documentId: orphan.documentId,
      dealerId: NORTHWIND,
    });
    expect(await stillThere()).toBe(false);
  });
});
