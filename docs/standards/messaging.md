# Messaging

Contracts (envelope, exchanges, queues, messages) are in `docs/contracts.md`. This is how to produce and consume them.

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
- **Retries are bounded, and wait in a retry queue.** A failed work item waits in a retry queue (a TTL queue that
  expires back to the work queue) rather than holding a consumer: document-api tries 6 times, 10 s apart, dealership-api
  6 times, 5 s apart, so a passing outage of a minute or less fails nothing.
- **A final state is not dead-lettered.** When document-api gives up, it marks the document failed (final) and
  publishes `document.failed.v1`, then acknowledges the message: a replay could not revive it. The dead-letter queue
  holds only what a replay can still do: a message whose failure could not even be recorded, or one nobody understood.
  Every routing key a message can carry when it is dead-lettered (its type, or a queue's own name after a retry or a
  replay) is bound to the dead-letter queue, or RabbitMQ drops it.
- **Unknown messages are dead-lettered**, never retried forever and never silently acknowledged. Inspect `*.dlq` queues
  in the RabbitMQ UI.
- Consumers are inbound adapters, like controllers: they parse the envelope and call one business handler.

## Done means processed

An endpoint that returns `202 Accepted` has only _queued_ work. A change involving a queue is finished when the
work has completed: the status on the record says so, the trace shows the consumer's span, and nothing new is in a
dead-letter queue.
