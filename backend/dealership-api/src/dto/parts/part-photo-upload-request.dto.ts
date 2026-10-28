/** A photo as received from the multipart upload. */
export interface PartPhotoUploadRequestDto {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  content: Uint8Array;
}
