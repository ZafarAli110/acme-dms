import {type ArgumentsHost, ConflictException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {ProblemDetailsDto} from '../../problem-details/problem-details.dto';
import {ProblemDetailsFilter} from '../problem-details.filter';

function captureProblem(exception: unknown): {status: number; contentType: string; body: ProblemDetailsDto} {
  const captured = {status: 0, contentType: '', body: ''};
  const response = {
    status(code: number) {
      captured.status = code;
      return response;
    },
    setHeader(_name: string, value: string) {
      captured.contentType = value;
    },
    end(body: string) {
      captured.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({method: 'POST', url: '/v1/parts', headers: {'x-location-id': 'northside'}}),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter(fixedClock()).catch(exception, host);
  return {
    status: captured.status,
    contentType: captured.contentType,
    body: JSON.parse(captured.body) as ProblemDetailsDto,
  };
}

describe('ProblemDetailsFilter', () => {
  it('maps a Nest HttpException to its status and URN type', () => {
    const {status, contentType, body} = captureProblem(
      new ConflictException('Part number already exists at this location'),
    );

    expect(status).toBe(409);
    expect(contentType).toBe('application/problem+json');
    expect(body.type).toBe('urn:acme:error:conflict');
    expect(body.detail).toBe('Part number already exists at this location');
    expect(body.instance).toBe('/v1/parts');
    expect(body.location).toBe('northside');
  });

  it('writes every contract field, using null rather than leaving one out', () => {
    const {body} = captureProblem(new ConflictException('duplicate'));

    expect(Object.keys(body).toSorted()).toEqual(
      ['detail', 'instance', 'location', 'status', 'timestamp', 'title', 'traceId', 'type', 'userId'].toSorted(),
    );
    expect(body.userId).toBeNull();
    expect(body.traceId).toBeNull();
  });

  it('hides the details of unexpected errors', () => {
    const {status, body} = captureProblem(new Error('connection string leaked here'));

    expect(status).toBe(500);
    expect(body.type).toBe('urn:acme:error:internal');
    expect(body.detail).toBe('An unexpected error occurred');
  });

  it('answers a broken unique rule with 409 and the rule in words, never the SQL or the constraint name', () => {
    const {status, body} = captureProblem(
      failedQuery({code: '23505', constraint: 'uq_parts_part_number', table: 'parts'}),
    );

    expect(status).toBe(409);
    expect(body.type).toBe('urn:acme:error:conflict');
    expect(body.detail).toBe('A part with this part number already exists in your catalogue.');
    expect(body.detail).not.toMatch(/uq_|INSERT|"parts"/);
  });

  it.each([
    ['23505', 409, 'A record with the same value already exists.'],
    ['23503', 409, 'This refers to a record that does not exist, or the record is still in use.'],
    ['23502', 400, 'A value is missing or not allowed.'],
    ['40001', 409, 'The record was changed at the same time by someone else. Try again.'],
    ['40P01', 409, 'The record was changed at the same time by someone else. Try again.'],
    ['55P03', 503, 'The database is busy or unavailable. Try again shortly.'],
    ['08006', 503, 'The database is busy or unavailable. Try again shortly.'],
  ])('maps SQLSTATE %s to %i', (code, expectedStatus, expectedDetail) => {
    const {status, body} = captureProblem(failedQuery({code}));

    expect(status).toBe(expectedStatus);
    expect(body.detail).toBe(expectedDetail);
  });

  it('recognises the PostgreSQL error when the driver throws it directly', () => {
    const postgresError = Object.assign(new Error('deadlock detected'), {severity: 'ERROR', code: '40P01'});

    expect(captureProblem(postgresError).status).toBe(409);
  });

  it('keeps an unknown database error a 500 with nothing leaked', () => {
    const {status, body} = captureProblem(failedQuery({code: 'XX000'}));

    expect(status).toBe(500);
    expect(body.detail).toBe('An unexpected error occurred');
  });
});

/** What Drizzle throws for a failed query: its own error, with the driver's PostgreSQL error as the cause. */
function failedQuery(fields: {code: string; constraint?: string; table?: string}): Error {
  const postgresError = Object.assign(new Error('duplicate key value violates unique constraint'), {
    severity: 'ERROR',
    ...fields,
  });
  return new Error('Failed query: insert into "parts" ...', {cause: postgresError});
}
