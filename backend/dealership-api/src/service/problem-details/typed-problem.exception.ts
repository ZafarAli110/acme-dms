import { HttpException } from "@nestjs/common";
import type { LocalizedMessage } from "#i18n/messages";

/** Members a problem carries beyond the standard ones: a "went-through" save's `resource` (ACME-125). */
export interface ProblemExtensions {
  /** Where the saved record is read (`/v1/customers/{id}`); null when it is not known. */
  resource: string | null;
}

/**
 * An error whose status alone does not say what happened, so it carries a problem type of its own (ACME-125: a save
 * still running and a save already gone through are both 409s, and the client acts differently on each). The
 * problem-details filter sends `type`, `Retry-After` when given, and the extension members when there are any
 * (`docs/standards/api-errors.md`).
 */
export class TypedProblemException extends HttpException {
  public readonly problemType: string;
  public readonly retryAfterSeconds: number | null;
  public readonly extensions: ProblemExtensions | null;

  public constructor(
    status: number,
    problemType: string,
    message: LocalizedMessage,
    options: { retryAfterSeconds?: number; extensions?: ProblemExtensions; cause?: unknown } = {},
  ) {
    super(message, status, { cause: options.cause });
    this.problemType = problemType;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.extensions = options.extensions ?? null;
  }
}
