import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { AT_CENTRAL, AT_NORTHSIDE } from "#test-setup/users/test-users";
import { NORTHSIDE, NORTHWIND } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { fakeDocumentApi, jpeg } from "#test-setup/document-api/fake-document-api";
import { MarkPartPhotoReadyCommandHandler } from "../../mark-photo-ready/mark-part-photo-ready.command-handler";
import { UploadPartPhotoCommandHandler } from "../upload-part-photo.command-handler";

describe("UploadPartPhotoCommandHandler", () => {
  const database = useTestDatabase();

  it("adds a pending photo, the first one as default", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "UPL-001" });
    const documents = fakeDocumentApi();
    const handler = database.asRequest(
      new UploadPartPhotoCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()),
    );

    const first = await handler.executeAsync(AT_NORTHSIDE, part.id, jpeg("one.jpg"));
    const second = await handler.executeAsync(AT_NORTHSIDE, part.id, jpeg("two.jpg"));

    expect([first.isDefault, second.isDefault]).toEqual([true, false]);
    expect(first.status).toBe("pending");
  });

  it("refuses a photo for another dealer's part, before anything is uploaded", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "UPL-002" });
    const documents = fakeDocumentApi();
    const handler = database.asRequest(
      new UploadPartPhotoCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()),
    );

    await expect(handler.executeAsync(AT_CENTRAL, part.id, jpeg("one.jpg"))).rejects.toThrow(NotFoundException);
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();
  });

  it("keeps document-api's answer when it arrives before the photo is saved, and applies it to the photo", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "UPL-003" });
    const documents = fakeDocumentApi();
    const documentId = crypto.randomUUID();
    documents.uploadDocumentAsync.mockImplementationOnce(async () => {
      // document-api stores and processes the file, and its event is handled, before the upload saves the photo.
      await new MarkPartPhotoReadyCommandHandler(database.unitOfWorkFactory, fixedClock()).executeAsync({
        messageId: crypto.randomUUID(),
        type: "document.processed.v1",
        occurredAt: "2026-11-03T09:00:00Z",
        correlationId: null,
        data: { documentId, dealerId: NORTHWIND, ownerType: "part", ownerId: part.id, variants: [] },
      });
      return { id: documentId, status: "Pending" };
    });
    const handler = new UploadPartPhotoCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock());

    const photo = await handler.executeAsync(AT_NORTHSIDE, part.id, jpeg("early.jpg"));

    expect(photo.status).toBe("ready");
  });

  it("lets uploads to one part take turns: two at once make one default, and never pass the limit", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "UPL-004" });
    const documents = fakeDocumentApi();
    const handler = new UploadPartPhotoCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock());

    const both = await Promise.all([
      handler.executeAsync(AT_NORTHSIDE, part.id, jpeg("one.jpg")),
      handler.executeAsync(AT_NORTHSIDE, part.id, jpeg("two.jpg")),
    ]);

    expect(both.filter((photo) => photo.isDefault)).toHaveLength(1);
  });
});
