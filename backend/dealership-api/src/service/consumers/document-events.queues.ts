// dealership-api's own queues for document-api's events: the consumer declares them; the replay script
// (scripts/replay-dead-letters.ts) reads them. Kept apart from the consumer so a script can import them.

/** document-api's events for part photos arrive here. */
export const QUEUE = "dealership-api.document-events";
/** Events that failed every retry, or can never be handled, are parked here until someone replays them. */
export const DEAD_LETTER_QUEUE = "dealership-api.document-events.dlq";
/** How many times an event has been retried. */
export const RETRIES_HEADER = "x-retries";
