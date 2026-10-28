import {QueryFailedError} from 'typeorm';
import {describe, expect, it} from 'vitest';
import {CAUSE_DEPTH_REACHED, MAX_ERROR_CAUSE_DEPTH, serializeError} from '../serialize-error';

describe('serializeError', () => {
  it('follows the cause chain, with the database fields of a failed query', () => {
    const driverError = Object.assign(new Error('duplicate key'), {code: '23505', constraint: 'uq_bins_location_code'});
    const failed = new QueryFailedError('INSERT ...', [], driverError);
    const wrapped = new Error('Could not save the bin', {cause: failed});

    const serialized = serializeError(wrapped) as {message: string; cause: Record<string, unknown>};

    expect(serialized.message).toBe('Could not save the bin');
    expect(serialized.cause['code']).toBe('23505');
    expect(serialized.cause['constraint']).toBe('uq_bins_location_code');
  });

  it(`stops after ${MAX_ERROR_CAUSE_DEPTH} causes, so a cyclic chain cannot flood the log`, () => {
    const first = new Error('first');
    const second = new Error('second', {cause: first});
    first.cause = second;

    let level = serializeError(first) as {cause?: unknown};
    for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth++) {
      level = level.cause as {cause?: unknown};
    }

    expect(level.cause).toBe(CAUSE_DEPTH_REACHED);
  });

  it('passes anything that is not an Error through as it is', () => {
    expect(serializeError({reason: 'odd'})).toEqual({reason: 'odd'});
  });
});
