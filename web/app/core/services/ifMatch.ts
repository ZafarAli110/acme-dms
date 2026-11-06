/**
 * The If-Match header of a save: the record's version as its ETag (`"7"`). The service refuses a save from a version
 * someone has replaced since (412), so one person's save never silently undoes another's.
 */
export function ifMatch(version: number): Record<string, string> {
  return { "if-match": `"${version}"` };
}
