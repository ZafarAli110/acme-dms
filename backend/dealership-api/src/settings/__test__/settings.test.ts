import {describe, expect, it} from 'vitest';
import {readSettings} from '../settings';

describe('readSettings', () => {
  it('uses the defaults when nothing is set', () => {
    expect(readSettings({})).toEqual({requestTimeoutMs: 30_000, databaseStatementTimeoutMs: 30_000});
  });

  it('reads durations in ms, s, m or h', () => {
    expect(readSettings({REQUEST_TIMEOUT: '45s', DATABASE_STATEMENT_TIMEOUT: '500ms'})).toEqual({
      requestTimeoutMs: 45_000,
      databaseStatementTimeoutMs: 500,
    });
    expect(readSettings({REQUEST_TIMEOUT: '2m'}).requestTimeoutMs).toBe(120_000);
  });

  it('refuses a value that is not a duration, naming the setting', () => {
    expect(() => readSettings({REQUEST_TIMEOUT: 'thirty seconds'})).toThrow(/REQUEST_TIMEOUT/);
  });
});
