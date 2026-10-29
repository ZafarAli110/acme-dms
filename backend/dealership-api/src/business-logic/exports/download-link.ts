import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

// Signs with a key made when the service starts: a link outlives neither the file nor a restart. Several instances
// behind one gateway would share the key from configuration instead.
const KEY = randomBytes(32);

function signature(jobId: string, expires: number): string {
  return createHmac('sha256', KEY).update(`${jobId}.${expires}`).digest('base64url');
}

/** The download path for a finished export, valid until `expires` (epoch milliseconds). */
export function signedDownloadPath(jobId: string, expires: number): string {
  return `v1/exports/${jobId}/file?expires=${expires}&signature=${signature(jobId, expires)}`;
}

/** Whether a download link was signed here, for this job, and has not run out. */
export function isValidDownloadLink(jobId: string, expires: string, given: string, nowMs: number): boolean {
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < nowMs) {
    return false;
  }
  const expected = Buffer.from(signature(jobId, expiresAt));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
