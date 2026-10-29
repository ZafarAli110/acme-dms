import {ConflictException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#test-setup/time/fixed-clock';
import {AT_NORTHSIDE, AT_RIVERSIDE} from '#test-setup/users/test-users';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {CreateBinCommandHandler} from '../create-bin.command-handler';

describe('CreateBinCommandHandler', () => {
  const database = useTestDatabase();

  function handler(): CreateBinCommandHandler {
    return new CreateBinCommandHandler(database.unitOfWorkFactory, fixedClock());
  }

  it('creates the bin at the selected location', async () => {
    const bin = await handler().executeAsync(AT_NORTHSIDE, {code: 'A-01', description: 'Brakes'});

    expect(bin).toMatchObject({code: 'A-01', description: 'Brakes'});
    expect(bin.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('rejects a code already used at this location', async () => {
    await handler().executeAsync(AT_NORTHSIDE, {code: 'A-02', description: 'Filters'});

    await expect(handler().executeAsync(AT_NORTHSIDE, {code: 'A-02', description: 'Filters'})).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows the same code at another location', async () => {
    await handler().executeAsync(AT_NORTHSIDE, {code: 'A-03', description: 'Oil'});

    await expect(handler().executeAsync(AT_RIVERSIDE, {code: 'A-03', description: 'Oil'})).resolves.toMatchObject({
      code: 'A-03',
    });
  });
});
