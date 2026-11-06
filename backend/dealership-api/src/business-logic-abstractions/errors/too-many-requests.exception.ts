import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * 429: the caller has reached a limit that frees up by itself (an export finishing). `retryAfterSeconds` becomes the
 * response's `Retry-After` header (RFC 9110), so a client knows when trying again makes sense. A type the business
 * logic throws and the service's problem-details filter reads, which is why it lives in the abstractions.
 */
export class TooManyRequestsException extends HttpException {
  public readonly retryAfterSeconds: number;

  public constructor(message: string, retryAfterSeconds: number) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
