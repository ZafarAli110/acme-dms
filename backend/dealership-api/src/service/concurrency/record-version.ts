import {
  createParamDecorator,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  PreconditionFailedException,
} from "@nestjs/common";
import { localized } from "#i18n/messages";

type HeaderRequest = { headers: Record<string, string | string[] | undefined> };

/**
 * A record's ETag is its version, quoted as RFC 9110 writes an entity tag: version 7 is `"7"`. Strong, because two
 * answers with one version are the same record byte for byte.
 */
export function etagOf(version: number): string {
  return `"${version}"`;
}

/** The record's version when the body is one (it has a numeric `version`), else null. */
export function versionOf(body: unknown): number | null {
  if (typeof body !== "object" || body === null || !("version" in body)) {
    return null;
  }
  return typeof body.version === "number" ? body.version : null;
}

/** Whether If-None-Match names this ETag (or is `*`). A weak tag (`W/"7"`) matches too, as RFC 9110 allows here. */
export function matchesIfNoneMatch(header: string | string[] | undefined, etag: string): boolean {
  if (typeof header !== "string") {
    return false;
  }
  return header.split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || tag.replace(/^W\//, "") === etag;
  });
}

/**
 * The version a save started from, from its If-Match header, so that a save made from an older version is refused
 * (412) instead of silently undoing someone else's change. No header is 428 Precondition Required: every save must
 * say what it saw. `*` (any current version) is null: the save goes ahead whatever the version.
 *
 *   public updateAsync(@IfMatchVersion() expectedVersion: number | null, …)
 */
export const IfMatchVersion = createParamDecorator((_data: unknown, context: ExecutionContext): number | null => {
  const header = context.switchToHttp().getRequest<HeaderRequest>().headers["if-match"];
  const value = typeof header === "string" ? header.trim() : "";
  if (value === "") {
    throw new HttpException(localized("errors.ifMatchRequired"), HttpStatus.PRECONDITION_REQUIRED);
  }
  if (value === "*") {
    return null;
  }
  const match = /^"(\d+)"$/.exec(value);
  if (!match) {
    throw new PreconditionFailedException(localized("errors.ifMatchInvalid"));
  }
  return Number(match[1]);
});

/**
 * 304 Not Modified: the client already has this version. Thrown by the ETag interceptor and answered by the
 * problem-details filter, which sends the status and the ETag with no body: Nest sets each route's own status when
 * it replies, after interceptors run, so an interceptor cannot answer 304 by itself.
 */
export class NotModifiedException extends HttpException {
  public readonly etag: string;

  public constructor(etag: string) {
    super("Not Modified", HttpStatus.NOT_MODIFIED);
    this.etag = etag;
  }
}
