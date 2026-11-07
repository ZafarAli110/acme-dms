import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { describe, expect, it, vi } from "vitest";
import { readSettings } from "#settings/settings";
import { DocumentEventsConsumer } from "../document-events.consumer";

/** A message as RabbitMQ delivers it: the envelope as JSON, and the retries so far in its headers. */
function delivery(type: string, retries?: number): ConsumeMessage {
  const envelope = { messageId: crypto.randomUUID(), type, occurredAt: "", correlationId: null, data: {} };
  return {
    content: Buffer.from(JSON.stringify(envelope)),
    fields: { routingKey: type },
    properties: { headers: retries === undefined ? {} : { "x-retries": retries } },
  } as unknown as ConsumeMessage;
}

function fakeChannel() {
  return {
    sendToQueue: vi.fn(() => true),
    waitForConfirms: vi.fn(() => Promise.resolve()),
    ack: vi.fn(),
    nack: vi.fn(),
  };
}

/** The consumer with a photo handler that fails, as it does while the database is out of reach. */
function consumerWhoseHandlerFails() {
  const failing = { executeAsync: vi.fn(() => Promise.reject(new Error("connection refused"))) };
  const consumer = new DocumentEventsConsumer(failing, failing, readSettings({}));
  const internals = consumer as unknown as {
    handleAsync(channel: ConfirmChannel, message: ConsumeMessage): Promise<void>;
  };
  return (channel: ReturnType<typeof fakeChannel>, message: ConsumeMessage) =>
    internals.handleAsync(channel as unknown as ConfirmChannel, message);
}

describe("DocumentEventsConsumer", () => {
  it("sends an event whose handler failed to wait and be tried again, and only then acknowledges it", async () => {
    const channel = fakeChannel();

    await consumerWhoseHandlerFails()(channel, delivery("document.processed.v1"));

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      "dealership-api.document-events.retry",
      expect.any(Buffer),
      expect.objectContaining({ headers: { "x-retries": 1 } }),
    );
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("dead-letters an event that failed on every try", async () => {
    const channel = fakeChannel();

    await consumerWhoseHandlerFails()(channel, delivery("document.processed.v1", 5));

    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it("dead-letters a message it can never handle at once, without retrying", async () => {
    const channel = fakeChannel();

    await consumerWhoseHandlerFails()(channel, delivery("document.unknown.v1"));

    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it("parks an event that failed every retry: the dead-letter queue listens for the key a retried event carries", async () => {
    const binds: [string, string, string][] = [];
    const channel = {
      assertExchange: vi.fn(() => Promise.resolve()),
      assertQueue: vi.fn(() => Promise.resolve()),
      bindQueue: vi.fn((queue: string, exchange: string, key: string) => {
        binds.push([queue, exchange, key]);
        return Promise.resolve();
      }),
    };
    const consumer = new DocumentEventsConsumer(
      { executeAsync: vi.fn() },
      { executeAsync: vi.fn() },
      readSettings({}),
    ) as unknown as { declareTopologyAsync(channel: ConfirmChannel): Promise<void> };

    await consumer.declareTopologyAsync(channel as unknown as ConfirmChannel);

    // A retried event comes back from the retry queue with the main queue's name as its routing key.
    expect(binds).toContainEqual([
      "dealership-api.document-events.dlq",
      "acme.documents.dlx",
      "dealership-api.document-events",
    ]);
  });
});
