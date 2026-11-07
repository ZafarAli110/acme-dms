import { formatPriceInput, parsePrice } from "../formatters/formatPrice";
import type { Part, PartFormValues } from "../types/part";

/** The form's starting values: the part as saved, its price written the user's way ("45.50", "45,50"). */
export function toFormValues(part: Part, language: string): PartFormValues {
  return {
    description: part.description,
    unitPrice: formatPriceInput(part.unitPrice, language),
    photos: part.photos.map((photo) => ({
      key: photo.id,
      photoId: photo.id,
      documentId: photo.documentId,
      file: null,
      fileName: photo.originalFileName,
      isDefault: photo.isDefault,
    })),
  };
}

/**
 * The multipart body of one Save (PATCH): `payload` holds only the fields that changed, plus the complete list of
 * existing photos to keep and one entry per new file; `photos` holds the new files in the same order.
 */
export function toUpdateFormData(values: PartFormValues, saved: Part, language: string): FormData {
  const description = values.description.trim();
  const unitPrice = parsePrice(values.unitPrice, language);
  const existing = values.photos.filter((photo) => photo.photoId !== null);
  const added = values.photos.filter((photo) => photo.file !== null);

  const payload = {
    ...(description !== saved.description ? { description } : {}),
    ...(unitPrice !== null && unitPrice !== saved.unitPrice ? { unitPrice } : {}),
    photos: existing.map((photo) => ({ id: photo.photoId, isDefault: photo.isDefault })),
    newPhotos: added.map((photo) => ({ isDefault: photo.isDefault })),
  };

  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  // The version this form was opened from; the page's clientAction takes it out and sends it as If-Match.
  form.append("version", String(saved.version));
  for (const photo of added) {
    if (photo.file) {
      form.append("photos", photo.file, photo.fileName);
    }
  }
  return form;
}

/**
 * The photos after "Keep my edits": theirs (the newer version), less the ones this user removed from the version their
 * form opened, plus this user's new files. A save sends the complete list of photos to keep, so keeping the user's list
 * as it was would delete every photo the other person added. The default is the user's choice when they made one in
 * this form, otherwise theirs, and there is exactly one.
 */
export function mergePhotos(
  mine: PartFormValues["photos"],
  opened: PartFormValues["photos"],
  theirs: PartFormValues["photos"],
): PartFormValues["photos"] {
  const mineById = new Map(mine.filter((photo) => photo.photoId !== null).map((photo) => [photo.photoId, photo]));
  const removedByMe = new Set(opened.filter((photo) => !mineById.has(photo.photoId)).map((photo) => photo.photoId));
  const added = mine.filter((photo) => photo.file !== null);
  const merged = [...theirs.filter((photo) => !removedByMe.has(photo.photoId)), ...added];

  const openedDefault = opened.find((photo) => photo.isDefault)?.photoId ?? null;
  const myDefault = mine.find((photo) => photo.isDefault) ?? null;
  const iChoseTheDefault = myDefault !== null && (myDefault.file !== null || myDefault.photoId !== openedDefault);
  const defaultKey = iChoseTheDefault
    ? myDefault.key
    : (merged.find((photo) => photo.isDefault)?.key ?? merged[0]?.key ?? null);
  return merged.map((photo) => ({ ...photo, isDefault: photo.key === defaultKey }));
}
