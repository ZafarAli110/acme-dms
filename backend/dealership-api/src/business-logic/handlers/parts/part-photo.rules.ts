import {BadRequestException} from '@nestjs/common';
import type {DocumentVariantSpec} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';

// Feature rules for part photos (docs/standards/file-uploads.md). document-api only stores and processes.
export const PART_PHOTO_OWNER_TYPE = 'part';
export const ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_PART = 10;
export const PART_PHOTO_VARIANTS: DocumentVariantSpec[] = [
  {name: 'display', maxDimension: 1200, quality: 82},
  {name: 'thumb', maxDimension: 150, quality: 75},
];

/** Throws 400 naming the file when it is not an allowed image type or is too large. */
export function validatePhotoFile(file: PartPhotoUploadRequestDto): void {
  if (!ALLOWED_PHOTO_TYPES.has(file.contentType)) {
    throw new BadRequestException(
      `${file.fileName}: file type ${file.contentType} not allowed. Allowed: ${[...ALLOWED_PHOTO_TYPES].join(', ')}.`,
    );
  }
  if (file.sizeBytes > MAX_PHOTO_BYTES) {
    throw new BadRequestException(
      `${file.fileName}: file too large. Maximum size: ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
    );
  }
}
