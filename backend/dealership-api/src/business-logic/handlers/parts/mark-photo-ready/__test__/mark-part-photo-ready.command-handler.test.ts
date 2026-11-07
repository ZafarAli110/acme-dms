import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fixedClock, TEST_NOW } from "#test-setup/time/fixed-clock";
import { NORTHSIDE, NORTHWIND } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { partPhotos } from "#persistence/schema/part-photos";
import { MarkPartPhotoReadyCommandHandler } from "../mark-part-photo-ready.command-handler";

describe("MarkPartPhotoReadyCommandHandler", () => {
  const database = useTestDatabase();

  it("applies a message once", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "MSG-001" });
    const photo = await database.seed.addPhotoAsync({ partId: part.id, isDefault: true, status: "pending" });
    const handler = new MarkPartPhotoReadyCommandHandler(database.unitOfWorkFactory, fixedClock());
    const message = {
      messageId: crypto.randomUUID(),
      type: "document.processed.v1",
      occurredAt: "2026-11-03T09:00:00Z",
      correlationId: null,
      data: { documentId: photo.documentId, dealerId: NORTHWIND, ownerType: "part", ownerId: part.id, variants: [] },
    };

    await handler.executeAsync(message);
    await database.db.update(partPhotos).set({ status: "failed" }).where(eq(partPhotos.id, photo.id));
    await handler.executeAsync(message);

    const [read] = await database.db.select().from(partPhotos).where(eq(partPhotos.id, photo.id));
    expect(read?.status).toBe("failed");
  });

  it("moves only a pending photo: a late event changes neither a failed photo nor a removed one", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "MSG-002" });
    const failed = await database.seed.addPhotoAsync({ partId: part.id, isDefault: true, status: "failed" });
    const removed = await database.seed.addPhotoAsync({ partId: part.id, isDefault: false, status: "pending" });
    await database.db
      .update(partPhotos)
      .set({ isDeleted: true, deletedAt: TEST_NOW, deletedBy: crypto.randomUUID() })
      .where(eq(partPhotos.id, removed.id));
    const handler = new MarkPartPhotoReadyCommandHandler(database.unitOfWorkFactory, fixedClock());
    const processed = (documentId: string) => ({
      messageId: crypto.randomUUID(),
      type: "document.processed.v1",
      occurredAt: "2026-11-03T09:00:00Z",
      correlationId: null,
      data: { documentId, dealerId: NORTHWIND, ownerType: "part", ownerId: part.id, variants: [] },
    });

    await handler.executeAsync(processed(failed.documentId));
    await handler.executeAsync(processed(removed.documentId));

    const read = await database.db.select().from(partPhotos).where(eq(partPhotos.partId, part.id));
    expect(read.find((photo) => photo.id === failed.id)?.status).toBe("failed");
    expect(read.find((photo) => photo.id === removed.id)?.status).toBe("pending");
  });
});
