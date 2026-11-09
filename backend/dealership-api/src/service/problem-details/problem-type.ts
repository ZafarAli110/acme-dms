import { HttpStatus } from "@nestjs/common";

/** Stable, machine-readable error identifiers used as the problem details `type`. */
export const PROBLEM_TYPE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "urn:acme:error:validation",
  [HttpStatus.UNAUTHORIZED]: "urn:acme:error:unauthorized",
  [HttpStatus.FORBIDDEN]: "urn:acme:error:forbidden",
  [HttpStatus.NOT_FOUND]: "urn:acme:error:not-found",
  [HttpStatus.CONFLICT]: "urn:acme:error:conflict",
  [HttpStatus.PRECONDITION_FAILED]: "urn:acme:error:precondition-failed",
  [HttpStatus.PRECONDITION_REQUIRED]: "urn:acme:error:precondition-required",
  [HttpStatus.TOO_MANY_REQUESTS]: "urn:acme:error:too-many-requests",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "urn:acme:error:internal",
  [HttpStatus.SERVICE_UNAVAILABLE]: "urn:acme:error:service-unavailable",
};

export const DEFAULT_PROBLEM_TYPE = "urn:acme:error:internal";

/** Problem types more precise than their status (ACME-125: saves sent with an Idempotency-Key). */
export const PROBLEM_TYPE = {
  /** 409: a save with this key is still running; `Retry-After` says when to send it again. */
  saveInProgress: "urn:acme:error:save-in-progress",
  /** 409: a save with this key already went through, from another request; `resource` is where it is read. */
  saveWentThrough: "urn:acme:error:save-went-through",
  /** 422: the Idempotency-Key is not 1 to 255 printable characters. */
  idempotencyKey: "urn:acme:error:idempotency-key",
} as const;
