import {describe, expect, it} from 'vitest';
import {GetHealthQueryHandler} from '../get-health.query-handler';

describe('GetHealthQueryHandler', () => {
  it('reports ok with the process uptime', async () => {
    const response = await new GetHealthQueryHandler().executeAsync();

    expect(response.status).toBe('ok');
    expect(response.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
