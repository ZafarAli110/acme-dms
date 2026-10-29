import {expect, type APIRequestContext, type Page} from '@playwright/test';

export const DEMO_PASSWORD = 'Acme123!';
/** A service advisor at Northside and Riverside. */
export const SAM = 'sam@northwind.test';
/** A service advisor at Riverside and Westgate. */
export const RITA = 'rita@northwind.test';
/** The manager: she works at all three rooftops and may add parts. */
export const MARIA = 'maria@northwind.test';

const SURNAMES = ['Ackroyd', 'Barraclough', 'Crowther', 'Fairclough', 'Greenwood', 'Hargreaves', 'Lockwood', 'Ormerod'];
const PART_FAMILIES = ['FLT-OIL', 'BRK-PAD', 'WPR-BLD', 'BLT-AUX', 'LMP-H7', 'FLT-AIR'];

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

/**
 * A surname for a customer a test creates. It reads like a real one, because the records a test leaves behind show in
 * the app afterwards; a test finds its record by the page it lands on, never by searching for the name.
 */
export function throwawaySurname(): string {
  return `${pick(SURNAMES)}-${pick(SURNAMES)}`;
}

/** A part number in the catalogue's style, unique enough for the unique index (`BRK-PAD-482913`). */
export function throwawayPartNumber(): string {
  return `${pick(PART_FAMILIES)}-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}

/** Signs in through the sign-in page, as a person would, and waits for Home. */
export async function signInAsync(page: Page, email = MARIA): Promise<void> {
  await page.goto('/sign-in');
  // By field name rather than label, so it works in any language.
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}

/** Creates a throwaway part at maria's first location, in one of its bins, through the API (the web app's proxy). */
export async function createPartAsync(request: APIRequestContext): Promise<{id: string; partNumber: string}> {
  const tokens = await request.post('/api/identity/v1/tokens', {data: {email: MARIA, password: DEMO_PASSWORD}});
  const {accessToken} = (await tokens.json()) as {accessToken: string};
  const headers = {authorization: `Bearer ${accessToken}`};
  const me = (await (await request.get('/api/identity/v1/users/me', {headers})).json()) as {locations: {id: string}[]};
  const atLocation = {...headers, 'x-location-id': me.locations[0]!.id};
  const bins = (await (await request.get('/api/dealership/v1/bins', {headers: atLocation})).json()) as {id: string}[];
  const partNumber = throwawayPartNumber();
  const created = await request.post('/api/dealership/v1/parts', {
    headers: atLocation,
    data: {
      partNumber,
      description: 'Oil filter, spin-on',
      unitPrice: 1,
      binId: bins[0]!.id,
      quantityOnHand: 1,
      reorderLevel: 0,
    },
  });
  expect(created.status()).toBe(201);
  return {id: ((await created.json()) as {id: string}).id, partNumber};
}
