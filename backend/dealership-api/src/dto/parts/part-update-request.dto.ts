import * as v from "valibot";
import { unitPrice } from "./part-create-request.dto";

/** A photo the part already has, kept by this save. */
export const PartPhotoUpdateSchema = v.strictObject({ id: v.pipe(v.string(), v.uuid()), isDefault: v.boolean() });
export type PartPhotoUpdateDto = v.InferOutput<typeof PartPhotoUpdateSchema>;

/** One new photo, in the same order as the uploaded files. */
export const PartNewPhotoSchema = v.strictObject({ isDefault: v.boolean() });
export type PartNewPhotoDto = v.InferOutput<typeof PartNewPhotoSchema>;

/**
 * PATCH: send only what changes; a field left out keeps its value. Sent as the `payload` field of a multipart request,
 * with the new photos as `photos` files, so the part and its photos are saved together. The part number is the
 * catalogue key and cannot change.
 *
 * - `photos`: when sent, the complete list of existing photos to keep; a photo left out is removed.
 * - `newPhotos`: one entry per uploaded file, in order.
 * - When the part has photos after the save, exactly one of them is the default.
 */
export const PartUpdateRequestSchema = v.strictObject({
  description: v.optional(
    v.pipe(v.string(), v.nonEmpty(), v.maxLength(500), v.metadata({ example: "Front brake pads, ceramic" })),
  ),
  unitPrice: v.optional(unitPrice),
  photos: v.optional(v.array(PartPhotoUpdateSchema)),
  newPhotos: v.optional(v.array(PartNewPhotoSchema)),
});
export type PartUpdateRequestDto = v.InferOutput<typeof PartUpdateRequestSchema>;
