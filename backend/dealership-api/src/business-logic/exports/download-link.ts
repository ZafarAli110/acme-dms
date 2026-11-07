import { createHmac, timingSafeEqual } from "node:crypto";

// Signed with EXPORT_LINK_KEY (settings.ts), shared by every API instance: a link outlives a restart, and any instance
// accepts a link another handed out.
function signature(key: string, jobId: string, expires: number): string {
  return createHmac("sha256", key).update(`${jobId}.${expires}`).digest("base64url");
}

/** The download path for a finished export, valid until `expires` (epoch milliseconds). */
export function signedDownloadPath(key: string, jobId: string, expires: number): string {
  return `v1/exports/${jobId}/file?expires=${expires}&signature=${signature(key, jobId, expires)}`;
}

/** Whether a download link was signed here, for this job, and has not run out. */
export function isValidDownloadLink(
  key: string,
  jobId: string,
  expires: string,
  given: string,
  nowMs: number,
): boolean {
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < nowMs) {
    return false;
  }
  const expected = Buffer.from(signature(key, jobId, expiresAt));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
