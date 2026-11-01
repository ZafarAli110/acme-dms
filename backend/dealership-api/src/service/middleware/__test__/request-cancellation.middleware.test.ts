import {EventEmitter} from 'node:events';
import {ResilienceContext} from '@nestjs/resilience';
import {describe, expect, it} from 'vitest';
import {RequestCancellationMiddleware} from '../request-cancellation.middleware';

/** A response that can close with or without having been sent. */
function response(finished: boolean) {
  return Object.assign(new EventEmitter(), {writableFinished: finished});
}

describe('RequestCancellationMiddleware', () => {
  const context = new ResilienceContext();

  it('aborts the request signal when the caller goes away before the answer is sent', () => {
    const res = response(false);
    let signal: AbortSignal | undefined;

    new RequestCancellationMiddleware(context).use(null, res, () => {
      signal = context.signal;
    });
    res.emit('close');

    expect(signal?.aborted).toBe(true);
  });

  it('leaves the signal alone when the answer was sent', () => {
    const res = response(true);
    let signal: AbortSignal | undefined;

    new RequestCancellationMiddleware(context).use(null, res, () => {
      signal = context.signal;
    });
    res.emit('close');

    expect(signal?.aborted).toBe(false);
  });
});
