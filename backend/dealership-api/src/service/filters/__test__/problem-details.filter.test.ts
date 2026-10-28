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
});
