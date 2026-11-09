import { BadRequestException, PreconditionFailedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { AT_NORTHSIDE } from "#test-setup/users/test-users";
import { NORTHSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { partPhotos } from "#persistence/schema/part-photos";
import { parts } from "#persistence/schema/parts";
import { fakeDocumentApi, jpeg } from "#test-setup/document-api/fake-document-api";
import { UploadPartPhotoCommandHandler } from "../../upload-photo/upload-part-photo.command-handler";
import { UpdatePartCommandHandler } from "../update-part.command-handler";

describe("UpdatePartCommandHandler", () => {
  const database = useTestDatabase();

  async function partWithTwoPhotosAsync(partNumber: string) {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber });
    const photoA = await database.seed.addPhotoAsync({ partId: part.id, isDefault: true });
    const photoB = await database.seed.addPhotoAsync({ partId: part.id, isDefault: false });
    return { part, photoA, photoB };
  }

  it("saves the changes and photo changes in one transaction", async () => {
    const { part, photoA, photoB } = await partWithTwoPhotosAsync("UPD-001");
    const documents = fakeDocumentApi();

    const saved = await database
      .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
      .executeAsync(
        AT_NORTHSIDE,
        part.id,
        {
          description: "Ceramic pads",
          photos: [
            { id: photoA.id, isDefault: false },
            { id: photoB.id, isDefault: false },
          ],
          newPhotos: [{ isDefault: true }],
        },
        [jpeg("new.jpg")],
        1,
      );

    expect(saved.description).toBe("Ceramic pads");
    expect(saved.version).toBe(2);
    expect(saved.photos.map((photo) => [photo.originalFileName, photo.isDefault, photo.status])).toEqual([
      ["photo.jpg", false, "ready"],
      ["photo.jpg", false, "ready"],
      ["new.jpg", true, "pending"],
    ]);
  });

  it("soft-deletes removed photos and deletes their files after the save", async () => {
    const { part, photoA, photoB } = await partWithTwoPhotosAsync("UPD-002");
    const documents = fakeDocumentApi();

    const saved = await database
      .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
      .executeAsync(AT_NORTHSIDE, part.id, { photos: [{ id: photoA.id, isDefault: true }] }, [], 1);

    const [removed] = await database.db.select().from(partPhotos).where(eq(partPhotos.id, photoB.id));
    expect(saved.photos.map((photo) => photo.id)).toEqual([photoA.id]);
    expect(removed).toMatchObject({ isDeleted: true, deletedBy: AT_NORTHSIDE.userId });
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(AT_NORTHSIDE, photoB.documentId);
  });

  it("deletes the uploaded documents when the save fails", async () => {
    const { part } = await partWithTwoPhotosAsync("UPD-003");
    const other = await partWithTwoPhotosAsync("UPD-004");
    const documents = fakeDocumentApi();

    await expect(
      database
        .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
        .executeAsync(
          AT_NORTHSIDE,
          part.id,
          // A photo of another part: refused before anything is uploaded…
          { photos: [{ id: other.photoA.id, isDefault: true }] },
          [],
          1,
        ),
    ).rejects.toThrow(BadRequestException);
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();

    // …while a failure after the upload (the description too long for its column) deletes what was uploaded.
    await expect(
      database
        .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
        .executeAsync(
          AT_NORTHSIDE,
          part.id,
          { description: "x".repeat(600), newPhotos: [{ isDefault: false }] },
          [jpeg("late.jpg")],
          1,
        ),
    ).rejects.toThrow();
    const uploaded = await documents.uploadDocumentAsync.mock.results[0]?.value;
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(AT_NORTHSIDE, uploaded.id);
    const [unchanged] = await database.db.select().from(parts).where(eq(parts.id, part.id));
    expect(unchanged?.description).toBe("Part UPD-003");
  });

  it("refuses a save from an older version before uploading anything", async () => {
    const { part } = await partWithTwoPhotosAsync("UPD-005");
    const documents = fakeDocumentApi();
    const handler = database.asRequest(
      new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()),
    );
    await handler.executeAsync(AT_NORTHSIDE, part.id, { description: "First save" }, [], 1);

    await expect(
      handler.executeAsync(
        AT_NORTHSIDE,
        part.id,
        { description: "Second", newPhotos: [{ isDefault: false }] },
        [jpeg("b.jpg")],
        1,
      ),
    ).rejects.toThrow(PreconditionFailedException);
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();
    const [stored] = await database.db.select().from(parts).where(eq(parts.id, part.id));
    expect(stored).toMatchObject({ description: "First save", version: 2 });
  });

  it("refuses a save another one overtook while its photos uploaded, and deletes what it uploaded", async () => {
    const { part } = await partWithTwoPhotosAsync("UPD-006");
    const documents = fakeDocumentApi();
    // Someone else saves the part while this save's photo is on its way to document-api.
    documents.uploadDocumentAsync.mockImplementationOnce(async () => {
      await database.db.update(parts).set({ version: 2 }).where(eq(parts.id, part.id));
      return { id: crypto.randomUUID(), status: "Pending" };
    });

    await expect(
      database
        .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
        .executeAsync(
          AT_NORTHSIDE,
          part.id,
          { description: "Mine", newPhotos: [{ isDefault: false }] },
          [jpeg("race.jpg")],
          1,
        ),
    ).rejects.toThrow(PreconditionFailedException);
    const uploaded = await documents.uploadDocumentAsync.mock.results[0]?.value;
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(AT_NORTHSIDE, uploaded.id);
    const [stored] = await database.db.select().from(parts).where(eq(parts.id, part.id));
    expect(stored?.description).not.toBe("Mine");
  });

  // The state sweep's F1: an upload did not move the part's version, so a save from a form opened before it passed the
  // version check and removed the uploaded photo, the form not knowing it.
  it("refuses a save from a form opened before a photo was uploaded, and keeps that photo", async () => {
    const { part, photoA, photoB } = await partWithTwoPhotosAsync("UPD-F1");
    const documents = fakeDocumentApi();
    const uploaded = await database
      .asRequest(new UploadPartPhotoCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
      .executeAsync(AT_NORTHSIDE, part.id, jpeg("meanwhile.jpg"));

    await expect(
      database
        .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
        .executeAsync(
          AT_NORTHSIDE,
          part.id,
          {
            photos: [
              { id: photoA.id, isDefault: true },
              { id: photoB.id, isDefault: false },
            ],
          },
          [],
          1,
        ),
    ).rejects.toThrow(PreconditionFailedException);
    const [kept] = await database.db.select().from(partPhotos).where(eq(partPhotos.id, uploaded.id));
    expect(kept?.isDeleted).toBe(false);
    expect(documents.deleteDocumentAsync).not.toHaveBeenCalled();
  });

  it("counts again under the part's lock: a photo uploaded meanwhile cannot take it past the limit", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "UPD-LIM" });
    const existing = [];
    for (let index = 0; index < 9; index++) {
      existing.push(await database.seed.addPhotoAsync({ partId: part.id, isDefault: index === 0 }));
    }
    const documents = fakeDocumentApi();
    documents.uploadDocumentAsync.mockImplementationOnce(async () => {
      // Someone uploads the tenth photo through the photo endpoint while this save is uploading its file.
      await database.seed.addPhotoAsync({ partId: part.id, isDefault: false });
      return { id: crypto.randomUUID(), status: "Pending" };
    });

    await expect(
      database
        .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
        .executeAsync(
          AT_NORTHSIDE,
          part.id,
          {
            photos: existing.map((photo) => ({ id: photo.id, isDefault: photo.isDefault })),
            newPhotos: [{ isDefault: false }],
          },
          [jpeg("eleventh.jpg")],
          null,
        ),
    ).rejects.toThrow(BadRequestException);
    expect(documents.deleteDocumentAsync).toHaveBeenCalledOnce();
  });

  it("leaves one default when a photo uploaded meanwhile was made the default too", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "UPD-DEF" });
    const documents = fakeDocumentApi();
    documents.uploadDocumentAsync.mockImplementationOnce(async () => {
      // The first photo, uploaded through the photo endpoint meanwhile, becomes the default there.
      await database.seed.addPhotoAsync({ partId: part.id, isDefault: true });
      return { id: crypto.randomUUID(), status: "Pending" };
    });

    const saved = await database
      .asRequest(new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()))
      .executeAsync(
        AT_NORTHSIDE,
        part.id,
        { photos: [], newPhotos: [{ isDefault: true }] },
        [jpeg("chosen.jpg")],
        null,
      );

    expect(saved.photos.filter((photo) => photo.isDefault).map((photo) => photo.originalFileName)).toEqual([
      "chosen.jpg",
    ]);
  });
});
