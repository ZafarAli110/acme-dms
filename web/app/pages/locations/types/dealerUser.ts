/** Someone at the dealer, as the manager's Locations page shows them. */
export interface DealerUser {
  id: string;
  email: string;
  displayName: string;
  /** Their job, the same at every location they work at. */
  role: string;
  locationIds: string[];
}

export interface DealerLocation {
  id: string;
  code: string;
  name: string;
}

/** What one assignment switch asks for. */
export type AssignmentIntent = 'assign' | 'unassign';

/** What the route's clientAction answers a switch: the API's message when it refused. */
export interface AssignmentResult {
  error: string | null;
}
