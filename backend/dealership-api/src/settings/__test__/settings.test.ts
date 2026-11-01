import {describe, expect, it} from 'vitest';
import {readSettings, requireSetting} from '../settings';

describe('readSettings', () => {
  it('uses the defaults when nothing is set, and null for what only Aspire or a deployment provides', () => {
    expect(readSettings({})).toEqual({
      port: 3000,
      logLevel: 'info',
      requestTimeoutMs: 30_000,
      databaseStatementTimeoutMs: 30_000,
      databaseMaxConnections: 10,
      databaseConnectionTimeoutMs: 10_000,
      dealershipDatabase: null,
      rabbitmq: null,
      identityApiUrl: null,
      documentApiUrl: null,
      otlpEndpoint: null,
      exportMaxRunning: 2,
      exportFileTtlMs: 900_000,
      exportDirectory: expect.stringContaining('acme-dealership-exports'),
      exportBatchSize: 20_000,
    });
  });

  it('reads durations in ms, s, m or h', () => {
    expect(readSettings({REQUEST_TIMEOUT: '45s', DATABASE_STATEMENT_TIMEOUT: '500ms'})).toMatchObject({
      requestTimeoutMs: 45_000,
      databaseStatementTimeoutMs: 500,
    });
    expect(readSettings({REQUEST_TIMEOUT: '2m'}).requestTimeoutMs).toBe(120_000);
  });

  it('refuses a value that is not a duration or a port, naming the variable', () => {
    expect(() => readSettings({REQUEST_TIMEOUT: 'thirty seconds'})).toThrow(/REQUEST_TIMEOUT/);
    expect(() => readSettings({PORT: 'eighty'})).toThrow(/PORT/);
    expect(() => readSettings({DATABASE_MAX_CONNECTIONS: '0'})).toThrow(/DATABASE_MAX_CONNECTIONS/);
  });

  it('says which variable is missing, for development and for a deployment', () => {
    expect(() => requireSetting(null, 'ConnectionStrings__dealership')).toThrow(
      /ConnectionStrings__dealership is not set: Aspire sets it .* a deployment sets it/,
    );
    expect(requireSetting('Host=db', 'ConnectionStrings__dealership')).toBe('Host=db');
  });
});
