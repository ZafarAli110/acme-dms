import {describe, expect, it} from 'vitest';
import {toPostgresUrl} from '../connection-string';

describe('toPostgresUrl', () => {
  it("turns Aspire's key=value connection string into a postgres URL", () => {
    expect(toPostgresUrl('Host=localhost;Port=56789;Username=acme;Password=acme;Database=dealership')).toBe(
      'postgres://acme:acme@localhost:56789/dealership',
    );
  });

  it('encodes a password with characters a URL reserves', () => {
    expect(toPostgresUrl('Host=db;Port=5432;Username=acme;Password=p@ss/word;Database=dealership')).toBe(
      'postgres://acme:p%40ss%2Fword@db:5432/dealership',
    );
  });

  it('passes a postgres URL through as it is', () => {
    expect(toPostgresUrl('postgres://acme:acme@localhost:5432/dealership')).toBe(
      'postgres://acme:acme@localhost:5432/dealership',
    );
  });
});
