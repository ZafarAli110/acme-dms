/**
 * The If-Match header of a save: the record's version as its ETag (`"7"`). The service refuses a save from a version
 * someone has replaced since (412), so one person's save never silently undoes another's.
 */
export function ifMatch(version: number): Record<string, string> {
  return { "if-match": `"${version}"` };
}

/**
 * The header that makes a save safe to send again (ACME-125): the service does it once per key, and answers the same
 * save sent again with the first one's answer. The key is the form's (`useSaveKey`), one per save the user means to make.
 */
export function idempotencyKey(key: string): Record<string, string> {
  return { "idempotency-key": key };
}
