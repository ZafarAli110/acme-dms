import {describe, expect, it} from 'vitest';
import {GetUserContextQueryHandler} from '../get-user-context.query-handler';

describe('GetUserContextQueryHandler', () => {
  it('returns the user context as resolved from the token and location header, without the token itself', async () => {
    const userContext = {
      userId: 'u1',
      locationId: 'l1',
      permissions: ['parts.read'],
      accessToken: 'secret',
    };

    await expect(new GetUserContextQueryHandler().executeAsync(userContext)).resolves.toEqual({
      userId: 'u1',
      locationId: 'l1',
      permissions: ['parts.read'],
    });
  });
});
