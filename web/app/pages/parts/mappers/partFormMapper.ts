import type {Part, PartFormValues} from '../types/part';

/** The form's starting values: the part as saved. */
export function toFormValues(part: Part): PartFormValues {
  return {
    description: part.description,
    unitPrice: part.unitPrice.toFixed(2),
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
export function toUpdateFormData(values: PartFormValues, saved: Part): FormData {
  const description = values.description.trim();
  const unitPrice = Number(values.unitPrice);
  const existing = values.photos.filter((photo) => photo.photoId !== null);
  const added = values.photos.filter((photo) => photo.file !== null);

  const payload = {
    ...(description !== saved.description ? {description} : {}),
    ...(unitPrice !== saved.unitPrice ? {unitPrice} : {}),
    photos: existing.map((photo) => ({id: photo.photoId, isDefault: photo.isDefault})),
    newPhotos: added.map((photo) => ({isDefault: photo.isDefault})),
  };

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const photo of added) {
    if (photo.file) {
      form.append('photos', photo.file, photo.fileName);
    }
  }
  return form;
}
