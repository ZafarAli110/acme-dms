import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {NORTHSIDE, RIVERSIDE, TEST_USER_ID} from '#persistence/__test__/postgres/seed-kit';

/** A signed-in user working at `locationId` with every permission the dealership service checks. */
export function userAt(locationId: string): UserContext {
  return {
    userId: TEST_USER_ID,
    dealerId: 'northwind',
    locationId,
    permissions: ['parts.read', 'parts.write', 'stock.read', 'stock.adjust', 'customers.read', 'customers.write'],
    accessToken: 't',
  };
}

export const AT_NORTHSIDE = userAt(NORTHSIDE);
export const AT_RIVERSIDE = userAt(RIVERSIDE);
