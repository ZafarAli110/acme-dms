import {expect, type APIRequestContext, type Page} from '@playwright/test';

export const DEMO_PASSWORD = 'Acme123!';
export const ALICE = 'alice@northwind.test';

/** A name no seeded record has, so a test only ever changes what it created. */
export function throwawayName(what: string): string {
  return `e2e-${what}-${Date.now().toString(36)}`;
}

/** Signs in through the sign-in page, as a person would, and waits for Home. */
export async function signInAsync(page: Page, email = ALICE): Promise<void> {
  await page.goto('/sign-in');
  // By field name rather than label, so it works in any language.
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}

/** Creates a throwaway part at alice's first location, in one of its bins, through the API (the web app's proxy). */
export async function createPartAsync(request: APIRequestContext): Promise<{id: string; partNumber: string}> {
  const tokens = await request.post('/api/identity/v1/tokens', {data: {email: ALICE, password: DEMO_PASSWORD}});
  const {accessToken} = (await tokens.json()) as {accessToken: string};
  const headers = {authorization: `Bearer ${accessToken}`};
  const me = (await (await request.get('/api/identity/v1/users/me', {headers})).json()) as {locations: {id: string}[]};
  const atLocation = {...headers, 'x-location-id': me.locations[0]!.id};
  const bins = (await (await request.get('/api/dealership/v1/bins', {headers: atLocation})).json()) as {id: string}[];
  const partNumber = throwawayName('part').toUpperCase();
  const created = await request.post('/api/dealership/v1/parts', {
    headers: atLocation,
    data: {
      partNumber,
      description: 'Throwaway part',
      unitPrice: 1,
      binId: bins[0]!.id,
      quantityOnHand: 1,
      reorderLevel: 0,
    },
  });
  expect(created.status()).toBe(201);
  return {id: ((await created.json()) as {id: string}).id, partNumber};
}
