import {HttpStatus} from '@nestjs/common';

/** Stable, machine-readable error identifiers used as the problem details `type`. */
export const PROBLEM_TYPE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'urn:acme:error:validation',
  [HttpStatus.UNAUTHORIZED]: 'urn:acme:error:unauthorized',
  [HttpStatus.FORBIDDEN]: 'urn:acme:error:forbidden',
  [HttpStatus.NOT_FOUND]: 'urn:acme:error:not-found',
  [HttpStatus.CONFLICT]: 'urn:acme:error:conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'urn:acme:error:too-many-requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'urn:acme:error:internal',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'urn:acme:error:service-unavailable',
};

export const DEFAULT_PROBLEM_TYPE = 'urn:acme:error:internal';
