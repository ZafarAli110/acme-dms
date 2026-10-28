import {type NestInterceptor, type Type} from '@nestjs/common';
import {FileInterceptor, FilesInterceptor} from '@nestjs/platform-node';

/** The file as the HTTP adapter's multipart parser hands it over (kept in memory, never written to disk). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Parses one multipart file field. The only place outside main.ts that knows which HTTP adapter is in use, so
 * switching adapters changes this file and main.ts, nothing else. Limits here are transport guardrails; the
 * feature rules (types, size, count) live in the business handler.
 */
export function SingleFileUpload(field: string, maxBytes: number): Type<NestInterceptor> {
  return FileInterceptor(field, {limits: {fileSize: maxBytes, files: 1, fields: 5}});
}

/** Parses up to `maxFiles` files from one multipart field, plus the form's text fields (such as a JSON `payload`). */
export function MultipleFilesUpload(field: string, maxFiles: number, maxBytes: number): Type<NestInterceptor> {
  return FilesInterceptor(field, maxFiles, {limits: {fileSize: maxBytes, files: maxFiles, fields: 5}});
}

/**
 * The file's name as the user saw it. The multipart parser reads file names as Latin-1, so a UTF-8 name (an accent,
 * or the narrow space in a macOS screenshot's name) arrives garbled; this turns it back into UTF-8.
 */
export function uploadedFileName(file: UploadedFileLike): string {
  const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
  // A name that was not UTF-8 to begin with would not survive the round trip; keep it as it came.
  return decoded.includes('\uFFFD') ? file.originalname : decoded;
}
