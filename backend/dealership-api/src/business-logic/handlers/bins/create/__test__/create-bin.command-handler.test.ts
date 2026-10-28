import {ConflictException} from '@nestjs/common';
import {describe, expect, it, vi} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {Bin} from '#persistence/entities/bin.entity';
import type {IBinRepository} from '#persistence/repositories/bin.repository.interface';
import {CreateBinCommandHandler} from '../create-bin.command-handler';

const alice: UserContext = {
  userId: 'alice',
  dealerId: 'northwind',
  locationId: 'riverside',
  permissions: ['parts.write'],
  accessToken: 't',
};

function bins(codeTaken: boolean) {
  const saveAsync = vi.fn((_dealerId: string, bin: Bin) => Promise.resolve(bin));
  const repository = {
    existsWithCodeAsync: vi.fn().mockResolvedValue(codeTaken),
    saveAsync,
  } satisfies Partial<IBinRepository> as unknown as IBinRepository;
  return {repository, saveAsync};
}

describe('CreateBinCommandHandler', () => {
  it('adds the bin to the selected location', async () => {
    const {repository, saveAsync} = bins(false);

    await new CreateBinCommandHandler(repository, fixedClock()).executeAsync(alice, {
      code: 'R-9',
      description: 'Overflow',
    });

    expect(saveAsync).toHaveBeenCalledWith(
      'northwind',
      expect.objectContaining({locationId: 'riverside', code: 'R-9'}),
    );
  });

  it('refuses a code the location already uses', async () => {
    const {repository} = bins(true);

    await expect(
      new CreateBinCommandHandler(repository, fixedClock()).executeAsync(alice, {code: 'R-1', description: 'Counter'}),
    ).rejects.toThrow(ConflictException);
  });
});
