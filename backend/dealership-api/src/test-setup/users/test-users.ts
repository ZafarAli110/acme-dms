import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {NORTHSIDE, RIVERSIDE, TEST_USER_ID} from '#test-setup/postgres/seed-kit';

/**
 * The access token a handler forwards when it calls another service for the user (document-api). Tests never send it
 * anywhere real; FakeDocumentApi takes it as it is.
 */
export const TEST_ACCESS_TOKEN = 'test-access-token';

/**
 * Someone signed in and working at `locationId`, as a handler receives them. No permissions: handlers don't check
 * them, the authorization guard does before a handler runs (authorization.guard.test.ts covers that).
 */
export function userAt(locationId: string): UserContext {
  return {userId: TEST_USER_ID, locationId, permissions: [], accessToken: TEST_ACCESS_TOKEN};
}

export const AT_NORTHSIDE = userAt(NORTHSIDE);
export const AT_RIVERSIDE = userAt(RIVERSIDE);
