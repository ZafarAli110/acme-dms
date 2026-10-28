# Messaging

Contracts (envelope, exchanges, queues, messages) are in `contracts/README.md`. This is how to produce and consume them.

## Publishing: always through the outbox

Never publish to RabbitMQ directly from a handler. Saving data and publishing are two separate writes; if one fails the
other is wrong (a message for a change that rolled back, or a change nobody hears about).

1. The handler adds the message to the outbox (`IOutbox.Add(type, data)`) **in the same transaction** as the change.
2. The outbox relay publishes it, with broker confirmation, and marks it published.
3. The relay continues the trace of the request that wrote the message, so one trace shows the whole flow.

## Consuming

- **Idempotent.** A message can arrive twice. Record the `messageId` (the `processed_messages` inbox table) in the same
  transaction as the change, and do nothing the second time — or make the change naturally idempotent (check the
  current status first).
- **Retries are bounded.** document-api retries a failed work item three times with growing delays, then marks the
  document failed, publishes `document.failed.v1` and dead-letters the message.
- **Unknown messages are dead-lettered**, never retried forever and never silently acknowledged. Inspect `*.dlq` queues
  in the RabbitMQ UI.
- Consumers are inbound adapters, like controllers: they parse the envelope and call one business handler.

## Done means processed

An endpoint that returns `202 Accepted` has only _queued_ work. A change involving a queue is finished when the
work has completed: the status on the record says so, the trace shows the consumer's span, and nothing new is in a
dead-letter queue.
